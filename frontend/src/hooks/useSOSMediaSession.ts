import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveApiPath } from '../lib/apiClient'

type CameraFacing = 'user' | 'environment'

type SOSSessionState = 'idle' | 'initializing' | 'recording' | 'paused' | 'stopped' | 'error'

function chooseMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

async function readLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  return await new Promise<{ lat: number; lng: number } | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 },
    )
  })
}

export function useSOSMediaSession() {
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('user')
  const [status, setStatus] = useState<SOSSessionState>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadCount, setUploadCount] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [noiseLevelDb, setNoiseLevelDb] = useState(-60)
  const [estimatedRoomDbSPL, setEstimatedRoomDbSPL] = useState(45)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [highDecibelAlert, setHighDecibelAlert] = useState(false)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const meterFrameRef = useRef<number | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const cameraFacingRef = useRef<CameraFacing>('user')
  const chunkIndexRef = useRef(0)
  const uploadChainRef = useRef(Promise.resolve())
  const mountedRef = useRef(true)
  const calibrationOffsetRef = useRef(105)
  const highDecibelFrameCountRef = useRef(0)
  const calibrationSessionRef = useRef(0)

  const readCalibrationOffset = useCallback(() => {
    if (typeof window === 'undefined') return 105
    try {
      const raw = window.localStorage.getItem('triparc:sos:mic-calibration:v2')
      if (!raw) return 105
      const parsed = JSON.parse(raw) as { offset?: number }
      return typeof parsed.offset === 'number' ? parsed.offset : 105
    } catch {
      return 105
    }
  }, [])

  const saveCalibrationOffset = useCallback((offset: number) => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('triparc:sos:mic-calibration:v2', JSON.stringify({ offset }))
    } catch {}
  }, [])

  useEffect(() => {
    cameraFacingRef.current = cameraFacing
  }, [cameraFacing])

  useEffect(() => {
    calibrationOffsetRef.current = readCalibrationOffset()
  }, [readCalibrationOffset])

  const stopNoiseMeter = useCallback(() => {
    if (meterFrameRef.current != null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(meterFrameRef.current)
      meterFrameRef.current = null
    }
    try {
      sourceRef.current?.disconnect()
    } catch {}
    try {
      analyserRef.current?.disconnect()
    } catch {}
    sourceRef.current = null
    analyserRef.current = null
    try {
      audioContextRef.current?.close()
    } catch {}
    audioContextRef.current = null
  }, [])

  const cleanupStream = useCallback(() => {
    try {
      recorderRef.current?.stop()
    } catch {}
    recorderRef.current = null
    stopNoiseMeter()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setMediaStream(null)
  }, [stopNoiseMeter])

  const ensureSession = useCallback(async (facing: CameraFacing) => {
    if (sessionIdRef.current) return sessionIdRef.current
    const location = await readLocation()
    const response = await fetch(resolveApiPath('/api/sos/sessions/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'SOS Active',
        cameraFacing: facing,
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        location: location || undefined,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`SOS session start failed: ${response.status} ${text}`)
    }

    const data = await response.json() as { sessionId?: string }
    if (!data.sessionId) throw new Error('SOS session start returned no sessionId')
    sessionIdRef.current = data.sessionId
    if (mountedRef.current) setSessionId(data.sessionId)
    return data.sessionId
  }, [])

  const uploadChunk = useCallback(async (chunk: Blob, chunkIndex: number, facing: CameraFacing, recorderState: string) => {
    const sid = sessionIdRef.current
    if (!sid || !chunk.size) return

    const formData = new FormData()
    formData.append('chunk', chunk, `chunk-${chunkIndex}.webm`)
    formData.append('chunkIndex', String(chunkIndex))
    formData.append('cameraFacing', facing)
    formData.append('recordingState', recorderState)
    formData.append('timestamp', new Date().toISOString())

    const response = await fetch(resolveApiPath(`/api/sos/sessions/${sid}/chunks`), {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`SOS chunk upload failed: ${response.status} ${text}`)
    }
  }, [])

  const queueUpload = useCallback((chunk: Blob, facing: CameraFacing, recorderState: string) => {
    const chunkIndex = chunkIndexRef.current++
    uploadChainRef.current = uploadChainRef.current
      .then(async () => {
        setIsUploading(true)
        await uploadChunk(chunk, chunkIndex, facing, recorderState)
        if (mountedRef.current) setUploadCount((count) => count + 1)
      })
      .catch((err) => {
        console.error('SOS upload failed', err)
        if (mountedRef.current) setError((err as Error)?.message || 'SOS upload failed')
      })
      .finally(() => {
        if (mountedRef.current) setIsUploading(false)
      })
  }, [uploadChunk])

  const startStream = useCallback(async (facing: CameraFacing) => {
    setStatus('initializing')
    setError(null)
    cleanupStream()

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('Camera/microphone not supported in this browser')
      return
    }

    try {
      await ensureSession(facing)
    } catch (err) {
      console.error(err)
      if (mountedRef.current) {
        setError((err as Error)?.message || 'Unable to create SOS upload session')
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      setMediaStream(stream)

      stopNoiseMeter()
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AudioContextCtor && stream.getAudioTracks().length > 0) {
        const audioContext = new AudioContextCtor()
        await audioContext.resume().catch(() => {})
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 2048
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        audioContextRef.current = audioContext
        analyserRef.current = analyser
        sourceRef.current = source

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        const updateNoise = () => {
          if (!analyserRef.current || !mountedRef.current) return
          analyserRef.current.getByteTimeDomainData(dataArray)
          let sumSquares = 0
          for (let i = 0; i < dataArray.length; i += 1) {
            const normalized = (dataArray[i] - 128) / 128
            sumSquares += normalized * normalized
          }
          const rms = Math.sqrt(sumSquares / dataArray.length)
          const dbfs = rms > 0 ? 20 * Math.log10(rms) : -60
          const clampedDbfs = Math.max(-60, Math.min(0, dbfs))
          const estimatedSpl = Math.max(30, Math.min(130, Math.round(clampedDbfs + calibrationOffsetRef.current)))
          setNoiseLevelDb(clampedDbfs)
          setEstimatedRoomDbSPL(estimatedSpl)
          if (estimatedSpl >= 85) {
            highDecibelFrameCountRef.current += 1
          } else {
            highDecibelFrameCountRef.current = 0
          }
          setHighDecibelAlert(highDecibelFrameCountRef.current >= 12)
          meterFrameRef.current = window.requestAnimationFrame(updateNoise)
        }

        meterFrameRef.current = window.requestAnimationFrame(updateNoise)
      }

      const recorderOptions: MediaRecorderOptions = {}
      const mimeType = chooseMimeType()
      if (mimeType) recorderOptions.mimeType = mimeType
      const recorder = new MediaRecorder(stream, recorderOptions)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          queueUpload(event.data, facing, recorder.state)
        }
      }
      recorder.onerror = (event) => {
        console.error('SOS recorder error', event)
        if (mountedRef.current) setError('Recorder failed while capturing SOS media')
      }
      recorder.start(4000)
      recorderRef.current = recorder
      if (mountedRef.current) {
        setCameraFacing(facing)
        setStatus('recording')
      }
    } catch (err) {
      console.error(err)
      if (mountedRef.current) {
        setStatus('error')
        setError((err as Error)?.message || 'Unable to start camera/microphone')
      }
    }
  }, [cleanupStream, ensureSession, queueUpload])

  const toggleCamera = useCallback(async () => {
    const nextFacing: CameraFacing = cameraFacingRef.current === 'user' ? 'environment' : 'user'
    await startStream(nextFacing)
  }, [startStream])

  const toggleRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      recorder.pause()
      setStatus('paused')
      return
    }
    if (recorder.state === 'paused') {
      recorder.resume()
      setStatus('recording')
    }
  }, [])

  const endSession = useCallback(async (reason = 'user-ended') => {
    const sid = sessionIdRef.current
    try {
      recorderRef.current?.stop()
    } catch {}
    cleanupStream()
    setStatus('stopped')
    if (!sid) return

    const location = await readLocation()
    try {
      const response = await fetch(resolveApiPath(`/api/sos/sessions/${sid}/end`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, location: location || undefined }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`SOS end failed: ${response.status} ${text}`)
      }
    } catch (err) {
      console.error(err)
      if (mountedRef.current) setError((err as Error)?.message || 'Unable to end SOS session cleanly')
    }
  }, [cleanupStream])

  const calibrateLoudness = useCallback(async () => {
    const analyser = analyserRef.current
    const audioContext = audioContextRef.current
    if (!analyser || !audioContext) return

    calibrationSessionRef.current += 1
    const sessionToken = calibrationSessionRef.current
    setIsCalibrating(true)
    setError(null)

    try {
      await audioContext.resume().catch(() => {})
      const sampleCount = 24
      const sampleDelayMs = 80
      const buffer = new Uint8Array(analyser.frequencyBinCount)
      let totalDbfs = 0
      let collected = 0

      for (let index = 0; index < sampleCount; index += 1) {
        if (!mountedRef.current || sessionToken !== calibrationSessionRef.current) return
        analyser.getByteTimeDomainData(buffer)
        let sumSquares = 0
        for (let i = 0; i < buffer.length; i += 1) {
          const normalized = (buffer[i] - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / buffer.length)
        const dbfs = rms > 0 ? 20 * Math.log10(rms) : -60
        totalDbfs += dbfs
        collected += 1
        await new Promise((resolve) => window.setTimeout(resolve, sampleDelayMs))
      }

      if (!collected) return
      const averageDbfs = totalDbfs / collected
      const quietRoomReferenceSpl = 45
      const nextOffset = quietRoomReferenceSpl - averageDbfs
      calibrationOffsetRef.current = nextOffset
      saveCalibrationOffset(nextOffset)
      setEstimatedRoomDbSPL(Math.max(30, Math.min(130, Math.round(averageDbfs + nextOffset))))
    } catch (err) {
      console.error(err)
      if (mountedRef.current) setError((err as Error)?.message || 'Unable to calibrate microphone')
    } finally {
      if (mountedRef.current) setIsCalibrating(false)
    }
  }, [saveCalibrationOffset])

  useEffect(() => {
    mountedRef.current = true
    void startStream('user')
    return () => {
      mountedRef.current = false
      try {
        recorderRef.current?.stop()
      } catch {}
      stopNoiseMeter()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [startStream, stopNoiseMeter])

  return useMemo(() => ({
    status,
    error,
    sessionId,
    cameraFacing,
    uploadCount,
    isUploading,
    noiseLevelDb,
    estimatedRoomDbSPL,
    isCalibrating,
    highDecibelAlert,
    mediaStream,
    isRecording: status === 'recording',
    isPaused: status === 'paused',
    toggleCamera,
    toggleRecording,
    calibrateLoudness,
    endSession,
  }), [calibrateLoudness, cameraFacing, endSession, error, highDecibelAlert, isCalibrating, isUploading, mediaStream, noiseLevelDb, estimatedRoomDbSPL, sessionId, status, toggleCamera, toggleRecording, uploadCount])
}
