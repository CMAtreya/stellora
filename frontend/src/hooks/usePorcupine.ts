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

        // Distinct homophones of ORA that can trigger activation directly without a greeting prefix
        const directHomophones = [
          'ora', 'aura', 'aara', 'arra', 'ara', 'ohra', 'orra', 'oura', 'aora'
        ]

        // Common vocabulary homophones that require a greeting prefix to avoid false triggers
        const greetingHomophones = [
          'order', 'owner', 'hour', 'aurora', 'horra', 'hora', 'array', 
          'area', 'error', 'audio', 'over', 'or', 'are', 'ahra', 'raw', 'row', 
          'write', 'right', 'alright', 'all right', 'o', 'oh'
        ]

        recognition.onresult = (event: any) => {
          if (!active) return
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const rawTranscript = event.results[i][0].transcript.toLowerCase()
            
            // Normalize by removing all punctuation and collapsing multiple spaces
            const normalizedTranscript = rawTranscript
              .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
              .replace(/\s+/g, " ")
              .trim()

            const greetings = ['hey', 'hello', 'hi', 'ok', 'okay', 'yo']
            const exclusions = [
              'you', 'we', 'they', 'there', 'the', 'is', 'am', 'was', 'were', 
              'do', 'does', 'did', 'can', 'could', 'how', 'what', 'why', 'who', 
              'where', 'when', 'which', 'to', 'for', 'of', 'in', 'on', 'at', 
              'with', 'from', 'by', 'many', 'much', 'about', 'some', 'any'
            ]

            const words = normalizedTranscript.split(' ')
            
            // 1. Direct Trigger Check: Look for distinct ORA name homophones as full words
            let matchFound = directHomophones.some(homophone => {
              const regex = new RegExp(`\\b${homophone}\\b`, 'i')
              return regex.test(normalizedTranscript)
            })

            // 2. Greeting Proximity Check: Look for greeting + common homophones to prevent false activations
            if (!matchFound) {
              for (let g = 0; g < words.length; g++) {
                if (greetings.includes(words[g])) {
                  for (let n = g + 1; n <= g + 3 && n < words.length; n++) {
                    if (exclusions.includes(words[n])) {
                      break
                    }
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
              console.log("ORA Wake Word Fallback: Keyword detected in SpeechRecognition:", rawTranscript)
              onKeywordDetected()
              break
            }
          }
        }

        let retryDelay = 1000
        let isAttemptingRestart = false

        recognition.onstart = () => {
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current)
          resetTimeoutRef.current = setTimeout(() => {
            retryDelay = 1000 // Reset backoff delay only if it runs successfully and stable for 5 seconds
            console.log("ORA Wake Word Fallback: SpeechRecognition connection stable. Resetting backoff delay.")
          }, 5000)
        }

        recognition.onerror = (err: any) => {
          if (resetTimeoutRef.current) {
            clearTimeout(resetTimeoutRef.current)
            resetTimeoutRef.current = null
          }
          if (err.error !== 'no-speech' && err.error !== 'aborted') {
            console.warn("ORA Wake Word Fallback SpeechRecognition error:", err.error)
            if (err.error === 'network') {
              // Double backoff delay up to 15 seconds to prevent spamming
              retryDelay = Math.min(retryDelay * 2, 15000)
              console.log(`ORA Wake Word Fallback: Network connection issue. Backing off restart for ${retryDelay}ms.`)
            }
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
