import { useEffect, useRef, useState } from 'react'
import { fetchOraAudio, transcribeAudioFallback } from '../lib/oraApi'

export type UseOraVoiceProps = {
  voice?: string
  onTranscriptComplete: (text: string) => void
  onSpeechComplete?: () => void
}

const cleanTextForSpeech = (text: string): string => {
  if (!text) return ""
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#+/g, "")
    .replace(/`/g, "")
    .replace(/__/g, "")
    .replace(/_/g, "")
    .replace(/^\s*[\*\-\•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}

export type VoiceState = 'idle' | 'wake_word' | 'listening' | 'thinking' | 'speaking'

export function useOraVoice({ voice = 'en-US-AvaNeural', onTranscriptComplete, onSpeechComplete }: UseOraVoiceProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [partialTranscript, setPartialTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Task 6 Hands-free state machine
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [handsFreeMode, setHandsFreeMode] = useState(false)

  const isPausedRef = useRef(false)
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimeoutRef = useRef<any>(null)

  // Wake-word recognition references
  const wakeRecognitionRef = useRef<any>(null)
  const activeWakeListeningRef = useRef(false)

  const voiceStateRef = useRef<VoiceState>('idle')
  const handsFreeModeRef = useRef(false)
  
  const finalTranscriptRef = useRef('')
  const interimTranscriptRef = useRef('')

  useEffect(() => {
    voiceStateRef.current = voiceState
  }, [voiceState])

  useEffect(() => {
    handsFreeModeRef.current = handsFreeMode
    if (handsFreeMode) {
      console.log("[useOraVoice] Hands-free mode enabled. Starting wake-word listener...")
      startWakeWordListening()
    } else {
      console.log("[useOraVoice] Hands-free mode disabled.")
      stopWakeWordListening()
      if (voiceStateRef.current === 'wake_word') {
        setVoiceState('idle')
      }
    }
  }, [handsFreeMode])

  const resetSilenceTimer = () => {
    if (isPausedRef.current) return
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
    }
    silenceTimeoutRef.current = setTimeout(() => {
      console.log("ORA Dictation: 5 seconds of silence detected. Automatically submitting input...")
      stopListening()
    }, 5000) // Auto-submit after 5 seconds of silence
  }

  useEffect(() => {
    // 1. Setup Active Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      const rec = new SpeechRecognition()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-IN'

      rec.onsoundstart = () => {
        if (!isPausedRef.current) resetSilenceTimer()
      }
      rec.onspeechstart = () => {
        if (!isPausedRef.current) resetSilenceTimer()
      }
      rec.onaudiostart = () => {
        if (!isPausedRef.current) resetSilenceTimer()
      }

      rec.onresult = (e: any) => {
        if (isPausedRef.current) return
        resetSilenceTimer()
        let interim = ''
        let final = ''
        for (let i = 0; i < e.results.length; i++) {
          const transcript = e.results[i][0].transcript
          if (e.results[i].isFinal) {
            final += transcript + ' '
          } else {
            interim += transcript
          }
        }
        
        finalTranscriptRef.current = final.trim()
        interimTranscriptRef.current = interim

        if (interim) setPartialTranscript(interim)
        setFinalTranscript(final.trim())
        if (final) {
          setPartialTranscript('')
        }
      }

      rec.onerror = (e: any) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn("Speech recognition error:", e.error)
        }
      }

      recognitionRef.current = rec
    }

    return () => {
      stopSpeech()
      cleanupMedia()
      stopWakeWordListening()
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
    }
  }, [])

  const cleanupMedia = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    audioChunksRef.current = []
  }

  const startListening = async () => {
    setHandsFreeMode(true)
    
    // Mute/abort wake word listener during active transcription capture
    stopWakeWordListening()

    setErrorMsg('')
    setPartialTranscript('')
    setFinalTranscript('')
    finalTranscriptRef.current = ''
    interimTranscriptRef.current = ''
    setIsPaused(false)
    isPausedRef.current = false
    cleanupMedia()
    resetSilenceTimer()
    setVoiceState('listening')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      streamRef.current = stream

      if (recognitionRef.current) {
        try {
          recognitionRef.current.start()
        } catch (e) {
          console.warn("Failed to start speech recognition:", e)
        }
      }

      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        setVoiceState('thinking')
        
        await new Promise(resolve => setTimeout(resolve, 500))
        let transcriptToUse = finalTranscriptRef.current.trim()
        
        if (!transcriptToUse && audioChunksRef.current.length > 0) {
          console.log("Web Speech API returned empty. Invoking Groq Whisper fallback...")
          try {
            const whisperText = await transcribeAudioFallback(audioBlob)
            if (whisperText.trim()) {
              transcriptToUse = whisperText.trim()
              setFinalTranscript(whisperText)
              finalTranscriptRef.current = whisperText
            }
          } catch (err: any) {
            console.error("Groq Whisper transcription fallback failed:", err)
            setErrorMsg("Could not understand audio.")
          }
        }

        setIsRecording(false)
        setIsPaused(false)
        isPausedRef.current = false

        if (transcriptToUse) {
          // Check for manual voice exit phrase
          const t = transcriptToUse.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
          if (t === 'stop' || t === 'cancel' || t === 'stop listening' || t === 'shut up') {
            console.log("[useOraVoice] Exit phrase heard. Halting hands-free conversation.")
            setHandsFreeMode(false)
            setVoiceState('idle')
            cleanupMedia()
            return
          }
          onTranscriptComplete(transcriptToUse)
        } else {
          // No speech detected - return to wake word if in hands-free mode
          if (handsFreeModeRef.current) {
            startWakeWordListening()
          } else {
            setVoiceState('idle')
          }
        }
        cleanupMedia()
      }

      mediaRecorder.start()
      setIsRecording(true)

    } catch (err: any) {
      console.error("Failed to capture audio stream:", err)
      setErrorMsg("Microphone access denied.")
      setIsRecording(false)
      setVoiceState('idle')
      if (handsFreeModeRef.current) {
        startWakeWordListening()
      }
    }
  }

  const pauseListening = () => {
    if (isRecording && !isPaused) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.pause() } catch (e) {}
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) {}
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
      }
      setIsPaused(true)
      isPausedRef.current = true
    }
  }

  const resumeListening = () => {
    if (isRecording && isPaused) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
        try { mediaRecorderRef.current.resume() } catch (e) {}
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.start() } catch (e) {}
      }
      setIsPaused(false)
      isPausedRef.current = false
      resetSilenceTimer()
    }
  }

  const stopListening = (cancel: boolean = false, preventRestart: boolean = false) => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }

    setIsPaused(false)
    isPausedRef.current = false

    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) {}
    }

    let hasMediaRecorder = false
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        hasMediaRecorder = true
        if (cancel) {
          mediaRecorderRef.current.onstop = null
        }
        mediaRecorderRef.current.stop()
      } catch (e) {
        hasMediaRecorder = false
      }
    }

    if (cancel || !hasMediaRecorder) {
      cleanupMedia()
      if (handsFreeModeRef.current && cancel && !preventRestart) {
        startWakeWordListening()
      }
    }
  }

  // --- Task 6: Wake Word Listener (SpeechRecognition fallback model) ---
  const startWakeWordListening = () => {
    stopListening(true, true)
    stopSpeech()
    setVoiceState('wake_word')

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (wakeRecognitionRef.current) {
      try { wakeRecognitionRef.current.abort() } catch (e) {}
    }

    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-IN'

    const directHomophones = ['ora', 'aura', 'aara', 'arra', 'ara', 'ohra', 'orra', 'oura', 'aora']
    const greetingHomophones = ['order', 'owner', 'hour', 'aurora', 'horra', 'hora', 'array', 'area', 'error', 'audio', 'over', 'or', 'are', 'ahra', 'raw', 'row', 'write', 'right', 'alright', 'o', 'oh']

    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        const rawTranscript = e.results[i][0].transcript.toLowerCase()
        const normalized = rawTranscript
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
          .replace(/\s+/g, " ")
          .trim()

        const greetings = ['hey', 'hello', 'hi', 'ok', 'okay', 'yo']
        const words = normalized.split(' ')

        let matchFound = directHomophones.some(homophone => {
          const regex = new RegExp(`\\b${homophone}\\b`, 'i')
          return regex.test(normalized)
        })

        if (!matchFound) {
          for (let g = 0; g < words.length; g++) {
            if (greetings.includes(words[g])) {
              for (let n = g + 1; n <= g + 3 && n < words.length; n++) {
                if (greetingHomophones.includes(words[n]) || directHomophones.includes(words[n])) {
                  matchFound = true
                  break
                }
              }
            }
            if (matchFound) break
          }
        }

        if (matchFound) {
          console.log("[useOraVoice] Wake word detected:", rawTranscript)
          rec.abort()
          playSoftChime()
          setVoiceState('listening')
          setTimeout(() => {
            void startListening()
          }, 300)
          break
        }
      }
    }

    rec.onend = () => {
      if (activeWakeListeningRef.current && voiceStateRef.current === 'wake_word') {
        try { rec.start() } catch (e) {}
      }
    }

    wakeRecognitionRef.current = rec
    activeWakeListeningRef.current = true
    try {
      rec.start()
    } catch (e) {
      console.warn("Failed to start wake word listener:", e)
    }
  }

  const stopWakeWordListening = () => {
    activeWakeListeningRef.current = false
    if (wakeRecognitionRef.current) {
      try {
        wakeRecognitionRef.current.abort()
      } catch (e) {}
      wakeRecognitionRef.current = null
    }
  }

  const playSoftChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc1 = audioCtx.createOscillator()
      const gain1 = audioCtx.createGain()
      osc1.connect(gain1)
      gain1.connect(audioCtx.destination)
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime) // C5
      gain1.gain.setValueAtTime(0.12, audioCtx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.3)
      osc1.start()
      osc1.stop(audioCtx.currentTime + 0.3)

      setTimeout(() => {
        try {
          const osc2 = audioCtx.createOscillator()
          const gain2 = audioCtx.createGain()
          osc2.connect(gain2)
          gain2.connect(audioCtx.destination)
          osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime) // E5
          gain2.gain.setValueAtTime(0.12, audioCtx.currentTime)
          gain2.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.35)
          osc2.start()
          osc2.stop(audioCtx.currentTime + 0.35)
        } catch (e) {}
      }, 110)
    } catch (e) {}
  }

  const handleSpeechComplete = () => {
    setIsSpeaking(false)
    if (handsFreeModeRef.current) {
      console.log("[useOraVoice] TTS speech complete. Mute ended. Starting active listening...")
      setTimeout(() => {
        void startListening()
      }, 500) // Cooldown of 500ms before starting listening to avoid echo loop
    } else {
      setVoiceState('idle')
    }
    onSpeechComplete?.()
  }

  const playSpeech = async (text: string) => {
    stopSpeech()
    stopListening(true, true)
    setVoiceState('speaking')
    setIsSpeaking(true)

    // Make sure we stop any active recording/wake-word microphone captures!
    stopWakeWordListening()

    const cleanedText = cleanTextForSpeech(text)
    if (!cleanedText) {
      handleSpeechComplete()
      return
    }

    try {
      const audioBlob = await fetchOraAudio(cleanedText, voice)
      if (audioBlob) {
        const audioUrl = URL.createObjectURL(audioBlob)
        const player = new Audio(audioUrl)
        audioPlayerRef.current = player
        player.onended = () => {
          URL.revokeObjectURL(audioUrl)
          handleSpeechComplete()
        }
        player.onerror = () => {
          URL.revokeObjectURL(audioUrl)
          playSpeechSynthesisFallback(cleanedText)
        }
        await player.play()
        return
      }
      playSpeechSynthesisFallback(cleanedText)
    } catch (err) {
      console.error("Failed to fetch/play edge-tts audio:", err)
      playSpeechSynthesisFallback(cleanedText)
    }
  }

  const playSpeechSynthesisFallback = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      utterance.onend = () => {
        handleSpeechComplete()
      }
      utterance.onerror = () => {
        handleSpeechComplete()
      }
      window.speechSynthesis.speak(utterance)
    } else {
      handleSpeechComplete()
    }
  }

  const stopSpeech = () => {
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause()
        audioPlayerRef.current = null
      } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
  }

  return {
    isRecording,
    isPaused,
    isSpeaking,
    partialTranscript,
    finalTranscript,
    errorMsg,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    playSpeech,
    stopSpeech,
    
    // Task 6 additions
    voiceState,
    handsFreeMode,
    setHandsFreeMode,
    startWakeWordListening,
    stopWakeWordListening
  }
}
