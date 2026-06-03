import { useEffect, useMemo, useRef, useState } from 'react'
import TripArcNav from '../components/TripArcNav'
import { fetchCulturalIntel, translateText } from '../lib/translatorApi'
import type { CulturalIntel } from '../lib/translatorApi'

const translationLanguages = [
  { code: 'auto', label: 'Auto Detect' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Albanian' },
  { code: 'am', label: 'Amharic' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hy', label: 'Armenian' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'eu', label: 'Basque' },
  { code: 'be', label: 'Belarusian' },
  { code: 'bn', label: 'Bengali' },
  { code: 'bs', label: 'Bosnian' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'ca', label: 'Catalan' },
  { code: 'ceb', label: 'Cebuano' },
  { code: 'zh-cn', label: 'Chinese (Simplified)' },
  { code: 'zh-tw', label: 'Chinese (Traditional)' },
  { code: 'co', label: 'Corsican' },
  { code: 'hr', label: 'Croatian' },
  { code: 'cs', label: 'Czech' },
  { code: 'da', label: 'Danish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'en', label: 'English' },
  { code: 'eo', label: 'Esperanto' },
  { code: 'et', label: 'Estonian' },
  { code: 'fi', label: 'Finnish' },
  { code: 'fr', label: 'French' },
  { code: 'fy', label: 'Frisian' },
  { code: 'gl', label: 'Galician' },
  { code: 'ka', label: 'Georgian' },
  { code: 'de', label: 'German' },
  { code: 'el', label: 'Greek' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ht', label: 'Haitian Creole' },
  { code: 'ha', label: 'Hausa' },
  { code: 'haw', label: 'Hawaiian' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hmn', label: 'Hmong' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'is', label: 'Icelandic' },
  { code: 'ig', label: 'Igbo' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ga', label: 'Irish' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'jv', label: 'Javanese' },
  { code: 'kn', label: 'Kannada' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'km', label: 'Khmer' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'ko', label: 'Korean' },
  { code: 'ku', label: 'Kurdish' },
  { code: 'ky', label: 'Kyrgyz' },
  { code: 'lo', label: 'Lao' },
  { code: 'la', label: 'Latin' },
  { code: 'lv', label: 'Latvian' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'lb', label: 'Luxembourgish' },
  { code: 'mk', label: 'Macedonian' },
  { code: 'mg', label: 'Malagasy' },
  { code: 'ms', label: 'Malay' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mt', label: 'Maltese' },
  { code: 'mi', label: 'Maori' },
  { code: 'mr', label: 'Marathi' },
  { code: 'mn', label: 'Mongolian' },
  { code: 'my', label: 'Myanmar (Burmese)' },
  { code: 'ne', label: 'Nepali' },
  { code: 'no', label: 'Norwegian' },
  { code: 'ny', label: 'Nyanja' },
  { code: 'or', label: 'Odia' },
  { code: 'ps', label: 'Pashto' },
  { code: 'fa', label: 'Persian' },
  { code: 'pl', label: 'Polish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ro', label: 'Romanian' },
  { code: 'ru', label: 'Russian' },
  { code: 'sm', label: 'Samoan' },
  { code: 'gd', label: 'Scots Gaelic' },
  { code: 'sr', label: 'Serbian' },
  { code: 'st', label: 'Sesotho' },
  { code: 'sn', label: 'Shona' },
  { code: 'sd', label: 'Sindhi' },
  { code: 'si', label: 'Sinhala' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'so', label: 'Somali' },
  { code: 'es', label: 'Spanish' },
  { code: 'su', label: 'Sundanese' },
  { code: 'sw', label: 'Swahili' },
  { code: 'sv', label: 'Swedish' },
  { code: 'tg', label: 'Tajik' },
  { code: 'ta', label: 'Tamil' },
  { code: 'tt', label: 'Tatar' },
  { code: 'te', label: 'Telugu' },
  { code: 'th', label: 'Thai' },
  { code: 'tr', label: 'Turkish' },
  { code: 'tk', label: 'Turkmen' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ug', label: 'Uyghur' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'cy', label: 'Welsh' },
  { code: 'xh', label: 'Xhosa' },
  { code: 'yi', label: 'Yiddish' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'zu', label: 'Zulu' },
]

const translationLanguageMap = new Map(translationLanguages.map((language) => [language.code, language.label]))

const phraseCards = [
  { icon: 'restaurant', label: 'Dining', count: '12 Phrases' },
  { icon: 'train', label: 'Transportation', count: '8 Phrases' },
  { icon: 'emergency', label: 'Emergency', count: '5 Phrases', tone: 'error' },
]

const bottomTabs = [
  { icon: 'translate', label: 'Translate', active: true },
  { icon: 'photo_camera', label: 'Camera' },
  { icon: 'inventory_2', label: 'Vault' },
  { icon: 'account_circle', label: 'Profile' },
]

export default function TranslatorPage() {
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('ja')
  const [inputText, setInputText] = useState('Where can I find the best local ramen near the station?')
  const [translatedText, setTranslatedText] = useState('駅の近くで一番美味しいラーメン屋はどこですか？')
  const [romanizedText, setRomanizedText] = useState('Eki no chikaku de ichiban oishii rāmen-ya wa doko desu ka?')
  const [isListening, setIsListening] = useState(false)
  const [liveLensOpen, setLiveLensOpen] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [translateError, setTranslateError] = useState('')
  const [culturalIntel, setCulturalIntel] = useState<CulturalIntel | null>(null)
  const [locationStatus, setLocationStatus] = useState('Detecting your current location...')
  const [culturalCardIndex, setCulturalCardIndex] = useState(0)
  const translationRunId = useRef(0)

  useEffect(() => {
    document.title = 'AURORA TRANSLATE | TripArc'
    document.documentElement.classList.add('dark')
    return () => {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const characterCount = useMemo(() => inputText.length, [inputText])
  const sourceLanguageLabel = translationLanguageMap.get(sourceLang) || sourceLang.toUpperCase()
  const targetLanguageLabel = translationLanguageMap.get(targetLang) || targetLang.toUpperCase()
  const targetLanguageOptions = translationLanguages.filter((language) => language.code !== 'auto')

  const processTranslation = async (textOverride?: string, sourceOverride?: string, targetOverride?: string) => {
    const text = (textOverride ?? inputText).trim()
    if (!text) {
      setTranslatedText('')
      setRomanizedText('')
      setTranslateError('')
      return
    }
    const runId = ++translationRunId.current
    const activeSource = sourceOverride ?? sourceLang
    const activeTarget = targetOverride ?? targetLang
    setTranslateError('')
    setIsProcessing(true)
    try {
      const result = await translateText({
        text,
        sourceLang: activeSource,
        targetLang: activeTarget,
        context: { mode: 'deep-translation' },
      })
      if (runId !== translationRunId.current) return
      if (result?.translatedText) {
        setTranslatedText(result.translatedText)
        const detectedHint = (result.hints || []).find((hint) => hint.toLowerCase().includes('detected source'))
        setRomanizedText(detectedHint ?? `Translated from ${activeSource} to ${activeTarget}`)
      } else {
        setTranslateError('No translation returned from provider.')
      }
    } catch (error: any) {
      if (runId !== translationRunId.current) return
      setTranslateError(error?.message || 'Translation failed. Please try again.')
    } finally {
      if (runId !== translationRunId.current) return
      setIsProcessing(false)
    }
  }

  useEffect(() => {
    const text = inputText.trim()
    if (!text) return
    void processTranslation(text, sourceLang, targetLang)
  }, [inputText, sourceLang, targetLang])

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('Location access not supported in this browser.')
      return
    }

    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (cancelled) return
        const { latitude, longitude } = position.coords
        setLocationStatus('Loading local rituals and rules...')
        try {
          const intel = await fetchCulturalIntel(latitude, longitude, 'current location etiquette')
          if (cancelled) return
          setCulturalIntel(intel)
          setLocationStatus(intel.locationLabel ? `Current location: ${intel.locationLabel}` : 'Using your current location')
        } catch {
          if (cancelled) return
          setLocationStatus('Could not load location guidance right now.')
        }
      },
      () => {
        if (cancelled) return
        setLocationStatus('Enable location to show local rituals, rules, and regulations.')
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    )

    return () => {
      cancelled = true
    }
  }, [])

  const culturalRituals = culturalIntel?.rituals || []
  const culturalRules = culturalIntel?.rules || []
  const culturalRegulations = culturalIntel?.regulations || []
  const culturalTips = culturalIntel?.tips || []
  const culturalDeck = useMemo(
    () => [
      {
        key: 'rituals',
        label: 'Rituals',
        icon: 'volunteer_activism',
        accent: 'from-[#ffbc7c]/20 to-[#fe9400]/10',
        items: culturalRituals,
        empty: 'We will show place rituals once your location is available.',
      },
      {
        key: 'rules',
        label: 'Rules',
        icon: 'gavel',
        accent: 'from-white/10 to-white/[0.03]',
        items: culturalRules,
        empty: 'Rules for the current area will appear here.',
      },
      {
        key: 'regulations',
        label: 'Regulations',
        icon: 'policy',
        accent: 'from-[#fb7185]/15 to-white/[0.03]',
        items: culturalRegulations,
        empty: 'Regulations such as littering fines or venue restrictions will appear here.',
      },
      {
        key: 'tips',
        label: 'Tips',
        icon: 'tips_and_updates',
        accent: 'from-[#2563EB]/15 to-[#1d4ed8]/10',
        items: culturalTips,
        empty: 'General local tips will appear here.',
      },
    ],
    [culturalRituals, culturalRules, culturalRegulations, culturalTips]
  )

  useEffect(() => {
    setCulturalCardIndex(0)
  }, [culturalIntel?.locationLabel, sourceLang, targetLang])

  const goToPreviousCulturalCard = () => {
    setCulturalCardIndex((current) => (current - 1 + culturalDeck.length) % culturalDeck.length)
  }

  const goToNextCulturalCard = () => {
    setCulturalCardIndex((current) => (current + 1) % culturalDeck.length)
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#131313] text-[#e5e2e1] selection:bg-[#2563EB]/30 selection:text-white">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background: 'radial-gradient(circle at 0% 0%, rgba(37, 99, 235, 0.22) 0%, rgba(37, 99, 235, 0) 32%), radial-gradient(circle at 100% 100%, rgba(130, 128, 255, 0.10) 0%, rgba(130, 128, 255, 0) 30%)',
          filter: 'blur(0px)',
          opacity: 0.95,
        }}
      />
      <div className="pointer-events-none absolute left-[-100px] top-[-100px] h-[500px] w-[500px] rounded-full bg-[#2563EB]/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-[-100px] h-[400px] w-[400px] rounded-full bg-[#8382ff]/10 blur-[120px]" />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
        body { font-family: 'Manrope', sans-serif; background-color: #131313; color: #e5e2e1; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .glass-panel { background: rgba(15, 15, 15, 0.7); backdrop-filter: blur(24px); }
        .aurora-glow { position: absolute; filter: blur(120px); z-index: -1; opacity: 0.15; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>

      <TripArcNav />

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 pb-32 pt-10 md:px-12 xl:grid-cols-12">
        <div className="space-y-10 xl:col-span-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between xl:gap-8">
            <div className="flex-shrink-0">
              <h1 style={{ fontSize: 40, lineHeight: '44px', letterSpacing: '-0.6px' }} className="font-extrabold tracking-tight text-white md:text-5xl">Deep Translation</h1>
            </div>
            <div className="flex items-center gap-3 xl:ml-auto">
              <div className="flex items-center gap-2.5 rounded-full border border-white/5 bg-[#1c1b1b] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <label className="relative inline-flex items-center">
                  <select
                    value={sourceLang}
                    onChange={(event) => setSourceLang(event.target.value)}
                    className="h-8 min-w-[104px] appearance-none rounded-full border border-white/5 bg-[#2a2a2a] px-3.5 pr-8 text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-300 outline-none transition-colors hover:bg-[#313131] focus:bg-[#313131] focus-visible:outline-none"
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)', letterSpacing: '0.18em' }}
                    aria-label="Source language"
                  >
                    {translationLanguages.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] text-slate-300">expand_more</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const nextSource = targetLang
                    const nextTarget = sourceLang
                    setSourceLang(nextSource)
                    setTargetLang(nextTarget)
                  }}
                  className="cursor-pointer rounded-full p-1 text-slate-500 transition-colors hover:text-[#2563EB]"
                  aria-label="Swap languages"
                >
                  <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                </button>
                <label className="relative inline-flex items-center">
                  <select
                    value={targetLang}
                    onChange={(event) => setTargetLang(event.target.value)}
                    className="h-8 min-w-[104px] appearance-none rounded-full border border-white/5 bg-[#2a2a2a] px-3.5 pr-8 text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-300 outline-none transition-colors hover:bg-[#313131] focus:bg-[#313131] focus-visible:outline-none"
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)', letterSpacing: '0.18em' }}
                    aria-label="Target language"
                  >
                    {targetLanguageOptions.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] text-slate-300">expand_more</span>
                </label>
              </div>
            </div>
          </div>

          <section className="group relative">
            <div className="absolute -inset-0.5 rounded-[2.5rem] bg-gradient-to-r from-[#2563EB]/20 to-[#8382ff]/20 opacity-50 blur" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0e0e0e] p-1">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="flex min-h-[320px] flex-col border-b border-white/5 p-8 md:p-10 lg:border-b-0 lg:border-r">
                    <label className="mb-8 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{sourceLanguageLabel} Input</label>
                  <textarea
                    value={inputText}
                    onChange={(event) => setInputText(event.target.value)}
                    className="min-h-[170px] w-full flex-1 resize-none border-none bg-transparent text-lg text-white outline-none placeholder:text-slate-700 md:text-xl"
                    style={{ fontSize: 18, lineHeight: '28px', letterSpacing: '0.2px', padding: '8px 0' }}
                      placeholder={`Type or paste ${sourceLanguageLabel.toLowerCase()} text...`}
                  />
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{characterCount} Characters</span>
                    <button
                      type="button"
                      className="rounded-full border border-white/5 bg-white/5 p-3 text-slate-400 transition-all hover:bg-white/10"
                      onClick={() => setIsListening((previous) => !previous)}
                      aria-label="Microphone"
                    >
                      <span className="material-symbols-outlined">mic</span>
                    </button>
                  </div>
                </div>

                <div className="relative flex min-h-[320px] flex-col bg-white/[0.02] p-8 md:p-10">
                  <label className="mb-8 text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563EB]">{targetLanguageLabel} Translation</label>
                  <div className="flex-1 space-y-4">
                    <h2 style={{ fontSize: 34, lineHeight: '40px', letterSpacing: '-0.5px' }} className="font-bold leading-tight tracking-tight text-white">{translatedText}</h2>
                    <p style={{ fontSize: 15, lineHeight: '22px' }} className="font-medium italic leading-relaxed text-slate-400">{romanizedText}</p>
                    {translateError && <p className="text-sm text-[#ffb4ab]">{translateError}</p>}
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button type="button" className="rounded-full border border-white/5 bg-white/5 p-3 text-slate-400 transition-all hover:bg-white/10">
                      <span className="material-symbols-outlined">volume_up</span>
                    </button>
                    <button type="button" className="rounded-full border border-white/5 bg-white/5 p-3 text-slate-400 transition-all hover:bg-white/10">
                      <span className="material-symbols-outlined">content_copy</span>
                    </button>
                  </div>
                  <button type="button" className="absolute right-8 top-6 flex items-center justify-center rounded-full border border-white/5 bg-white/5 p-3 text-slate-400 transition-all hover:bg-white/10">
                    <span className="material-symbols-outlined">history</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

            <div className="relative z-10 -mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => void processTranslation(inputText, sourceLang, targetLang)}
              className="rounded-full bg-gradient-to-r from-[#2563EB] to-[#1d4ed8] text-white transition-transform hover:scale-105"
              style={{ width: 320, height: 56, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.8px', borderRadius: 28, boxShadow: '0 22px 44px rgba(37,99,235,0.36), 0 8px 24px rgba(17,24,39,0.6)' }}
            >
              {isProcessing ? 'Processing...' : 'Process Translation'}
            </button>
          </div>

          <section className="space-y-6 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Live Lens Activity</h3>
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#ffb4ab] animate-pulse">
                <span className="h-2 w-2 rounded-full bg-[#ffb4ab]" /> Live Stream
              </span>
            </div>
            <div className="group relative h-[400px] overflow-hidden rounded-[2.5rem] border border-white/5">
              <img
                className="h-full w-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBYAAeTEN4Rkz8qwFksCYC0IL0WmeoNrqoA5M_aNuVWHvnjNnuQO3WO6RxVxkTynJQF_tpNn2jm6xE5zBQKFac4QnfRQKIR7oyyK9flkDp8hiENUMdGE9AM5wzk0VSt_E6iYxk0y0-OiLMIiwulz6UUjDBiltuZDcl9FQ_rS5PEnPKpYJogwJDU4jwZw3aQheBlo9QHJhfcZE8_1teaigir4sUQT9fB84Gc2a6V7SP7Cq0c4B44_29WgPZPfDNys-ujsDlSkQcNmf4"
                alt="Live lens street scene"
              />
              <div className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="relative">
                  <div className="absolute h-32 w-56 animate-pulse rounded-lg border-2 border-[#2563EB]/60" />
                  <div className="glass-panel absolute -top-16 left-0 flex min-w-[200px] items-center gap-4 rounded-2xl border-l-4 border-[#2563EB] px-5 py-3 shadow-2xl">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB]/20">
                      <span className="material-symbols-outlined text-base text-[#2563EB]">translate</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="mb-0.5 text-[9px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Ramen Shop</span>
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-bold tracking-wide text-white">ラーメン屋</span>
                        <span className="text-[11px] font-medium italic text-slate-300 opacity-80">(Rāmen-ya)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-4">
                <button className="rounded-full border border-white/10 bg-slate-950/80 text-white backdrop-blur-xl" style={{ width: 56, height: 56 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
                <button className="rounded-full bg-[#2563EB] text-white shadow-2xl shadow-[#2563EB]/40" style={{ width: 56, height: 56 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>photo_camera</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="xl:col-span-4 space-y-8">
          <div className="rounded-[2rem] bg-gradient-to-br from-[#ffbc7c]/10 to-transparent p-[1px]">
            <div className="rounded-[2rem] border border-white/5 bg-[#1c1b1b] p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ffbc7c]/20 bg-[#fe9400]/20 text-[#ffbc7c]">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>lightbulb</span>
                </div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffbc7c]">Cultural Insight</h3>
              </div>
              <h4 className="mb-2 text-xl font-bold text-white">{culturalIntel?.title || 'Local etiquette for your current location'}</h4>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">{culturalIntel?.locationLabel || 'Awaiting location'}</p>
              <p className="mb-4 text-sm leading-relaxed text-slate-400">
                {locationStatus}
              </p>
              <div className="mt-2 rounded-[1.4rem] border border-white/5 bg-white/[0.03] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Swipe cards</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={goToPreviousCulturalCard}
                      className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition-all duration-200 hover:-translate-x-0.5 hover:bg-white/10"
                      aria-label="Show previous cultural card"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                    </button>
                    <button
                      type="button"
                      onClick={goToNextCulturalCard}
                      className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition-all duration-200 hover:translate-x-0.5 hover:bg-white/10"
                      aria-label="Show next cultural card"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[1.4rem]">
                  <div
                    className="flex transition-transform duration-500 ease-out will-change-transform"
                    style={{ transform: `translateX(-${culturalCardIndex * 100}%)` }}
                  >
                    {culturalDeck.map((card) => (
                      <div key={card.key} className="min-w-full p-0">
                        <div className={`rounded-[1.4rem] border border-white/5 bg-gradient-to-br ${card.accent} p-4`}>
                          <div className="mb-3 flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-white">
                              <span className="material-symbols-outlined text-[18px]">{card.icon}</span>
                            </span>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">{card.label}</p>
                              <p className="text-[11px] text-slate-400">{card.items.length ? `${card.items.length} local note${card.items.length === 1 ? '' : 's'}` : 'Fallback guidance'}</p>
                            </div>
                          </div>
                          {card.items.length > 0 ? (
                            <ul className="space-y-2 text-sm leading-relaxed text-slate-100">
                              {card.items.map((item) => (
                                <li key={item} className="flex gap-2">
                                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/80" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm leading-relaxed text-slate-100">{card.empty}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-center gap-2">
                  {culturalDeck.map((card, index) => (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() => setCulturalCardIndex(index)}
                      className={`h-2.5 rounded-full transition-all duration-300 ${index === culturalCardIndex ? 'w-8 bg-[#ffbc7c]' : 'w-2.5 bg-white/20 hover:bg-white/35'}`}
                      aria-label={`Show ${card.label} card`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="px-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Essential Phrases</h3>
            {phraseCards.map((card) => (
              <div key={card.label} className="glass-panel group cursor-pointer rounded-3xl border border-white/5 p-6 transition-all hover:bg-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className={`material-symbols-outlined ${card.tone === 'error' ? 'text-[#ffb4ab]' : 'text-[#2563EB]'}`}>{card.icon}</span>
                    <span className="text-sm font-bold uppercase tracking-widest text-slate-200">{card.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-600">{card.count}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="relative rounded-3xl border border-white/5 bg-[#1c1b1b] p-8">
            <div className="mb-8 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Offline Packs</h3>
              <span className="material-symbols-outlined cursor-pointer text-slate-600 hover:text-slate-400">settings</span>
            </div>
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex justify-between">
                  <span className="text-sm font-bold text-white">Japanese</span>
                  <span className="text-[10px] font-bold uppercase text-[#2563EB]">Downloaded</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a2a2a]">
                  <div className="h-full w-full bg-[#2563EB]" />
                </div>
                <p className="mt-2 text-[10px] text-slate-600">1.2 GB • Last updated today</p>
              </div>
              <div>
                <div className="mb-2 flex justify-between">
                  <span className="text-sm font-bold text-slate-500">French</span>
                  <button className="text-[10px] font-bold uppercase text-slate-400 hover:text-[#2563EB]">Download</button>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a2a2a]">
                  <div className="h-full w-0 bg-slate-700" />
                </div>
                <p className="mt-2 text-[10px] text-slate-600">850 MB Available</p>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 z-50">
              <button className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-2xl shadow-[#2563EB]/40 transition-transform duration-300 hover:scale-110">
                <span className="material-symbols-outlined text-2xl">auto_awesome</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 z-50 flex h-24 w-full items-center justify-around rounded-t-[2.5rem] border-t border-white/5 bg-slate-950/80 px-6 shadow-[0_-8px_30px_rgb(0,0,0,0.5)] backdrop-blur-3xl md:hidden">
        {bottomTabs.map((tab) => (
          <a
            key={tab.label}
            href="#"
            className={`flex flex-col items-center justify-center rounded-full px-6 py-2 transition-transform ${tab.active ? 'scale-110 bg-[#2563EB]/20 text-[#2563EB]' : 'text-slate-500 hover:text-blue-200'}`}
          >
            <span className="material-symbols-outlined">{tab.icon}</span>
            <span className="font-manrope text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
          </a>
        ))}
      </nav>

      <div className="pointer-events-none fixed bottom-5 right-5 z-50 hidden md:block">
        <button className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-2xl shadow-[#2563EB]/40 transition-transform hover:scale-110">
          <span className="material-symbols-outlined text-2xl">auto_awesome</span>
        </button>
      </div>
    </div>
  )
}
