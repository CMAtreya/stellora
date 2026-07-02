import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveApiPath } from '../lib/apiClient'
import { saveLocalClip, deleteLocalClip, getLocalClipsSize } from '../lib/indexedDb'
// @ts-ignore
import ysFixWebmDuration from 'fix-webm-duration'

type CameraFacing = 'user' | 'environment'
type SOSSessionState = 'idle' | 'initializing' | 'recording' | 'paused' | 'stopped' | 'error'

function chooseMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function fixDuration(blob: Blob, durationMs: number): Promise<Blob> {
  return new Promise((resolve) => {
    try {
      ysFixWebmDuration(blob, durationMs, (fixedBlob: Blob) => {
        resolve(fixedBlob)
      })
    } catch (e) {
      console.error('Error fixing webm duration:', e)
      resolve(blob)
    }
  })
}

export type UseSOSMediaSessionProps = {
  onClipUploaded?: (clipUrl: string) => void
}

export function useSOSMediaSession({ onClipUploaded }: UseSOSMediaSessionProps = {}) {
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('user')
  const onClipUploadedRef = useRef(onClipUploaded)

  useEffect(() => {
    onClipUploadedRef.current = onClipUploaded
  }, [onClipUploaded])
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
  const [backupSizeMb, setBackupSizeMb] = useState(0)

  // Real-time protocol steps state ('recording' | 'uploading' | 'contacts')
  const [completedSteps, setCompletedSteps] = useState<Set<'recording' | 'uploading' | 'contacts'>>(new Set())

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const meterFrameRef = useRef<number | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const cameraFacingRef = useRef<CameraFacing>('user')
  const statusRef = useRef<SOSSessionState>('idle')

  useEffect(() => {
    statusRef.current = status
  }, [status])
  
  const recordingIntervalRef = useRef<any>(null)
  const locationPingIntervalRef = useRef<any>(null)
  const chunkIndexRef = useRef(0)
  const calibrationOffsetRef = useRef(105)
  const baselineSPLRef = useRef<number>(45) // baseline SPL set during calibration

  // Fetch or generate session ID on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlSession = params.get('session')
    const sid = urlSession || crypto.randomUUID()
    sessionIdRef.current = sid
    setSessionId(sid)
  }, [])

  // Sync steps helper
  const addCompletedStep = useCallback((step: 'recording' | 'uploading' | 'contacts') => {
    setCompletedSteps((prev) => {
      const next = new Set(prev)
      next.add(step)
      return next
    })
  }, [])

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
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
    if (locationPingIntervalRef.current) {
      clearInterval(locationPingIntervalRef.current)
      locationPingIntervalRef.current = null
    }
    try {
      recorderRef.current?.stop()
    } catch {}
    recorderRef.current = null
    stopNoiseMeter()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    streamRef.current = null
    setMediaStream(null)
  }, [stopNoiseMeter])

  // Upload completed clip blob
  const uploadClipBlob = useCallback(async (blob: Blob, clipId: string) => {
    const sid = sessionIdRef.current
    if (!sid || !blob.size) return null

    // 1. Save to local IndexedDB backup
    await saveLocalClip(clipId, blob)
    const size = await getLocalClipsSize()
    setBackupSizeMb(size)

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('clip', blob, `clip-${clipId}.mp4`)
      formData.append('sessionId', sid)

      const response = await fetch(resolveApiPath('/api/sos/upload-clip'), {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`)
      }

      // 2. We do NOT purge local IndexedDB copy to store the live footages locally on their memory
      const data = await response.json()
      const clipUrl = data.clip?.clip_url

      const updatedSize = await getLocalClipsSize()
      setBackupSizeMb(updatedSize)
      setUploadCount((count) => count + 1)
      addCompletedStep('uploading')
      return clipUrl
    } catch (err) {
      console.error('Failed to upload SOS clip, held in IndexedDB backup:', err)
      setError('Upload failed, saved locally in IndexedDB backup')
      return null
    } finally {
      setIsUploading(false)
    }
  }, [addCompletedStep])

  // Start continuous loop recording: stops current recorder and spawns new one every 10s
  const startRecordingLoop = useCallback((stream: MediaStream, facing: CameraFacing) => {
    const CLIP_DURATION_MS = 10000

    const recordSingleClip = () => {
      if (!streamRef.current || statusRef.current === 'paused' || statusRef.current === 'stopped') return

      const mimeType = chooseMimeType()
      const recorderOptions = mimeType ? { mimeType } : {}
      const recorder = new MediaRecorder(stream, recorderOptions)
      recorderRef.current = recorder

      const clipId = `${Date.now()}-${chunkIndexRef.current++}`
      let isFullClip = false
      
      recorder.ondataavailable = async (e) => {
        if (isFullClip && e.data && e.data.size > 0) {
          const fixedBlob = await fixDuration(e.data, CLIP_DURATION_MS)
          const uploadedUrl = await uploadClipBlob(fixedBlob, clipId)
          if (uploadedUrl && onClipUploadedRef.current) {
            onClipUploadedRef.current(uploadedUrl)
          }
        }
      }

      recorder.start()
      
      // Stop recorder after 10 seconds to generate the clip blob
      setTimeout(() => {
        isFullClip = true
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop()
          } catch {}
        }
      }, CLIP_DURATION_MS)
    };

    // Trigger initial recording
    recordSingleClip()
    // Set up continuous loop
    recordingIntervalRef.current = setInterval(recordSingleClip, CLIP_DURATION_MS)
  }, [status, uploadClipBlob])

  // Send periodic location pings
  const startLocationPings = useCallback(() => {
    const pingLocation = () => {
      const sid = sessionIdRef.current
      if (!sid || typeof navigator === 'undefined' || !navigator.geolocation) return

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          try {
            await fetch(resolveApiPath('/api/sos/location-ping'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: sid, lat, lng })
            })
          } catch (e) {
            console.error('Failed to send location ping:', e)
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      )
    }

    pingLocation()
    locationPingIntervalRef.current = setInterval(pingLocation, 10000)
  }, [])

  const [recordingEnabled, setRecordingEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('triparc:sos:recording_enabled') !== 'false'
  })

  const startStream = useCallback(async (facing: CameraFacing) => {
    setStatus('initializing')
    setError(null)
    cleanupStream()

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('Camera/microphone not supported in this browser')
      return
    }

    const enabled = localStorage.getItem('triparc:sos:recording_enabled') !== 'false'
    setRecordingEnabled(enabled)
    // Bypassing the early return to ensure camera stream always starts on active SOS page

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
      addCompletedStep('recording')

      // Set up Audio Analyser
      stopNoiseMeter()
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
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
          if (!analyserRef.current || !streamRef.current) return
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

          // Decibel alert: exceeds baseline by ~18dB
          const alertActive = estimatedSpl > (baselineSPLRef.current + 18)
          setHighDecibelAlert(alertActive)

          meterFrameRef.current = window.requestAnimationFrame(updateNoise)
        }

        meterFrameRef.current = window.requestAnimationFrame(updateNoise)
      }

      // Start continuous loop recording and pings
      setStatus('recording')
      startRecordingLoop(stream, facing)
      startLocationPings()
    } catch (err: any) {
      console.error(err)
      setStatus('error')
      setError(err?.message || 'Access to camera/microphone denied.')
    }
  }, [cleanupStream, stopNoiseMeter, startRecordingLoop, startLocationPings, addCompletedStep])

  const toggleCamera = useCallback(async () => {
    const nextFacing: CameraFacing = cameraFacingRef.current === 'user' ? 'environment' : 'user'
    cameraFacingRef.current = nextFacing
    setCameraFacing(nextFacing)
    await startStream(nextFacing)
  }, [startStream])

  const toggleRecording = useCallback(() => {
    if (status === 'recording') {
      setStatus('paused')
    } else if (status === 'paused') {
      setStatus('recording')
    }
  }, [status])

  const endSession = useCallback(async () => {
    const sid = sessionIdRef.current
    cleanupStream()
    setStatus('stopped')
    if (!sid) return

    try {
      const response = await fetch(resolveApiPath('/api/sos/resolve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      })
      if (!response.ok) {
        throw new Error(`SOS resolve failed: ${response.statusText}`)
      }
    } catch (err) {
      console.error('Failed to resolve SOS session:', err)
    }
  }, [cleanupStream])

  const calibrateLoudness = useCallback(async () => {
    const analyser = analyserRef.current
    if (!analyser) return

    setIsCalibrating(true)
    try {
      const sampleCount = 20
      const sampleDelayMs = 100
      const buffer = new Uint8Array(analyser.frequencyBinCount)
      let totalSPL = 0

      for (let index = 0; index < sampleCount; index += 1) {
        analyser.getByteTimeDomainData(buffer)
        let sumSquares = 0
        for (let i = 0; i < buffer.length; i += 1) {
          const normalized = (buffer[i] - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / buffer.length)
        const dbfs = rms > 0 ? 20 * Math.log10(rms) : -60
        const clampedDbfs = Math.max(-60, Math.min(0, dbfs))
        const currentSPL = clampedDbfs + calibrationOffsetRef.current
        totalSPL += currentSPL
        await new Promise((resolve) => setTimeout(resolve, sampleDelayMs))
      }

      const avgSPL = Math.round(totalSPL / sampleCount)
      baselineSPLRef.current = avgSPL
      setEstimatedRoomDbSPL(avgSPL)
    } catch (err) {
      console.error('Calibration failed:', err)
    } finally {
      setIsCalibrating(false)
    }
  }, [])

  const refreshBackupSize = useCallback(async () => {
    const size = await getLocalClipsSize()
    setBackupSizeMb(size)
  }, [])

  useEffect(() => {
    void startStream('user')
    return () => {
      cleanupStream()
    }
  }, [startStream, cleanupStream])

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
    backupSizeMb,
    completedSteps,
    addCompletedStep,
    isRecording: status === 'recording',
    isPaused: status === 'paused',
    toggleCamera,
    toggleRecording,
    calibrateLoudness,
    endSession,
    refreshBackupSize,
  }), [
    status, error, sessionId, cameraFacing, uploadCount, isUploading,
    noiseLevelDb, estimatedRoomDbSPL, isCalibrating, highDecibelAlert,
    mediaStream, backupSizeMb, completedSteps, addCompletedStep,
    toggleCamera, toggleRecording, calibrateLoudness, endSession,
    refreshBackupSize
  ])
}
