import { useEffect, useRef, useState } from 'react'

export type UsePorcupineProps = {
  onKeywordDetected: () => void
  enabled: boolean
}

export function usePorcupine({ onKeywordDetected, enabled }: UsePorcupineProps) {
  const [isReady, setIsReady] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const workerRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fallbackRecRef = useRef<any>(null)
  const resetTimeoutRef = useRef<any>(null)

  const accessKey = import.meta.env.VITE_PICOVOICE_ACCESS_KEY || ''

  useEffect(() => {
    if (!enabled) {
      stopListening()
      return
    }

    let active = true

    const startWebSpeechFallback = () => {
      try {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SpeechRecognition) {
          console.warn("ORA Wake Word: Web Speech API is not supported in this browser.")
          setIsSupported(false)
          return
        }

        console.log("ORA Wake Word Fallback: Initializing SpeechRecognition listener...")
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        // Specifically prioritize en-IN for precise Indian English accent recognition
        recognition.lang = 'en-IN'

        const triggerPhrases = [
          'hey ora', 'hey aura', 'hey ara', 'hey aara', 'hey ohra', 'hey orra', 'hey oura', 'hey aora', 'hey oara', 'hey araa', 'hey yora', 'hey horra', 'hey hora', 'hey order', 'hey owner', 'hey error', 'hey array', 'hey area', 'hey audio', 'hey over', 'hey o',
          'okay ora', 'okay aura', 'okay ara', 'okay aara', 'okay ohra', 'okay orra', 'okay oura', 'okay aora',
          'hello ora', 'hello aura', 'hello ara', 'hello aara', 'hello ohra',
          'hi ora', 'hi aura', 'hi ara', 'hi aara', 'hi ohra',
          'ok ora', 'ok aura', 'ok ara', 'ok aara', 'ok ohra',
          'heyo', 'heyora', 'heyaura', 'heyara'
        ]

        recognition.onresult = (event: any) => {
          if (!active) return
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const rawTranscript = event.results[i][0].transcript.toLowerCase()
            const normalizedTranscript = rawTranscript
              .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
              .replace(/\s+/g, " ")
              .trim()

            const matchFound = triggerPhrases.some(phrase => normalizedTranscript.includes(phrase))

            if (matchFound) {
              console.log("ORA Wake Word Fallback: Keyword detected in SpeechRecognition:", rawTranscript)
              onKeywordDetected()
              break
            }
          }
        }

        const retryDelay = 300
        let isAttemptingRestart = false

        recognition.onstart = () => {
          console.log("ORA Wake Word Fallback: SpeechRecognition connection active.")
        }

        recognition.onerror = (err: any) => {
          if (err.error !== 'no-speech' && err.error !== 'aborted') {
            console.warn("ORA Wake Word Fallback SpeechRecognition error:", err.error)
          }
        }

        recognition.onend = () => {
          if (active && enabled && !fallbackRecRef.current?.stoppedExplicitly) {
            if (isAttemptingRestart) return
            isAttemptingRestart = true
            setTimeout(() => {
              isAttemptingRestart = false
              if (!active || !enabled || fallbackRecRef.current?.stoppedExplicitly) return
              try {
                recognition.start()
              } catch (e) {
                // Ignore already-started errors
              }
            }, retryDelay)
          }
        }

        fallbackRecRef.current = recognition
        recognition.start()
        setIsReady(true)
        setIsListening(true)
        setIsSupported(true)
        console.log("ORA Wake Word Fallback: Active and listening.")
      } catch (err: any) {
        console.error("ORA Wake Word Fallback initialization failed:", err)
        setErrorMsg(err.message || 'SpeechRecognition fallback failed')
        setIsSupported(false)
      }
    }

    const initPorcupine = async () => {
      if (!accessKey) {
        console.log("ORA Wake Word: Access Key is empty. Using browser Web Speech API fallback...")
        startWebSpeechFallback()
        return
      }

      try {
        const PorcupineModule = await import('@picovoice/porcupine-web')
        const VoiceProcessorModule = await import('@picovoice/web-voice-processor')
        
        if (!active) return

        const PorcupineWorker = PorcupineModule.PorcupineWorker
        const WebVoiceProcessor = VoiceProcessorModule.WebVoiceProcessor

        const keywordModel = {
          label: 'Hey ORA',
          publicPath: '/keywords/hey_ora.ppn',
          builtIn: 'Bumblebee'
        }

        console.log("ORA Wake Word: Initializing Picovoice Porcupine WASM...")
        
        const worker = await (PorcupineWorker as any).create(
          accessKey,
          keywordModel.label,
          () => {
            if (!active) return
            console.log("ORA Wake Word: 'Hey ORA' / 'Bumblebee' detected!")
            onKeywordDetected()
          },
          keywordModel.publicPath,
          {
            publicPath: '/keywords/hey_ora.ppn',
            custom: keywordModel.label,
            builtIn: keywordModel.builtIn
          }
        )

        if (!active) {
          worker.terminate()
          return
        }

        workerRef.current = worker
        setIsReady(true)

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        if (!active) {
          stream.getTracks().forEach(track => track.stop())
          worker.terminate()
          return
        }

        streamRef.current = stream
        await WebVoiceProcessor.subscribe(worker)
        setIsListening(true)
        setIsSupported(true)
        console.log("ORA Wake Word: Microphone capture active. Listening for 'Hey ORA'...")

      } catch (err: any) {
        console.warn("ORA Wake Word: Picovoice failed to initialize. Falling back to Web Speech API...", err.message || err)
        if (active) {
          startWebSpeechFallback()
        }
      }
    }

    // Introduce a short delay before initializing the microphone capture/recognition.
    // This allows browser audio contexts and device tracks to be cleanly released 
    // from the active chat mode before being requested by the wake-word listener.
    const delayTimer = setTimeout(() => {
      if (active) {
        void initPorcupine()
      }
    }, 400)

    return () => {
      active = false
      clearTimeout(delayTimer)
      stopListening()
    }
  }, [enabled, accessKey])

  const stopListening = () => {
    try {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current)
        resetTimeoutRef.current = null
      }
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      if (fallbackRecRef.current) {
        fallbackRecRef.current.stoppedExplicitly = true
        fallbackRecRef.current.abort()
        fallbackRecRef.current = null
      }
    } catch (e) {
      console.error("Error stopping wake-word mic stream:", e)
    }
    setIsListening(false)
    setIsReady(false)
  }

  return {
    isReady,
    isListening,
    isSupported,
    errorMsg
  }
}
