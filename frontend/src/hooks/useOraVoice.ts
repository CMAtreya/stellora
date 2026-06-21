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
    // Remove markdown bold/italic asterisks
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    // Remove markdown headers
    .replace(/#+/g, "")
    // Remove backticks
    .replace(/`/g, "")
    // Remove underlines
    .replace(/__/g, "")
    .replace(/_/g, "")
    // Remove list bullet/dash markers at the start of any line
    .replace(/^\s*[\*\-\•]\s+/gm, "")
    // Normalize spaces
    .replace(/\s+/g, " ")
    .trim()
}

export function useOraVoice({ voice = 'en-US-AvaNeural', onTranscriptComplete, onSpeechComplete }: UseOraVoiceProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [partialTranscript, setPartialTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const isPausedRef = useRef(false)

  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimeoutRef = useRef<any>(null)
  
  // Refs to avoid stale closure issues in onstop
  const finalTranscriptRef = useRef('')
  const interimTranscriptRef = useRef('')

  const resetSilenceTimer = () => {
    if (isPausedRef.current) return
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
    }
    silenceTimeoutRef.current = setTimeout(() => {
      console.log("ORA Dictation: 5 seconds of silence detected. Automatically submitting input...")
      stopListening()
    }, 5000)
  }

  useEffect(() => {
    // 1. Setup Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      const rec = new SpeechRecognition()
      rec.continuous = true
      rec.interimResults = true
      // Set to en-IN for optimal Indian accent recognition
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
        console.warn("Speech recognition error:", e.error)
      }

      rec.onend = () => {
        // Handled in stop capture
      }

      recognitionRef.current = rec
    } else {
      console.warn("SpeechRecognition not supported in this browser. Fallback to server-side transcription only.")
    }

    return () => {
      stopSpeech()
      cleanupMedia()
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
    setErrorMsg('')
    setPartialTranscript('')
    setFinalTranscript('')
    finalTranscriptRef.current = ''
    interimTranscriptRef.current = ''
    setIsPaused(false)
    isPausedRef.current = false
    cleanupMedia()
    resetSilenceTimer() // Start the 5-second silence countdown

    try {
      // Configure audio capture for high sensitivity (AGC, echo cancellation, noise suppression)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      streamRef.current = stream

      // 1. Start browser recognition if available
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start()
        } catch (e) {
          console.warn("Failed to start speech recognition:", e)
        }
      }

      // 2. Start backup MediaRecorder for server-side Whisper fallback
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // When recorder stops, if we didn't get a final transcript, upload to Groq Whisper
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        
        // Wait briefly for Web Speech to settle
        await new Promise(resolve => setTimeout(resolve, 600))
        
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
            setErrorMsg("Could not understand audio. Try typing instead.")
          }
        }

        setIsRecording(false)
        setIsPaused(false)
        isPausedRef.current = false
        if (transcriptToUse) {
          onTranscriptComplete(transcriptToUse)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)

    } catch (err: any) {
      console.error("Failed to capture audio stream:", err)
      setErrorMsg("Microphone access denied.")
      setIsRecording(false)
    }
  }

  const pauseListening = () => {
    if (isRecording && !isPaused) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.pause()
        } catch (e) {
          console.warn("Failed to pause MediaRecorder:", e)
        }
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          console.warn("Failed to stop SpeechRecognition for pause:", e)
        }
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
        try {
          mediaRecorderRef.current.resume()
        } catch (e) {
          console.warn("Failed to resume MediaRecorder:", e)
        }
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start()
        } catch (e) {
          console.warn("Failed to start SpeechRecognition for resume:", e)
        }
      }
      setIsPaused(false)
      isPausedRef.current = false
      resetSilenceTimer()
    }
  }

  const stopListening = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }

    setIsPaused(false)
    isPausedRef.current = false

    // Stop Web Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {}
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch (e) {}
    }

    cleanupMedia()
  }

  // Play audio TTS
  const playSpeech = async (text: string) => {
    stopSpeech()
    setIsSpeaking(true)

    const cleanedText = cleanTextForSpeech(text)
    if (!cleanedText) {
      setIsSpeaking(false)
      onSpeechComplete?.()
      return
    }

    try {
      // 1. Primary: edge-tts via backend
      const audioBlob = await fetchOraAudio(cleanedText, voice)
      if (audioBlob) {
        const audioUrl = URL.createObjectURL(audioBlob)
        const player = new Audio(audioUrl)
        audioPlayerRef.current = player
        player.onended = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(audioUrl)
          onSpeechComplete?.()
        }
        player.onerror = () => {
          console.warn("edge-tts audio playback failed. Falling back to SpeechSynthesis.")
          URL.revokeObjectURL(audioUrl)
          playSpeechSynthesisFallback(cleanedText)
        }
        await player.play()
        return
      }
      
      // 2. Fallback: Browser speechSynthesis
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
        setIsSpeaking(false)
        onSpeechComplete?.()
      }
      utterance.onerror = () => {
        setIsSpeaking(false)
        onSpeechComplete?.()
      }
      window.speechSynthesis.speak(utterance)
    } else {
      setIsSpeaking(false)
      onSpeechComplete?.()
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
    stopSpeech
  }
}
