import { useEffect, useMemo, useRef, useState } from 'react'
import TripArcNav from '../components/TripArcNav'

// Available dictation enhancement modes
const dictationModes = [
  { id: 'general', label: 'General Voice', icon: 'chat', description: 'Standard text dictation with punctuation and grammar corrections' },
  { id: 'email', label: 'Email Dictation', icon: 'mail', description: 'Reformats your speech into a structured, professional email' },
  { id: 'code', label: 'Code Dictation', icon: 'code', description: 'Preserves technical formatting, indentations, and naming conventions' },
  { id: 'meeting', label: 'Meeting Notes', icon: 'groups', description: 'Condenses the dictation into bulleted action items and notes' },
  { id: 'academic', label: 'Academic/Prof.', icon: 'school', description: 'Applies formal writing styles, syntax, and advanced vocabulary' }
]

// Target languages
const translationLanguages = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-cn', label: 'Chinese (Simplified)' },
  { code: 'hi', label: 'Hindi' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
]

export default function TranslatorPage() {
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('ja')
  const [activeMode, setActiveMode] = useState('general')
  const [inputText, setInputText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [detectedLanguage, setDetectedLanguage] = useState('')
  const [confidence, setConfidence] = useState<number | null>(null)
  
  const [isListening, setIsListening] = useState(false)
  const [isSpeakingSignal, setIsSpeakingSignal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  
  // Custom vocabulary state
  const [customVocabulary, setCustomVocabulary] = useState<string[]>([])
  const [newWord, setNewWord] = useState('')
  const [vocabOpen, setVocabOpen] = useState(false)
  
  // Copy indicators
  const [copiedInput, setCopiedInput] = useState(false)
  const [copiedOutput, setCopiedOutput] = useState(false)
  
  // TTS indicator
  const [isSpeakingTTS, setIsSpeakingTTS] = useState(false)

  // AR Camera Translator state
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [arMode, setArMode] = useState<'overlay' | 'split' | 'boxes'>('overlay')
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5)
  const [visionRefine, setVisionRefine] = useState(true)
  const [arTranslations, setArTranslations] = useState<any[]>([])
  const [inpaintedImage, setInpaintedImage] = useState<string | null>(null)
  const [arFps, setArFps] = useState(0)
  const [gpuUsage, setGpuUsage] = useState(0)
  const [gpuStatus, setGpuStatus] = useState('Idle')
  const [latencyBreakdown, setLatencyBreakdown] = useState({
    ocr: 0,
    translation: 0,
    inpaint: 0,
    render: 0,
    total: 0
  })
  const [isProcessingAR, setIsProcessingAR] = useState(false)
  const [arErrorMessage, setArErrorMessage] = useState('')

  // Web Audio and WebSocket refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // AR Camera Refs
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const arCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const arStreamRef = useRef<MediaStream | null>(null)
  const arLoopRef = useRef<any>(null)


  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    document.title = 'AI Dictate & Translate | Stellora'
    document.documentElement.classList.add('dark')
    void fetchVocabulary()
    
    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+M or Space (when focus is not in text inputs) to toggle recording
      const isInputFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA'
      if ((e.altKey && e.key.toLowerCase() === 'm') || (e.key === ' ' && !isInputFocused)) {
        if (e.key === ' ') {
          e.preventDefault() // prevent scrolling
        }
        toggleRecording()
      } else if (e.key === 'Escape') {
        stopRecording()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.documentElement.classList.remove('dark')
      window.removeEventListener('keydown', handleKeyDown)
      cleanupAudio()
    }
  }, [isListening, targetLang, activeMode, customVocabulary])

  // Enumerate cameras when component mounts or camera is activated
  useEffect(() => {
    if (cameraActive) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          const videoDevices = devices.filter(d => d.kind === 'videoinput')
          setCameraDevices(videoDevices)
          if (videoDevices.length > 0 && !selectedDeviceId) {
            const rearCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment') || d.label.toLowerCase().includes('rear'))
            setSelectedDeviceId(rearCamera ? rearCamera.deviceId : videoDevices[0].deviceId)
          }
        })
        .catch(err => {
          console.error('Failed to enumerate video devices:', err)
        })
    }
  }, [cameraActive])

  // Handle active camera streaming
  useEffect(() => {
    if (cameraActive) {
      void startCamera()
    } else {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [cameraActive, selectedDeviceId])

  const startCamera = async () => {
    setArErrorMessage('')
    stopCamera() // close previous stream if any

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 120, min: 60 },
          facingMode: selectedDeviceId ? undefined : 'environment'
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      arStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          void videoRef.current?.play()
          startARLoop()
        }
      }
    } catch (err: any) {
      console.error('Failed to access camera:', err)
      setArErrorMessage(err.message || 'Camera access denied. Please verify camera connections and grant permissions.')
      setCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (arLoopRef.current) {
      clearTimeout(arLoopRef.current)
      arLoopRef.current = null
    }
    if (arStreamRef.current) {
      arStreamRef.current.getTracks().forEach(track => track.stop())
      arStreamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsProcessingAR(false)
    setInpaintedImage(null)
    setArTranslations([])
    setArFps(0)
    setGpuUsage(0)
    setGpuStatus('Idle')
  }

  const startARLoop = () => {
    if (arLoopRef.current) {
      clearTimeout(arLoopRef.current)
    }

    const captureFrame = async () => {
      const video = videoRef.current
      if (!video || video.paused || video.ended || !cameraActive) {
        return
      }

      if (isProcessingAR) {
        arLoopRef.current = setTimeout(captureFrame, 100)
        return
      }

      setIsProcessingAR(true)
      try {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1.0, 640 / Math.max(video.videoWidth, 1))
        canvas.width = Math.round(video.videoWidth * scale) || 640
        canvas.height = Math.round(video.videoHeight * scale) || 480
        
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
          
          const res = await fetch(`${apiBase}/api/translator/ar/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: dataUrl,
              target_lang: targetLang,
              vision_refine: visionRefine
            })
          })

          if (res.ok) {
            const data = await res.json()
            if (data.translations) {
              setArTranslations(data.translations)
              if (data.translations.length === 0) {
                setInpaintedImage(null)
              } else if (data.inpainted_image) {
                setInpaintedImage(data.inpainted_image)
              }
            } else {
              setArTranslations([])
              setInpaintedImage(null)
            }
            if (data.fps !== undefined) {
              setArFps(data.fps)
            }
            if (data.gpu_utilization !== undefined) {
              setGpuUsage(data.gpu_utilization)
            }
            if (data.gpu_status !== undefined) {
              setGpuStatus(data.gpu_status)
            }
            if (data.latency) {
              setLatencyBreakdown(data.latency)
            }
          }
        }
      } catch (err) {
        console.error('AR frame processing failed:', err)
      } finally {
        setIsProcessingAR(false)
        if (cameraActive) {
          arLoopRef.current = setTimeout(captureFrame, 250)
        }
      }
    }

    arLoopRef.current = setTimeout(captureFrame, 300)
  }

  const saveARSnapshot = () => {
    const video = videoRef.current
    if (!video) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (arMode === 'overlay' && inpaintedImage) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        drawTextOverlays(ctx, canvas.width, canvas.height)
        triggerDownload(canvas)
      }
      img.src = inpaintedImage
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      drawTextOverlays(ctx, canvas.width, canvas.height)
      triggerDownload(canvas)
    }
  }

  const drawTextOverlays = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    arTranslations
      .filter(t => t.confidence >= confidenceThreshold)
      .forEach(trans => {
        const [ymin, xmin, ymax, xmax] = trans.box_2d
        const ymin_px = (ymin / 1000) * h
        const xmin_px = (xmin / 1000) * w
        const ymax_px = (ymax / 1000) * h
        const xmax_px = (xmax / 1000) * w
        
        ctx.save()
        
        const cx = (xmin_px + xmax_px) / 2
        const cy = (ymin_px + ymax_px) / 2
        
        ctx.translate(cx, cy)
        ctx.rotate((trans.rotation * Math.PI) / 180)
        
        ctx.fillStyle = trans.font_color || '#ffffff'
        ctx.font = `bold ${trans.font_size || 16}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
        ctx.shadowBlur = 4
        ctx.fillText(trans.translated_text, 0, 0)
        
        ctx.restore()
      })
  }

  const triggerDownload = (canvas: HTMLCanvasElement) => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    const link = document.createElement('a')
    link.download = `stellora-ar-translation-${Date.now()}.jpg`
    link.href = dataUrl
    link.click()
  }

  // Trigger auto-translation on input text change (manual typing or dictation updates)
  useEffect(() => {
    // Skip if mic is actively recording to avoid conflicts with real-time audio pipeline
    if (isListening) return

    const text = inputText.trim()
    if (!text) {
      setTranslatedText('')
      setDetectedLanguage('')
      setConfidence(null)
      return
    }

    // Debounce translation requests by 450ms to prevent heavy requests on typing
    const delayDebounceId = setTimeout(async () => {
      setIsProcessing(true)
      setErrorMessage('')
      try {
        const res = await fetch(`${apiBase}/api/translator/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            sourceLang: 'auto',
            targetLang
          })
        })

        if (res.ok) {
          const data = await res.json()
          if (data.translatedText) {
            setTranslatedText(data.translatedText)
          }
          if (data.detectedLanguage) {
            setDetectedLanguage(data.detectedLanguage)
          }
          if (data.confidence !== undefined) {
            setConfidence(data.confidence)
          }
        }
      } catch (err: any) {
        console.error('Failed to translate typed input:', err)
      } finally {
        setIsProcessing(false)
      }
    }, 450)

    return () => clearTimeout(delayDebounceId)
  }, [inputText, targetLang, isListening])

  // Fetch vocabulary from backend
  const fetchVocabulary = async () => {
    try {
      const res = await fetch(`${apiBase}/api/translator/vocabulary`)
      if (res.ok) {
        const data = await res.json()
        setCustomVocabulary(data)
      }
    } catch (err) {
      console.error('Failed to fetch vocabulary from backend:', err)
      // Local storage fallback
      const cached = localStorage.getItem('stellora:custom_vocab')
      if (cached) {
        setCustomVocabulary(JSON.parse(cached))
      }
    }
  }

  // Save/add vocabulary to backend
  const addWord = async () => {
    const word = newWord.trim()
    if (!word) return
    try {
      const res = await fetch(`${apiBase}/api/translator/vocabulary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: word })
      })
      if (res.ok) {
        const data = await res.json()
        setCustomVocabulary(data)
        localStorage.setItem('stellora:custom_vocab', JSON.stringify(data))
      }
      setNewWord('')
    } catch (err) {
      console.error('Failed to save vocabulary:', err)
      // Save locally
      const nextVocab = [...customVocabulary, word]
      setCustomVocabulary(nextVocab)
      localStorage.setItem('stellora:custom_vocab', JSON.stringify(nextVocab))
      setNewWord('')
    }
  }

  // Delete vocabulary word
  const deleteWord = async (word: string) => {
    try {
      const res = await fetch(`${apiBase}/api/translator/vocabulary/${encodeURIComponent(word)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        const data = await res.json()
        setCustomVocabulary(data)
        localStorage.setItem('stellora:custom_vocab', JSON.stringify(data))
      }
    } catch (err) {
      console.error('Failed to delete word:', err)
      const nextVocab = customVocabulary.filter(w => w !== word)
      setCustomVocabulary(nextVocab)
      localStorage.setItem('stellora:custom_vocab', JSON.stringify(nextVocab))
    }
  }

  // Web Audio and WebSocket cleanup
  const cleanupAudio = () => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING) {
        socketRef.current.close()
      }
      socketRef.current = null
    }
  }

  const toggleRecording = () => {
    if (isListening) {
      stopRecording()
    } else {
      void startRecording()
    }
  }

  const startRecording = async () => {
    setErrorMessage('')
    cleanupAudio()
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Establish WebSocket
      const wsUrl = apiBase.replace(/^http/, 'ws') + '/api/translator/stream'
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        console.log('WebSocket connection established.')
        // Send config payload
        socket.send(JSON.stringify({
          targetLang,
          mode: activeMode,
          vocabulary: customVocabulary,
          silenceLimitMs: 900,
          thresholdRms: 300.0
        }))
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'ready') {
            setIsListening(true)
            console.log('Backend pipeline ready. Recording speech.')
          } else if (data.type === 'status') {
            setIsSpeakingSignal(data.isSpeaking)
            if (data.isProcessing) {
              setIsProcessing(true)
            }
          } else if (data.type === 'result') {
            setIsProcessing(false)
            if (data.transcript) {
              setInputText(prev => prev ? prev + ' ' + data.transcript : data.transcript)
            }
            if (data.translation) {
              setTranslatedText(prev => prev ? prev + ' ' + data.translation : data.translation)
            }
            if (data.detectedLanguage) {
              setDetectedLanguage(data.detectedLanguage)
            }
            if (data.confidence !== undefined) {
              setConfidence(data.confidence)
            }
          } else if (data.type === 'error') {
            setErrorMessage(data.message)
            stopRecording()
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }

      socket.onerror = () => {
        setErrorMessage('WebSocket connection error.')
        stopRecording()
      }

      socket.onclose = () => {
        setIsListening(false)
        setIsSpeakingSignal(false)
        setIsProcessing(false)
        console.log('WebSocket connection closed.')
      }

      // Initialize Web Audio API
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 })
      audioContextRef.current = audioCtx
      
      const source = audioCtx.createMediaStreamSource(stream)
      
      const analyser = audioCtx.createAnalyser()
      analyserRef.current = analyser
      analyser.fftSize = 256
      
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      source.connect(analyser)
      analyser.connect(processor)
      processor.connect(audioCtx.destination)

      processor.onaudioprocess = (e) => {
        const floatData = e.inputBuffer.getChannelData(0)
        // Convert Float32Array to Int16Array (16-bit PCM)
        const int16Buffer = new Int16Array(floatData.length)
        for (let i = 0; i < floatData.length; i++) {
          const sample = Math.max(-1, Math.min(1, floatData[i]))
          int16Buffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
        }
        
        // Stream bytes to WebSocket if ready
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(int16Buffer.buffer)
        }
      }

    } catch (err: any) {
      console.error('Microphone capture failed:', err)
      setErrorMessage(err.message || 'Microphone access denied. Please grant permissions.')
      cleanupAudio()
    }
  }

  const stopRecording = () => {
    cleanupAudio()
    setIsListening(false)
    setIsSpeakingSignal(false)
    setIsProcessing(false)
  }

  // Waveform visualization inside requestAnimationFrame
  useEffect(() => {
    if (!isListening || !analyserRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const analyser = analyserRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    let animationId: number
    const draw = () => {
      animationId = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      // Center background circle styling or background fill
      ctx.fillStyle = 'rgba(19, 19, 19, 0.4)'
      ctx.fillRect(0, 0, width, height)

      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, '#2563EB')
      gradient.addColorStop(0.5, '#a78bfa')
      gradient.addColorStop(1, '#ff8a00')

      const barWidth = (width / bufferLength) * 2.5
      let barHeight
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height * 0.85
        ctx.fillStyle = gradient
        // Center equalizers
        ctx.fillRect(x, (height - barHeight) / 2, barWidth - 2, barHeight)
        x += barWidth
      }
    }

    draw()
    return () => cancelAnimationFrame(animationId)
  }, [isListening])

  // Helper to copy text to clipboard
  const handleCopy = async (text: string, setCopied: (v: boolean) => void) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  // Play audio text-to-speech
  const speakText = async (text: string) => {
    if (!text) return
    setIsSpeakingTTS(true)
    
    try {
      // First try ElevenLabs TTS via backend endpoint
      const res = await fetch(`${apiBase}/api/translator/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.audio) {
          const audio = new Audio(data.audio)
          audio.onended = () => setIsSpeakingTTS(false)
          audio.onerror = () => handleSpeechSynthesisFallback(text)
          await audio.play()
          return
        }
      }
      // Fallback
      handleSpeechSynthesisFallback(text)
    } catch (err) {
      console.error('TTS endpoint error, falling back to Web Speech API:', err)
      handleSpeechSynthesisFallback(text)
    }
  }

  const handleSpeechSynthesisFallback = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      // Determine language accent based on target
      utterance.lang = targetLang === 'ja' ? 'ja-JP' : targetLang === 'es' ? 'es-ES' : targetLang === 'fr' ? 'fr-FR' : 'en-US'
      utterance.onend = () => setIsSpeakingTTS(false)
      utterance.onerror = () => setIsSpeakingTTS(false)
      window.speechSynthesis.speak(utterance)
    } else {
      setIsSpeakingTTS(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0c0c0c] text-[#e5e2e1] selection:bg-[#2563EB]/30 selection:text-white">
      {/* Premium Aurora Background */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background: 'radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.15) 0%, rgba(37, 99, 235, 0) 35%), radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.08) 0%, rgba(139, 92, 246, 0) 35%)',
          opacity: 0.95,
        }}
      />

      <TripArcNav />

      <main className="mx-auto max-w-7xl px-6 pb-28 pt-8 md:px-12">
        {/* Header Block */}
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-white/5 pb-6 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              Voice Dictation & Translation
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Speak naturally to write clean, enhanced, and translated text in real-time.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Target Language Select */}
            <div className="flex items-center gap-2 rounded-full border border-white/5 bg-white/[0.03] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <span className="pl-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Translate to</span>
              <div className="relative inline-flex items-center">
                <select
                  value={targetLang}
                  onChange={(e) => {
                    setTargetLang(e.target.value)
                    // If connection is active, send config update
                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                      socketRef.current.send(JSON.stringify({ targetLang: e.target.value }))
                    }
                  }}
                  className="h-8 min-w-[120px] appearance-none rounded-full border border-white/5 bg-[#1a1a1a] px-3.5 pr-8 text-xs font-semibold text-slate-200 outline-none transition-colors hover:bg-[#252525] focus:bg-[#252525] focus-visible:outline-none"
                  aria-label="Target language"
                >
                  {translationLanguages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-slate-400">expand_more</span>
              </div>
            </div>

            {/* Custom Vocabulary Toggle */}
            <button
              onClick={() => setVocabOpen(!vocabOpen)}
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/10 hover:text-white ${vocabOpen ? 'bg-white/10 text-[#2563EB]' : ''}`}
              title="Custom Vocabulary"
            >
              <span className="material-symbols-outlined">menu_book</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Main workspace section */}
          <div className={`${vocabOpen ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-8 transition-all duration-300`}>
            


            {/* Dual Panel workspace */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              
              {/* Dictation Output Panel */}
              <div className="relative flex min-h-[360px] flex-col rounded-[2rem] border border-white/5 bg-[#121212]/70 p-6 shadow-2xl backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
                    Transcribed Dictation
                  </span>
                  
                  {/* Status Badges */}
                  <div className="flex items-center gap-2">
                    {detectedLanguage && (
                      <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                        {detectedLanguage}
                      </span>
                    )}
                    {confidence !== null && (
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-bold tracking-wider text-emerald-400">
                        {Math.round(confidence * 100)}% Match
                      </span>
                    )}
                  </div>
                </div>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 resize-none border-none bg-transparent text-base text-white outline-none placeholder:text-slate-700 focus:ring-0 leading-relaxed"
                  placeholder="Your speech transcript will stream here. You can also edit it directly..."
                />

                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4 text-slate-500">
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    {inputText.length} Characters
                  </span>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(inputText, setCopiedInput)}
                      className="rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                      title="Copy to Clipboard"
                    >
                      <span className="material-symbols-outlined text-lg">
                        {copiedInput ? 'check' : 'content_copy'}
                      </span>
                    </button>
                    <button
                      onClick={() => setInputText('')}
                      className="rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-red-400 transition-colors"
                      title="Clear text"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Translation Output Panel */}
              <div className="relative flex min-h-[360px] flex-col rounded-[2rem] border border-white/5 bg-[#121212]/70 p-6 shadow-2xl backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#2563EB]">
                    Real-time Translation
                  </span>
                  
                  <span className="rounded-full bg-[#2563EB]/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#2563EB]">
                    {translationLanguages.find(l => l.code === targetLang)?.label}
                  </span>
                </div>

                <textarea
                  value={translatedText}
                  onChange={(e) => setTranslatedText(e.target.value)}
                  className="flex-1 resize-none border-none bg-transparent text-base text-white outline-none placeholder:text-slate-700 focus:ring-0 leading-relaxed"
                  placeholder="Translation streams here..."
                />

                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4 text-slate-500">
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    {translatedText.length} Characters
                  </span>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => speakText(translatedText)}
                      disabled={isSpeakingTTS}
                      className={`rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors ${isSpeakingTTS ? 'text-[#2563EB] animate-pulse' : ''}`}
                      title="Speak Translation"
                    >
                      <span className="material-symbols-outlined text-lg">volume_up</span>
                    </button>
                    <button
                      onClick={() => handleCopy(translatedText, setCopiedOutput)}
                      className="rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                      title="Copy to Clipboard"
                    >
                      <span className="material-symbols-outlined text-lg">
                        {copiedOutput ? 'check' : 'content_copy'}
                      </span>
                    </button>
                    <button
                      onClick={() => setTranslatedText('')}
                      className="rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-red-400 transition-colors"
                      title="Clear translation"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Glowing Microphone Control Hub */}
            <div className="relative flex flex-col items-center justify-center rounded-[2.5rem] border border-white/5 bg-[#111]/40 p-8 shadow-2xl backdrop-blur-lg">
              
              {/* Waveform Canvas Overlay */}
              {isListening && (
                <div className="absolute inset-0 z-0 overflow-hidden rounded-[2.5rem]">
                  <canvas ref={canvasRef} width={600} height={120} className="h-full w-full opacity-30" />
                </div>
              )}

              <div className="relative z-10 flex flex-col items-center text-center">
                {/* Audio speaking / processing state banner */}
                <div className="mb-4 h-6 text-xs font-semibold uppercase tracking-widest">
                  {isProcessing ? (
                    <span className="flex items-center gap-2 text-[#a78bfa]">
                      <span className="h-2 w-2 animate-ping rounded-full bg-[#a78bfa]" />
                      Structuring Dictation & Translating...
                    </span>
                  ) : isSpeakingSignal ? (
                    <span className="flex items-center gap-2 text-rose-400">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
                      Capturing Speech...
                    </span>
                  ) : isListening ? (
                    <span className="flex items-center gap-2 text-[#2563EB]">
                      <span className="h-2 w-2 rounded-full bg-[#2563EB] animate-ping" />
                      Listening for audio input...
                    </span>
                  ) : (
                    <span className="text-slate-500">Audio Pipeline Idle</span>
                  )}
                </div>

                {/* Primary Mic Trigger Button */}
                <div className="relative flex items-center justify-center">
                  {isListening && (
                    <div className="absolute -inset-4 animate-ping rounded-full bg-[#2563EB]/15 opacity-70 blur" />
                  )}
                  
                  {/* The requested target class microphone button */}
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`rounded-full border border-white/5 bg-white/5 p-5 transition-all duration-300 hover:bg-white/10 hover:scale-105 active:scale-95 ${
                      isListening 
                        ? 'text-white border-[#2563EB]/30 bg-[#2563EB]/20 shadow-[0_0_30px_rgba(37,99,235,0.4)]' 
                        : 'text-slate-400'
                    }`}
                    aria-label="Microphone"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
                      {isListening ? 'mic_active' : 'mic'}
                    </span>
                  </button>
                </div>

                {errorMessage && (
                  <p className="mt-4 text-xs font-bold text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                    {errorMessage}
                  </p>
                )}

                <p className="mt-5 max-w-md text-xs leading-relaxed text-slate-500">
                  {isListening ? (
                    <span>Click the mic or press <kbd className="mx-1 rounded border border-white/15 bg-white/5 px-1.5 py-0.5">Space</kbd> to stop. Speak naturally.</span>
                  ) : (
                    <span>Click the mic or press <kbd className="mx-1 rounded border border-white/15 bg-white/5 px-1.5 py-0.5">Space</kbd> to start dictating.</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Custom Vocabulary Sidebar */}
          {vocabOpen && (
            <div className="lg:col-span-4 space-y-6 animate-slide-in">
              <div className="rounded-[2rem] border border-white/5 bg-[#121212]/80 p-6 shadow-2xl backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[#fe9400]">menu_book</span>
                    <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-200">
                      Vocabulary
                    </h3>
                  </div>
                  <button
                    onClick={() => setVocabOpen(false)}
                    className="text-slate-500 hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                <p className="text-xs leading-relaxed text-slate-400 mb-5">
                  Save acronyms, names, or jargon here. We will bias the ASR & translation models to match these exact phrases when spoken.
                </p>

                {/* Word Form */}
                <div className="mb-6 flex gap-2">
                  <input
                    type="text"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addWord()}
                    placeholder="Add term (e.g. Stellora, API)"
                    className="flex-1 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-2.5 text-xs text-white outline-none placeholder:text-slate-600 focus:border-[#2563EB]/40 focus:bg-[#1a1a1a]"
                  />
                  <button
                    onClick={addWord}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#2563EB] text-white shadow-lg shadow-[#2563EB]/20 hover:scale-105 active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined">add</span>
                  </button>
                </div>

                {/* Vocabulary Lists */}
                <div className="max-h-[300px] overflow-y-auto scrollbar-hide space-y-1.5">
                  {customVocabulary.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-600">
                      No vocabulary terms saved. Add terms above to boost model spelling accuracy.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {customVocabulary.map((word) => (
                        <div
                          key={word}
                          className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-3.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-red-500/30 hover:bg-red-500/5 group cursor-pointer"
                          onClick={() => void deleteWord(word)}
                          title="Click to remove"
                        >
                          <span>{word}</span>
                          <span className="material-symbols-outlined text-[12px] text-slate-500 group-hover:text-red-400">
                            close
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Keyboard Help Tips */}
              <div className="rounded-[2rem] border border-white/5 bg-[#121212]/50 p-6">
                <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                  Dictation Shortcuts
                </h4>
                <ul className="space-y-2.5 text-xs text-slate-500">
                  <li className="flex justify-between">
                    <span>Toggle Recording</span>
                    <span className="font-semibold text-slate-300">Space or Alt+M</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Force Stop</span>
                    <span className="font-semibold text-slate-300">Escape</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Direct Speak Output</span>
                    <span className="font-semibold text-slate-300">Click speaker icon</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* CSS Keyframe style for camera scanner laser */}
        <style>{`
          @keyframes scan {
            0% { top: 0%; }
            50% { top: 100%; }
            100% { top: 0%; }
          }
        `}</style>

        {/* Spacer */}
        <div className="my-12 border-t border-white/5" />

        {/* Live AR Camera Translation Platform */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-[#2563EB] animate-pulse">filter_center_focus</span>
            <h2 className="text-2xl font-extrabold tracking-tight text-white md:text-3xl">
              Stellora Lens AI
            </h2>
            <span className="rounded-full bg-[#2563EB]/10 border border-[#2563EB]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#2563EB]">
              Real-Time AR
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400 font-medium">
            Live augmented reality text recognition, context-aware inpainting, and translated text overlay composition.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Camera Viewport */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            <div className="relative flex aspect-video w-full flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-[#121212]/50 shadow-2xl backdrop-blur-xl">
              {cameraActive ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                  {/* Video Element */}
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover block"
                  />
                  
                  {/* Inpainted background image - rendered in split mode */}
                  {arMode === 'split' && inpaintedImage && (
                    <img
                      src={inpaintedImage}
                      alt="AR Background"
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Laser Scanning Effect */}
                  {isProcessingAR && (
                    <div 
                      className="absolute left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-[#2563EB]/80 to-transparent shadow-[0_0_15px_rgba(37,99,235,1)] pointer-events-none"
                      style={{
                        animation: 'scan 2.5s linear infinite',
                        zIndex: 10
                      }}
                    />
                  )}

                  {/* AR Translations Overlays */}
                  <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
                    {arTranslations
                      .filter(t => t.confidence >= confidenceThreshold)
                      .map((trans, idx) => {
                        const [ymin, xmin, ymax, xmax] = trans.box_2d
                        const top = `${ymin / 10}%`
                        const left = `${xmin / 10}%`
                        const width = `${(xmax - xmin) / 10}%`
                        const height = `${(ymax - ymin) / 10}%`
                        
                        return (
                          <div
                            key={idx}
                            className="absolute pointer-events-auto group cursor-pointer transition-all duration-300 border border-transparent hover:border-[#2563EB]/60 hover:bg-[#2563EB]/5"
                            style={{
                              top,
                              left,
                              width,
                              height,
                              transform: `rotate(${trans.rotation}deg)`,
                              transformOrigin: 'center center'
                            }}
                          >
                            {/* Visual Replacement Text Overlay */}
                            {arMode === 'overlay' ? (
                              <div
                                className="w-full h-full flex items-center justify-center font-bold px-2 py-0.5 overflow-hidden text-center leading-tight transition-all duration-300 select-text rounded bg-[#0c0c0f]/95 border border-white/10 shadow-2xl"
                                style={{
                                  color: trans.font_color || '#ffffff',
                                  fontSize: `calc(${trans.font_size || 14}px * 0.85)`,
                                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                }}
                              >
                                {trans.translated_text}
                              </div>
                            ) : null}

                            {/* Outline Boxes Mode */}
                            {(arMode === 'boxes' || showBoundingBoxes) && (
                              <div className="absolute inset-0 border border-dashed border-[#2563EB]/40 rounded-sm pointer-events-none">
                                <span className="absolute -top-4 left-0 bg-[#2563EB] text-white text-[8px] font-bold px-1 rounded scale-0 group-hover:scale-100 transition-transform origin-bottom-left">
                                  {Math.round(trans.confidence * 100)}% Match
                                </span>
                              </div>
                            )}

                            {/* Tooltip on Hover */}
                            <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-3 bg-[#151515]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 font-sans">
                              <div className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest mb-1">Original</div>
                              <div className="text-xs text-slate-300 font-medium leading-normal mb-2 italic">"{trans.original_text}"</div>
                              <div className="text-[9px] font-extrabold text-[#2563EB] uppercase tracking-widest mb-1">Translation</div>
                              <div className="text-xs text-white font-bold leading-normal mb-2">"{trans.translated_text}"</div>
                              <div className="flex items-center justify-between border-t border-white/5 pt-1.5 mt-1">
                                <span className="text-[8px] text-emerald-400 font-bold bg-emerald-500/10 px-1 rounded">
                                  Match: {Math.round(trans.confidence * 100)}%
                                </span>
                                <span className="text-[8px] text-slate-400 font-medium">
                                  Rot: {Math.round(trans.rotation)}°
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>

                  {/* Floating Action Overlay */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-black/60 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
                    <button
                      type="button"
                      onClick={saveARSnapshot}
                      className="flex items-center gap-1.5 text-xs text-white bg-[#2563EB] hover:bg-[#2563EB]/80 transition-colors px-3.5 py-1.5 rounded-full font-bold shadow-lg"
                      title="Save snapshot image"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      <span>Snapshot</span>
                    </button>
                    
                    <div className="w-[1px] h-4 bg-white/20" />

                    <button
                      type="button"
                      onClick={() => setCameraActive(false)}
                      className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-red-400 transition-colors px-3 py-1.5 rounded-full font-bold"
                    >
                      <span className="material-symbols-outlined text-[16px]">videocam_off</span>
                      <span>Stop Lens</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.03] border border-white/5 text-slate-400">
                    <span className="material-symbols-outlined text-3xl">filter_center_focus</span>
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">
                    Activate Stellora Lens AI
                  </h3>
                  <p className="max-w-md text-xs leading-relaxed text-slate-500 mb-6 font-medium">
                    Power on your video stream camera to identify, erase, and translate scene text blocks in real-time. Retains font scale, orientation, and perspective details.
                  </p>

                  {arErrorMessage && (
                    <p className="mb-5 max-w-sm text-xs font-bold text-rose-400 bg-rose-500/10 px-4 py-2 rounded-2xl border border-rose-500/20">
                      {arErrorMessage}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setCameraActive(true)}
                    className="flex items-center gap-2 rounded-full bg-[#2563EB] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-[#2563EB]/25 hover:scale-105 active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">videocam</span>
                    <span>Activate Live AR Lens</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Diagnostics and Controls */}
          <div className="lg:col-span-4 flex flex-col space-y-6">
            {/* Display Modes Card */}
            <div className="rounded-[2.0rem] border border-white/5 bg-[#121212]/80 p-6 shadow-2xl backdrop-blur-xl">
              <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500 mb-4 border-b border-white/5 pb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">layers</span>
                <span>Lens Display Modes</span>
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setArMode('overlay')}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition-all duration-300 ${
                    arMode === 'overlay'
                      ? 'border-[#2563EB]/40 bg-[#2563EB]/10 text-white shadow-lg'
                      : 'border-white/5 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                  }`}
                  title="Remove background text and draw translated text overlays"
                >
                  <span className="material-symbols-outlined text-lg">photo_library</span>
                  <span className="text-[8px] font-bold uppercase tracking-tighter">AR Replace</span>
                </button>

                <button
                  type="button"
                  onClick={() => setArMode('boxes')}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition-all duration-300 ${
                    arMode === 'boxes'
                      ? 'border-[#2563EB]/40 bg-[#2563EB]/10 text-white shadow-lg'
                      : 'border-white/5 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                  }`}
                  title="Draw outlined bounding boxes and original stream feed"
                >
                  <span className="material-symbols-outlined text-lg">crop_free</span>
                  <span className="text-[8px] font-bold uppercase tracking-tighter">Outlines</span>
                </button>

                <button
                  type="button"
                  onClick={() => setArMode('split')}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition-all duration-300 ${
                    arMode === 'split'
                      ? 'border-[#2563EB]/40 bg-[#2563EB]/10 text-white shadow-lg'
                      : 'border-white/5 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                  }`}
                  title="Side-by-side view: original vs translated scene background"
                >
                  <span className="material-symbols-outlined text-lg">vertical_split</span>
                  <span className="text-[8px] font-bold uppercase tracking-tighter">Split View</span>
                </button>
              </div>

              {arMode === 'overlay' && (
                <div className="mt-4 flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Show box outlines</span>
                  <input
                    type="checkbox"
                    checked={showBoundingBoxes}
                    onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                    className="rounded border-white/10 bg-white/5 text-[#2563EB] focus:ring-[#2563EB] focus:ring-offset-0 h-4 w-4"
                  />
                </div>
              )}
            </div>

            {/* Precision Controls Card */}
            <div className="rounded-[2.0rem] border border-white/5 bg-[#121212]/80 p-6 shadow-2xl backdrop-blur-xl">
              <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500 mb-4 border-b border-white/5 pb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">tune</span>
                <span>Lens Configurations</span>
              </h3>
              
              <div className="space-y-4">
                {cameraActive && cameraDevices.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">Camera Source</label>
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      className="w-full h-9 rounded-xl border border-white/5 bg-[#17171c] px-3 text-xs text-slate-200 outline-none hover:bg-[#252525] focus:border-[#2563EB]/40 focus:ring-0"
                    >
                      {cameraDevices.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[9px] font-extrabold uppercase tracking-widest">
                    <span className="text-slate-500">Confidence Cutoff</span>
                    <span className="text-[#2563EB]">{Math.round(confidenceThreshold * 100)}% Match</span>
                  </div>
                  <input
                    type="range"
                    min="0.30"
                    max="0.90"
                    step="0.05"
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-lg bg-white/10 appearance-none cursor-pointer accent-[#2563EB]"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-300">Semantic Vision Correction</span>
                    <span className="text-[9px] text-slate-500 leading-tight">Refine text details using visual context</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={visionRefine}
                    onChange={(e) => setVisionRefine(e.target.checked)}
                    className="rounded border-white/10 bg-white/5 text-[#2563EB] focus:ring-[#2563EB] focus:ring-offset-0 h-4 w-4"
                  />
                </div>
              </div>
            </div>

            {/* Performance HUD Monitor */}
            <div className="rounded-[2.0rem] border border-white/5 bg-[#121212]/80 p-6 shadow-2xl backdrop-blur-xl font-sans">
              <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500 mb-4 border-b border-white/5 pb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">monitoring</span>
                <span>HUD Diagnostics Monitor</span>
              </h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Stream Rate</span>
                  <span className={`font-bold uppercase tracking-wider text-[10px] ${arFps >= 15 ? 'text-emerald-400' : arFps >= 8 ? 'text-[#ff9400]' : 'text-rose-400'}`}>
                    {arFps > 0 ? `${arFps} FPS` : 'Idle'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">GPU Mode</span>
                  <span className="text-slate-300 font-bold truncate max-w-[180px]">{gpuStatus}</span>
                </div>
                
                {cameraActive && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">GPU Load</span>
                    <span className="text-slate-300 font-bold">{gpuUsage}%</span>
                  </div>
                )}

                {cameraActive && latencyBreakdown.total > 0 && (
                  <div className="border-t border-white/5 pt-3 space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">End-to-End Latency</span>
                      <span className="font-extrabold text-[#a78bfa]">{latencyBreakdown.total} ms</span>
                    </div>
                    <div className="space-y-1.5 pt-0.5 font-sans">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Text Region Detection (OCR)</span>
                        <span>{latencyBreakdown.ocr} ms</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Translation (NLLB/Gemini)</span>
                        <span>{latencyBreakdown.translation} ms</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Background Inpainting</span>
                        <span>{latencyBreakdown.inpaint} ms</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>WebGL/Canvas Render</span>
                        <span>{latencyBreakdown.render} ms</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
