import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, Mic, Play, StopCircle, Volume2 } from 'lucide-react'
import { translateText } from '../lib/translatorApi'
import { supabase } from '../lib/supabaseClient'

const languages = ['English', 'Spanish', 'French', 'German', 'Japanese', 'Korean', 'Mandarin']

type BrowserRecognition = any

type Props = {
  defaultTarget?: string
}

export default function VoiceRelay({ defaultTarget = 'Spanish' }: Props) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [translated, setTranslated] = useState('')
  const [targetLang, setTargetLang] = useState(defaultTarget)
  const [loading, setLoading] = useState(false)
  const [supported, setSupported] = useState(true)
  const recRef = useRef<BrowserRecognition | null>(null)

  useEffect(() => {
    const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Rec) {
      setSupported(false)
      return
    }
    const rec = new Rec() as BrowserRecognition
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event: any) => {
      const text = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(' ')
      setTranscript(text)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
  }, [])

  const start = () => {
    if (!recRef.current) return
    setTranscript('')
    setTranslated('')
    setListening(true)
    recRef.current.start()
  }

  const stop = () => {
    recRef.current?.stop()
    setListening(false)
  }

  const translateNow = useCallback(async () => {
    if (!transcript.trim()) return
    setLoading(true)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await translateText({ text: transcript, sourceLang: 'Auto', targetLang, context: { mode: 'relay' } }, token).catch(() => null)
    if (res?.translatedText) setTranslated(res.translatedText)
    setLoading(false)
  }, [targetLang, transcript])

  const playTts = () => {
    if (!('speechSynthesis' in window)) return
    const utterance = new SpeechSynthesisUtterance(translated || transcript)
    const lang = targetLang.toLowerCase().startsWith('en') ? 'en-US' : targetLang || 'en-US'
    utterance.lang = lang
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div className="rounded-3xl border border-white/12 bg-white/5 p-5 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
        <span>Voice relay (simple)</span>
        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px]">Live</span>
      </div>
      {!supported ? (
        <p className="mt-3 text-sm text-red-200">Browser speech recognition not supported here.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[11px] text-white"
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
            {!listening ? (
              <button onClick={start} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-slate-900 shadow">
                <Mic size={14} />
                Listen
              </button>
            ) : (
              <button onClick={stop} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white">
                <StopCircle size={14} />
                Stop
              </button>
            )}
            <button onClick={translateNow} disabled={loading} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-white disabled:opacity-60">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Translate
            </button>
            <button onClick={playTts} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-white">
              <Volume2 size={14} />
              Speak out
            </button>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/5 p-3 text-sm text-white/80">
            <p className="text-xs uppercase tracking-[0.14em] text-white/60">You said</p>
            <p className="min-h-[64px] text-white">{transcript || 'Awaiting voice...'}</p>
          </div>
          <div className="rounded-2xl border border-white/12 bg-slate-950/80 p-3 text-sm text-white/80">
            <p className="text-xs uppercase tracking-[0.14em] text-white/60">Translated</p>
            <p className="min-h-[64px] text-white">{translated || 'Tap Translate to convert'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
