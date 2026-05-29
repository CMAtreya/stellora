import { useEffect, useMemo, useRef, useState } from 'react'
import { recognize } from 'tesseract.js'
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

const LIBRE_TRANSLATE_ENDPOINT = 'https://translate.argosopentech.com/translate'
const OCR_LANGS = 'eng+spa+fra+deu+hin+ara+chi_sim+jpn'

type LensOverlay = {
  id: string
  text: string
  translatedText: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

type FrameSize = {
  width: number
  height: number
}

const normalizeScanText = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()

const mapBboxToCoverFrame = (bbox: LensOverlay['bbox'], sourceWidth: number, sourceHeight: number, frameSize: FrameSize) => {
  const scale = Math.max(frameSize.width / sourceWidth, frameSize.height / sourceHeight)
  const renderedWidth = sourceWidth * scale
  const renderedHeight = sourceHeight * scale
  const offsetX = (frameSize.width - renderedWidth) / 2
  const offsetY = (frameSize.height - renderedHeight) / 2

  return {
    left: offsetX + bbox.x0 * scale,
    top: offsetY + bbox.y0 * scale,
    width: (bbox.x1 - bbox.x0) * scale,
    height: (bbox.y1 - bbox.y0) * scale,
  }
}

export default function TranslatorPage() {
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('ja')
  const [lensTargetLang, setLensTargetLang] = useState('en')
  const [inputText, setInputText] = useState('Where can I find the best local ramen near the station?')
  const [translatedText, setTranslatedText] = useState('駅の近くで一番美味しいラーメン屋はどこですか？')
  const [romanizedText, setRomanizedText] = useState('Eki no chikaku de ichiban oishii rāmen-ya wa doko desu ka?')
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [translateError, setTranslateError] = useState('')
  const [culturalIntel, setCulturalIntel] = useState<CulturalIntel | null>(null)
  const [locationStatus, setLocationStatus] = useState('Detecting your current location...')
  const [culturalCardIndex, setCulturalCardIndex] = useState(0)
  const [lensOverlays, setLensOverlays] = useState<LensOverlay[]>([])
  const [lensStatus, setLensStatus] = useState('Starting live lens...')
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [isLensRunning, setIsLensRunning] = useState(true)
  const [isLensLanguageMenuOpen, setIsLensLanguageMenuOpen] = useState(false)
  const [frameSize, setFrameSize] = useState<FrameSize>({ width: 0, height: 0 })
  const translationRunId = useRef(0)
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<any>(null)
  const mediaStreamRef = useRef<any>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lensFrameRef = useRef<HTMLDivElement | null>(null)
  const lensBadgeMenuRef = useRef<HTMLDivElement | null>(null)
  const scanLoopRef = useRef<number | null>(null)
  const scanTimeoutRef = useRef<number | null>(null)
  const scanInFlightRef = useRef(false)
  const scanQueuedRef = useRef(false)
  const scanPauseUntilRef = useRef(0)
  const translateCacheRef = useRef(new Map<string, string>())
  const lastOverlaySignatureRef = useRef('')
  const streamRef = useRef<MediaStream | null>(null)

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
  const lensTargetLanguageLabel = translationLanguageMap.get(lensTargetLang) || lensTargetLang.toUpperCase()
  const targetLanguageOptions = translationLanguages.filter((language) => language.code !== 'auto')

  useEffect(() => {
    const element = lensFrameRef.current
    if (!element) return

    const updateFrameSize = () => {
      setFrameSize({ width: element.clientWidth, height: element.clientHeight })
    }

    updateFrameSize()
    const observer = new ResizeObserver(updateFrameSize)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isLensLanguageMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (lensBadgeMenuRef.current && !lensBadgeMenuRef.current.contains(event.target as Node)) {
        setIsLensLanguageMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLensLanguageMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isLensLanguageMenuOpen])

  const translateWithLibre = async (text: string) => {
    const normalizedText = normalizeScanText(text)
    const cacheKey = `${lensTargetLang}:${normalizedText}`
    const cachedTranslation = translateCacheRef.current.get(cacheKey)
    if (cachedTranslation) return cachedTranslation

    if (Date.now() < scanPauseUntilRef.current) {
      return text
    }

    const response = await fetch(LIBRE_TRANSLATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'auto', target: lensTargetLang, format: 'text' }),
    })

    if (!response.ok) {
      if (response.status === 429) {
        scanPauseUntilRef.current = Date.now() + 15_000
        throw new Error('Translation service is rate limited. Retrying shortly.')
      }
      const textBody = await response.text()
      throw new Error(`Translation failed: ${response.status} ${textBody}`)
    }

    const data = await response.json()
    const translated = String(data?.translatedText || '').trim() || text
    translateCacheRef.current.set(cacheKey, translated)
    return translated
  }

  const runLensScan = async () => {
    if (scanInFlightRef.current) {
      scanQueuedRef.current = true
      return
    }

    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (!video || !canvas || !isCameraReady || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return
    }

    scanInFlightRef.current = true
    setLensStatus('Scanning frame...')

    try {
      const context = canvas.getContext('2d')
      if (!context) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      const result: any = await recognize(canvas, OCR_LANGS)
      const lines = (result?.data?.lines || result?.data?.words || []) as Array<{
        text?: string
        confidence?: number
        bbox?: { x0: number; y0: number; x1: number; y1: number }
      }>

      const nextOverlays: LensOverlay[] = []
      for (const [index, item] of lines.entries()) {
        const text = String(item.text || '').trim()
        const bbox = item.bbox
        const confidence = Number(item.confidence || 0)
        if (!text || !bbox || confidence < 35) continue

        try {
          const translatedText = await translateWithLibre(text)
          nextOverlays.push({
            id: `${index}-${bbox.x0}-${bbox.y0}-${bbox.x1}-${bbox.y1}`,
            text,
            translatedText,
            confidence,
            bbox,
          })
        } catch (error: any) {
          setLensStatus(error?.message || 'Scanning in progress...')
        }
      }

      const overlaySignature = nextOverlays.map((item) => `${item.text}=>${item.translatedText}`).join('|')
      if (!nextOverlays.length) {
        lastOverlaySignatureRef.current = ''
        setLensOverlays([])
        setLensStatus('Scanning for text...')
        return
      }
      if (overlaySignature !== lastOverlaySignatureRef.current) {
        lastOverlaySignatureRef.current = overlaySignature
        setLensOverlays(nextOverlays)
      }

      setLensStatus(nextOverlays.length ? 'Live translation active' : 'Scanning for text...')
    } catch (error: any) {
      setLensStatus(error?.message || 'Live lens is running')
    } finally {
      scanInFlightRef.current = false
      if (scanQueuedRef.current) {
        scanQueuedRef.current = false
        void runLensScan()
      }
    }
  }

  const clearLensOverlay = (message = 'Live lens cleared') => {
    setLensOverlays([])
    lastOverlaySignatureRef.current = ''
    setLensStatus(message)
  }

  const scheduleLensScan = () => {
    if (!isCameraReady || !isLensRunning) return

    if (scanTimeoutRef.current) {
      window.clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
    }

    scanTimeoutRef.current = window.setTimeout(() => {
      void runLensScan()
    }, 350)
  }

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

  // Speech recognition (Web Speech API) - start/stop when `isListening` toggles
  useEffect(() => {
    if (!isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (err) {
          // ignore
        }
        recognitionRef.current = null
      }
      return
    }

    const win: any = window
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition
    if (!SpeechRecognition) {
      const supportsMedia = !!(navigator.mediaDevices && (window as any).MediaRecorder)
      if (!supportsMedia) {
        setTranslateError('Speech recognition not supported in this browser.')
        setIsListening(false)
        return
      }

      const startMediaRecorder = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          mediaStreamRef.current = stream
          let recorder: any
          try {
            recorder = new (window as any).MediaRecorder(stream, { mimeType: 'audio/webm' })
          } catch (e) {
            recorder = new (window as any).MediaRecorder(stream)
          }

          const chunks: any[] = []
          recorder.ondataavailable = (ev: any) => {
            if (ev.data && ev.data.size) chunks.push(ev.data)
          }
          recorder.onstop = async () => {
            try {
              const blob = new Blob(chunks, { type: 'audio/webm' })
              const form = new FormData()
              form.append('file', blob, 'recording.webm')
              setTranslateError('Transcribing audio...')
              const resp = await fetch('/api/translator/speech', { method: 'POST', body: form })
              if (!resp.ok) {
                const txt = await resp.text()
                setTranslateError(`Transcription failed: ${resp.status} ${txt}`)
              } else {
                const data = await resp.json()
                const text = data?.text || ''
                if (text) {
                  setInputText(text)
                  void processTranslation(text, sourceLang, targetLang)
                  setTranslateError('')
                } else {
                  setTranslateError('No transcription returned from server.')
                }
              }
            } catch (err: any) {
              setTranslateError(err?.message || 'Transcription failed')
            } finally {
              try {
                mediaStreamRef.current?.getTracks?.().forEach((t: any) => t.stop())
              } catch (e) {
                // ignore
              }
              mediaStreamRef.current = null
              mediaRecorderRef.current = null
              setIsListening(false)
            }
          }

          mediaRecorderRef.current = recorder
          recorder.start()
        } catch (err: any) {
          setTranslateError(err?.message || 'Could not start audio recording')
          setIsListening(false)
        }
      }

      void startMediaRecorder()
      return
    }

    const recog = new SpeechRecognition()
    // Use sourceLang where possible; fallback to browser default
    try {
      recog.lang = sourceLang === 'auto' ? 'en-US' : sourceLang
    } catch (e) {
      // ignore invalid lang codes
    }
    recog.interimResults = false
    recog.maxAlternatives = 1

    recog.onresult = (ev: any) => {
      try {
        const transcript = Array.from(ev.results).map((r: any) => r[0].transcript).join(' ')
        setInputText(transcript)
        void processTranslation(transcript, sourceLang, targetLang)
      } catch (err) {
        // ignore
      }
    }

    recog.onerror = (ev: any) => {
      setTranslateError(ev?.error || 'Speech recognition error')
      setIsListening(false)
    }

    recog.onend = () => {
      setIsListening(false)
    }

    try {
      recog.start()
      recognitionRef.current = recog
    } catch (err) {
      setTranslateError('Could not start speech recognition')
      setIsListening(false)
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          // ignore
        }
        recognitionRef.current = null
      }
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop()
        } catch (e) {
          // ignore
        }
        mediaRecorderRef.current = null
      }
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks?.().forEach((t: any) => t.stop())
        } catch (e) {
          // ignore
        }
        mediaStreamRef.current = null
      }
    }
  }, [isListening, sourceLang, targetLang])

  useEffect(() => {
    const text = inputText.trim()
    if (!text) return
    void processTranslation(text, sourceLang, targetLang)
  }, [inputText, sourceLang, targetLang])

  useEffect(() => {
    let cancelled = false

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setLensStatus('Camera access is not supported in this browser.')
        return
      }

      try {
        setLensStatus('Requesting camera permission...')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        await video.play()
        setIsCameraReady(true)
        setIsLensRunning(true)
        setLensStatus('Live camera active')
        scheduleLensScan()
      } catch (error: any) {
        setIsCameraReady(false)
        setLensStatus(error?.message || 'Camera access denied')
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      if (scanLoopRef.current) {
        window.clearInterval(scanLoopRef.current)
        scanLoopRef.current = null
      }
      if (scanTimeoutRef.current) {
        window.clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      scanInFlightRef.current = false
      scanQueuedRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      setIsCameraReady(false)
    }
  }, [])

  useEffect(() => {
    if (!isCameraReady) return
    clearLensOverlay('Language changed, rescanning...')
    scheduleLensScan()
  }, [lensTargetLang, isCameraReady])

  useEffect(() => {
    if (!isCameraReady || !isLensRunning) {
      if (scanLoopRef.current) {
        window.clearInterval(scanLoopRef.current)
        scanLoopRef.current = null
      }
      if (scanTimeoutRef.current) {
        window.clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      return
    }

    if (scanLoopRef.current) {
      window.clearInterval(scanLoopRef.current)
      scanLoopRef.current = null
    }

    if (scanTimeoutRef.current) {
      window.clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
    }

    scheduleLensScan()

    return () => {
      if (scanLoopRef.current) {
        window.clearInterval(scanLoopRef.current)
        scanLoopRef.current = null
      }
      if (scanTimeoutRef.current) {
        window.clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
    }
  }, [isCameraReady, isLensRunning, lensTargetLang])

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
                <div className="flex flex-col gap-1.5">
                  <label className="relative inline-flex items-center">
                    <select
                      value={targetLang}
                      onChange={(event) => setTargetLang(event.target.value)}
                      className="h-8 min-w-[168px] appearance-none rounded-full border border-white/5 bg-[#2a2a2a] px-3.5 pr-8 text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-300 outline-none transition-colors hover:bg-[#313131] focus:bg-[#313131] focus-visible:outline-none"
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
                    <div className="flex items-center gap-2">
                      {isListening && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-red-200">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-red-300" />
                          Recording
                        </span>
                      )}
                      <button
                        type="button"
                        className={
                          `rounded-full border border-white/5 p-3 transition-all ` +
                          (isListening
                            ? 'bg-white/10 text-white'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10')
                        }
                        onClick={() => setIsListening((previous) => !previous)}
                        aria-label={isListening ? 'Stop recording' : 'Start microphone'}
                        aria-pressed={isListening}
                      >
                        <span className="material-symbols-outlined">mic</span>
                      </button>
                      {isListening && (
                        <button
                          type="button"
                          onClick={() => setIsListening(false)}
                          className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-red-200 transition-colors hover:bg-red-500/20"
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="relative flex min-h-[320px] flex-col bg-white/[0.02] p-8 md:p-10">
                  <label className="mb-8 text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563EB]">{targetLanguageLabel} Translation</label>
                  <div className="flex-1 space-y-4">
                    <h2 style={{ fontSize: 34, lineHeight: '40px', letterSpacing: '-0.5px' }} className="font-bold leading-tight tracking-tight text-white">{translatedText}</h2>
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
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#7dd3fc] animate-pulse">
                <span className="h-2 w-2 rounded-full bg-[#7dd3fc]" /> {lensStatus}
              </span>
            </div>
            <div ref={lensFrameRef} className="group relative h-[400px] overflow-hidden rounded-[2.5rem] border border-white/5 bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
              <canvas ref={captureCanvasRef} className="hidden" />
              <div className="pointer-events-none absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
              <div ref={lensBadgeMenuRef} className="absolute right-4 top-4 z-20">
                <button
                  type="button"
                  onClick={() => setIsLensLanguageMenuOpen((current) => !current)}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-100 backdrop-blur-xl transition-colors hover:bg-slate-900/80"
                  aria-expanded={isLensLanguageMenuOpen}
                  aria-haspopup="menu"
                  aria-label={`Change live OCR output language, currently ${lensTargetLanguageLabel}`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_0_rgba(52,211,153,0.35)] animate-pulse" />
                  Auto OCR · {lensTargetLanguageLabel}
                  <span className="material-symbols-outlined text-[14px] text-slate-300">expand_more</span>
                </button>

                {isLensLanguageMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_24px_70px_rgba(2,6,23,0.55)] backdrop-blur-2xl">
                    <div className="px-3 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      Output language
                    </div>
                    <div className="max-h-72 overflow-auto pr-1 scrollbar-hide">
                      {targetLanguageOptions.map((language) => {
                        const isSelected = language.code === lensTargetLang
                        return (
                          <button
                            key={language.code}
                            type="button"
                            onClick={() => {
                              setLensTargetLang(language.code)
                              setIsLensLanguageMenuOpen(false)
                            }}
                            className={
                              `flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ` +
                              (isSelected
                                ? 'bg-[#2563EB]/20 text-white'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white')
                            }
                          >
                            <span className="font-semibold">{language.label}</span>
                            {isSelected && <span className="material-symbols-outlined text-[18px] text-[#7dd3fc]">check</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="pointer-events-none absolute inset-0 z-10">
                {lensOverlays.map((overlay) => {
                  if (!frameSize.width || !frameSize.height) return null
                  const sourceWidth = videoRef.current?.videoWidth || 1
                  const sourceHeight = videoRef.current?.videoHeight || 1
                  const coordinates = mapBboxToCoverFrame(overlay.bbox, sourceWidth, sourceHeight, frameSize)
                  return (
                    <div
                      key={overlay.id}
                      className="absolute rounded-2xl border border-[#2563EB]/50 bg-slate-950/75 px-3 py-2 shadow-[0_18px_48px_rgba(2,6,23,0.45)] backdrop-blur-lg"
                      style={{
                        left: `${coordinates.left}px`,
                        top: `${coordinates.top}px`,
                        width: `${Math.max(coordinates.width, 140)}px`,
                        minHeight: `${Math.max(coordinates.height, 48)}px`,
                      }}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#7dd3fc]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#7dd3fc]" />
                        Translated to {lensTargetLanguageLabel}
                      </div>
                      <div className="leading-tight text-white">
                        <div className="text-[11px] font-semibold text-slate-200/90 line-clamp-2">{overlay.translatedText}</div>
                        <div className="mt-1 text-[10px] italic text-slate-400/80 line-clamp-2">{overlay.text}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2">
                <div className="relative">
                </div>
              </div>

              <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsLensRunning((current) => {
                      const next = !current
                      setLensStatus(next ? 'Live camera active' : 'Scanning paused')
                      if (next) {
                        void runLensScan()
                      }
                      return next
                    })
                  }}
                  className="rounded-full border border-white/10 bg-slate-950/80 text-white backdrop-blur-xl transition-colors hover:bg-slate-900"
                  style={{ width: 56, height: 56 }}
                  aria-label="Pause or resume live OCR"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{isLensRunning ? 'pause' : 'play_arrow'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearLensOverlay('Overlay cleared')
                    void runLensScan()
                  }}
                  className="rounded-full bg-[#2563EB] text-white shadow-2xl shadow-[#2563EB]/40"
                  style={{ width: 56, height: 56 }}
                  aria-label="Refresh OCR overlay"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>restart_alt</span>
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
