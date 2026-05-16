import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, Globe2, Loader2, Mic, Play, Shield, Signal, StopCircle, Volume2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { logTelemetry } from '../lib/activityLog.ts'
import { translateImage, translateText, fetchCulturalIntel } from '../lib/translatorApi'
import Navbar from '../components/Navbar'
import VoiceRelay from '../components/VoiceRelay'
import CameraCapture from '../components/CameraCapture'

type BrowserRecognition = any

const languages = ['Auto', 'English', 'Spanish', 'French', 'German', 'Japanese', 'Korean', 'Mandarin']
const situations = ['restaurant', 'transport', 'emergency', 'shopping']

export default function TranslatorPage() {
  const [sourceLang, setSourceLang] = useState('Auto')
  const [targetLang, setTargetLang] = useState('English')
  const [text, setText] = useState('')
  const [translated, setTranslated] = useState('')
  const [translating, setTranslating] = useState(false)
  const [cultural, setCultural] = useState<string[]>([])
  const [culturalLoading, setCulturalLoading] = useState(false)
  const [situation, setSituation] = useState('restaurant')
  const [listening, setListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [continuousMode] = useState(true)
  const [recognitionSupported, setRecognitionSupported] = useState(true)
  const recognitionRef = useRef<BrowserRecognition | null>(null)

  useEffect(() => {
    const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Rec) {
      setRecognitionSupported(false)
      return
    }
    const rec = new Rec() as BrowserRecognition
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event: any) => {
      const transcript = Array.from(event.results as SpeechRecognitionResultList)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(' ')
      setLiveTranscript(transcript)
      setText(transcript)
      if (continuousMode) {
        performTranslate(transcript)
      }
    }
    rec.onend = () => {
      setListening(false)
    }
    recognitionRef.current = rec
  }, [continuousMode])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'morning'
    if (hour < 18) return 'afternoon'
    return 'evening'
  }, [])

  const performTranslate = useCallback(async (inputText?: string) => {
    const baseText = (inputText ?? text).trim()
    if (!baseText) return
    setTranslating(true)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await translateText({ text: baseText, sourceLang, targetLang, context: { situation } }, token).catch(() => null)
    await logTelemetry('translator.text', { sourceLang, targetLang, situation, chars: baseText.length })
    if (res?.translatedText) setTranslated(res.translatedText)
    if (res?.hints) setCultural(res.hints)
    setTranslating(false)
  }, [situation, sourceLang, targetLang, text])

  const performVision = async (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const token = (await supabase.auth.getSession()).data.session?.access_token
      setTranslating(true)
      const res = await translateImage(dataUrl, sourceLang, targetLang, token).catch(() => null)
      await logTelemetry('translator.vision', { sourceLang, targetLang })
      if (res?.translatedText) setTranslated(res.translatedText)
      if (res?.hints) setCultural(res.hints)
      setTranslating(false)
    }
    reader.readAsDataURL(file)
  }

  const loadCulturalIntel = async () => {
    setCulturalLoading(true)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const { data: location } = await supabase.from('user_locations').select('lat,lng').maybeSingle()
    const intel = await fetchCulturalIntel(location?.lat ?? null, location?.lng ?? null, situation, token).catch(() => null)
    await logTelemetry('translator.cultural', { situation, lat: location?.lat, lng: location?.lng })
    if (intel?.tips) setCultural(intel.tips)
    setCulturalLoading(false)
  }

  const startListening = () => {
    if (!recognitionRef.current) return
    setListening(true)
    recognitionRef.current.start()
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  const playTTS = () => {
    if (!('speechSynthesis' in window)) return
    const utterance = new SpeechSynthesisUtterance(translated || text)
    const lang = targetLang.toLowerCase().startsWith('en') ? 'en-US' : targetLang || 'en-US'
    utterance.lang = lang
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">
      <div className="noise-overlay" />
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
        <div className="aurora-bg" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-6">
        <Navbar mode="translator" />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-white/70">Live Translator</p>
            <h1 className="font-display text-4xl font-semibold leading-tight">Good {greeting}. You&apos;re covered.</h1>
            <p className="mt-1 text-white/75">Voice, camera, cultural guardrails. Tuned to your profile.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
            <Signal size={14} />
            {translating ? 'Processing' : listening ? 'Listening' : 'Ready'}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <VoiceRelay />

            <CameraCapture
              sourceLang={sourceLang}
              targetLang={targetLang}
              onResult={(res) => {
                setTranslated(res.text)
                if (res.hints) setCultural(res.hints)
              }}
              onTranslating={setTranslating}
            />

            <div className="rounded-3xl border border-white/12 bg-white/5 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
                <span>Live text</span>
                <span className="rounded-full bg-white/10 px-3 py-1">Continuous</span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="flex-1 rounded-2xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none">
                      {languages.map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                    <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="flex-1 rounded-2xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none">
                      {languages.map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/70">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px]">Situation</span>
                    <div className="flex flex-wrap gap-2">
                      {situations.map((s) => (
                        <button
                          key={s}
                          onClick={() => setSituation(s)}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${situation === s ? 'bg-white text-slate-900' : 'border border-white/12 bg-white/5 text-white'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Speak or type. We keep it live."
                    className="min-h-[120px] w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  />
                  {liveTranscript && (
                    <p className="text-xs text-white/60">Live: {liveTranscript}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                    <button onClick={() => performTranslate()} disabled={translating} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-slate-900 shadow">
                      {translating ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                      Go live
                    </button>
                    {recognitionSupported && !listening && (
                      <button onClick={startListening} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2">
                        <Play size={14} />
                        Listen
                      </button>
                    )}
                    {listening && (
                      <button onClick={stopListening} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2">
                        <StopCircle size={14} />
                        Stop
                      </button>
                    )}
                    <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2">
                      <Camera size={14} />
                      <span>Camera text</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => performVision(e.target.files?.[0])} />
                    </label>
                    <button onClick={loadCulturalIntel} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2">
                      <Shield size={14} />
                      Cultural guard
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/12 bg-slate-950/80 p-4 shadow">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/70">
                    <span>Live output</span>
                    <div className="flex items-center gap-2">
                      <Volume2 size={14} />
                      <button onClick={playTTS} className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase">Play</button>
                    </div>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-white min-h-[96px]">{translated || 'Awaiting input...'}</p>
                  <div className="mt-3 space-y-2 text-xs text-white/70">
                    {culturalLoading ? 'Loading cultural guardrails...' : cultural.map((tip) => (
                      <div key={tip} className="rounded-xl bg-white/5 px-3 py-2">{tip}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.05 }}
            className="space-y-4"
          >
            <div className="rounded-3xl border border-white/12 bg-white/5 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
                <span>Cultural intelligence</span>
                <Globe2 size={14} />
              </div>
              <div className="mt-3 space-y-2 text-sm text-white/80 min-h-[120px]">
                {culturalLoading ? 'Scanning local context...' : cultural.map((tip) => (
                  <div key={tip} className="rounded-2xl border border-white/12 bg-white/5 px-3 py-2">{tip}</div>
                ))}
                {!culturalLoading && cultural.length === 0 && <p className="text-white/60">Use Cultural guard to fetch do&apos;s and don&apos;ts for your situation.</p>}
              </div>
            </div>

          </motion.div>
        </div>
      </div>

    </div>
  )
}
