import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, StopCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { translateImage } from '../lib/translatorApi'
import { logTelemetry } from '../lib/activityLog.ts'

type Props = {
  sourceLang: string
  targetLang: string
  onResult: (result: { text: string; hints?: string[] }) => void
  onTranslating: (flag: boolean) => void
}

export default function CameraCapture({ sourceLang, targetLang, onResult, onTranslating }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    return () => stopStream()
  }, [])

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setReady(false)
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const start = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setReady(true)
      // start lightweight polling to translate every ~1.2s when camera is on
      if (!intervalRef.current) {
        intervalRef.current = window.setInterval(() => {
          if (!working) captureAndTranslate(true)
        }, 1200)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Camera unavailable')
    }
  }

  const captureAndTranslate = async (silent = false) => {
    if (!videoRef.current) return
    if (!silent) {
      setWorking(true)
      onTranslating(true)
    }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth || 640
      canvas.height = videoRef.current.videoHeight || 360
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not available')
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/png')
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await translateImage(dataUrl, sourceLang, targetLang, token).catch(() => null)
      await logTelemetry('translator.vision.camera', { sourceLang, targetLang })
      if (res?.translatedText) onResult({ text: res.translatedText, hints: res.hints })
    } catch (err: any) {
      setError(err?.message ?? 'Capture failed')
    } finally {
      if (!silent) {
        setWorking(false)
        onTranslating(false)
      }
    }
  }

  return (
    <div className="rounded-3xl border border-white/12 bg-white/5 p-5 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
        <span>Camera translate</span>
        <span className="rounded-full bg-white/10 px-3 py-1">Live</span>
      </div>
      <div className="mt-3 space-y-3">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80">
          <video ref={videoRef} className="h-56 w-full object-cover" playsInline muted />
        </div>
        {error && <p className="text-sm text-red-200">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
          {!ready ? (
            <button onClick={start} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-slate-900 shadow">
              <Camera size={14} />
              Start camera
            </button>
          ) : (
            <button onClick={stopStream} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white">
              <StopCircle size={14} />
              Stop
            </button>
          )}
          <button
            onClick={() => captureAndTranslate()}
            disabled={!ready || working}
            className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white disabled:opacity-60"
          >
            {working ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            Capture & translate
          </button>
        </div>
      </div>
    </div>
  )
}
