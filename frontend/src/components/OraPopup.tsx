import React, { useEffect, useRef, useState } from 'react'
import { sendOraChat, fetchOraHistory, deleteOraHistory, type OraMessage } from '../lib/oraApi'
import { useOraVoice } from '../hooks/useOraVoice'

export type OraPopupProps = {
  isOpen: boolean
  onClose: () => void
  wakeWordEnabled: boolean
  setWakeWordEnabled: (enabled: boolean) => void
  triggerActiveListenOnOpen: boolean
  setTriggerActiveListenOnOpen: (v: boolean) => void
}

export function OraPopup({
  isOpen,
  onClose,
  wakeWordEnabled,
  setWakeWordEnabled,
  triggerActiveListenOnOpen,
  setTriggerActiveListenOnOpen
}: OraPopupProps) {
  const [messages, setMessages] = useState<OraMessage[]>([])
  const [textInput, setTextInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const shouldAutoListenRef = useRef(true)

  const isExitPhrase = (text: string): boolean => {
    const t = text.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
    const exitPhrases = [
      "stop",
      "goodbye",
      "goodbye ora",
      "good bye ora",
      "no thats all for now",
      "no that is all for now",
      "no thank you",
      "no thanks",
      "thats all",
      "that is all",
      "no thats all",
      "no that is all",
      "nothing else",
      "no nothing else",
      "no thats it",
      "thats it",
      "no that is it",
      "that is it",
      "no thats all thank you",
      "no thats all thanks",
      "no thats it thank you",
      "no thats it thanks",
      "no thank you thats all"
    ]
    return exitPhrases.some(phrase => t === phrase || t.startsWith(phrase))
  }

  // Voice Interaction Hook
  const {
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
  } = useOraVoice({
    voice: 'en-US-AvaNeural',
    onTranscriptComplete: (text) => {
      void handleSendMessage(text)
    },
    onSpeechComplete: () => {
      if (shouldAutoListenRef.current && isOpen) {
        console.log("ORA Companion: Auto-restarting microphone for continuous conversation...")
        void startListening()
      }
    }
  })

  // Load history when opening popup
  useEffect(() => {
    if (isOpen) {
      shouldAutoListenRef.current = true
      void loadHistory()
      if (triggerActiveListenOnOpen) {
        setTriggerActiveListenOnOpen(false)
        // Wait briefly for chime/speech synthesis context
        setTimeout(() => {
          void startListening()
        }, 300)
      }
    } else {
      shouldAutoListenRef.current = false
      stopListening(true)
      stopSpeech()
    }
  }, [isOpen])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, partialTranscript, isRecording])

  // Dismiss popup by clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (isOpen && popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen, onClose])

  const loadHistory = async () => {
    const hist = await fetchOraHistory(25)
    setMessages(hist)
  }

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || textInput).trim()
    if (!text) return

    // Clear text field
    if (!textToSend) {
      setTextInput('')
    }

    // Voice goodbye/termination command check
    if (isExitPhrase(text)) {
      shouldAutoListenRef.current = false
      stopListening()
      await playSpeech("Goodbye! Have a safe trip.")
      setTimeout(() => onClose(), 2200)
      return
    }

    // Update UI locally with user message
    const userMsg: OraMessage = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setIsProcessing(true)
    stopSpeech()

    try {
      // Fetch user location if available
      let locationText = "Unknown location"
      if (navigator.geolocation) {
        // We do a fast timeout geolocation lookup if possible, or use standard
        const coords = await new Promise<GeolocationCoordinates | null>((res) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => res(pos.coords),
            () => res(null),
            { timeout: 3000 }
          )
        })
        if (coords) {
          locationText = `Lat: ${coords.latitude.toFixed(4)}, Lng: ${coords.longitude.toFixed(4)}`
        }
      }

      // Send to backend
      const res = await sendOraChat(text, locationText)
      
      // Update messages list, correcting the user's input bubble if it was auto-corrected by Gemini
      const botMsg: OraMessage = { role: 'assistant', content: res.response }
      setMessages(prev => {
        const next = [...prev]
        if (res.user_message_corrected) {
          // Find the last user message and update its content
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'user') {
              next[i].content = res.user_message_corrected
              break
            }
          }
        }
        return [...next, botMsg]
      })
      
      // Synthesize audio reply
      void playSpeech(res.response)
    } catch (err) {
      console.error("Failed to get ORA reply:", err)
      const errBotMsg: OraMessage = { 
        role: 'assistant', 
        content: "Sorry, I am having trouble connecting right now. Let's try again in a second." 
      }
      setMessages(prev => [...prev, errBotMsg])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClearHistory = async () => {
    if (window.confirm("Are you sure you want to clear your conversation history and preferences with ORA?")) {
      const ok = await deleteOraHistory()
      if (ok) {
        setMessages([])
        setShowSettings(false)
      }
    }
  }

  // Draw simple visualization during speech/recording
  useEffect(() => {
    if ((!isRecording && !isSpeaking) || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let offset = 0

    const draw = () => {
      animationId = requestAnimationFrame(draw)
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      // Draw simple waveform curve
      ctx.beginPath()
      ctx.lineWidth = 2
      ctx.strokeStyle = isRecording 
        ? (isPaused ? 'rgba(234, 179, 8, 0.7)' : 'rgba(239, 68, 68, 0.7)') 
        : 'rgba(37, 99, 235, 0.7)' // Yellow paused, Red recording, Blue speaking

      const amplitude = isPaused ? 0 : (isRecording ? 10 : 8)
      const frequency = 0.05

      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(x * frequency + offset) * amplitude * Math.sin(x * 0.01)
        if (x === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }

      ctx.stroke()
      offset += 0.15
    }

    draw()
    return () => cancelAnimationFrame(animationId)
  }, [isRecording, isSpeaking])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTextId(id)
      setTimeout(() => setCopiedTextId(null), 2000)
    })
  }

  if (!isOpen) return null

  return (
    <div
      ref={popupRef}
      className="fixed bottom-24 right-6 w-[calc(100vw-2rem)] sm:w-96 h-[500px] z-50 rounded-3xl bg-[#121212]/95 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden backdrop-blur-xl transition-all animate-slide-in text-[#e5e2e1]"
      style={{
        fontFamily: "'Manrope', sans-serif"
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#171717] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 animate-pulse" />
            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-[#171717]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">ORA Companion</h3>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Voice-First Agent</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/5 ${showSettings ? 'text-blue-400 bg-white/5' : 'text-slate-400'}`}
            title="Settings"
          >
            <span className="material-symbols-outlined text-lg">settings</span>
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      </div>

      {/* Main Container: Settings or Chat Area */}
      {showSettings ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#141414]">
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Companion Settings</h4>
            <button
              onClick={() => setShowSettings(false)}
              className="text-xs text-blue-400 font-semibold hover:underline"
            >
              Back to Chat
            </button>
          </div>

          {/* Wake Word Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-white">Wake Word Activation</label>
              <button
                onClick={() => setWakeWordEnabled(!wakeWordEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${wakeWordEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${wakeWordEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Allows ORA to wake up instantly on saying &quot;Hey ORA&quot;. 
              <span className="font-semibold text-slate-400 block mt-1">
                Notice: Wake-word listening operates only while this app is in the active foreground browser tab due to security limits.
              </span>
            </p>
          </div>

          {/* Privacy Layer */}
          <div className="space-y-3 pt-4 border-t border-white/5">
            <label className="text-sm font-semibold text-white block">Companion Memory & History</label>
            <p className="text-[11px] leading-relaxed text-slate-500">
              ORA remembers your location, travel preferences, and previous questions to provide tailored tips. You can clear this anytime.
            </p>
            <button
              onClick={handleClearHistory}
              className="w-full rounded-xl bg-red-500/10 border border-red-500/25 px-4 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/15 active:scale-95 transition-all text-center"
            >
              Clear Conversation History & Memory
            </button>
          </div>

          <div className="text-[10px] text-slate-600 text-center pt-8">
            ORA Version 1.0.0 (WASM enabled)
          </div>
        </div>
      ) : (
        <>
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-[#101010]">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg">
                  <span className="material-symbols-outlined text-white text-2xl">chat_bubble</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Meet ORA</h4>
                  <p className="text-xs text-slate-500 max-w-[240px] leading-relaxed mt-1">
                    Try asking &quot;what is the local etiquette here?&quot; or say &quot;Hey ORA&quot; to dictate hands-free.
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, index) => {
              const uniqueId = `msg-${index}`;
              const isUser = msg.role === 'user';
              return (
                <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-white/[0.04] text-slate-200 border border-white/5 rounded-bl-none'
                    }`}
                  >
                    {msg.content}
                    
                    {!isUser && (
                      <div className="mt-1.5 flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity border-t border-white/5 pt-1.5">
                        <button
                          onClick={() => copyToClipboard(msg.content, uniqueId)}
                          className="text-[10px] text-slate-500 hover:text-white flex items-center gap-0.5"
                        >
                          <span className="material-symbols-outlined text-[12px]">
                            {copiedTextId === uniqueId ? 'check' : 'content_copy'}
                          </span>
                          <span>{copiedTextId === uniqueId ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          onClick={() => void playSpeech(msg.content)}
                          className="text-[10px] text-slate-500 hover:text-white flex items-center gap-0.5"
                        >
                          <span className="material-symbols-outlined text-[12px]">volume_up</span>
                          <span>Speak</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Speaking / Processing Signals */}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 bg-white/[0.02] border border-white/5 rounded-bl-none flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {/* Listening / Transcribing Box */}
            {isRecording && (partialTranscript || finalTranscript) && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-blue-600/30 text-slate-300 rounded-br-none italic text-xs leading-normal">
                  {finalTranscript || partialTranscript}...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Equalizer Visualizer overlay */}
          {(isRecording || isSpeaking) && (
            <div className="h-10 bg-[#0d0d0d] flex items-center justify-center px-4 border-t border-white/5 relative">
              <canvas ref={canvasRef} width={380} height={40} className="w-full h-full" />
              <div className="absolute right-4 text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1 animate-pulse">
                {isRecording ? (
                  isPaused ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" /> Paused
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Recording
                    </>
                  )
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Speaking
                  </>
                )}
              </div>
            </div>
          )}

          {/* Voice status error logs */}
          {errorMsg && (
            <div className="bg-red-950/40 border-t border-red-500/20 px-4 py-2 text-rose-400 text-xs font-bold text-center">
              {errorMsg}
            </div>
          )}

          {/* Footer Controls */}
          <div className="p-4 bg-[#141414] border-t border-white/5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask ORA anything about your trip..."
                className="flex-1 rounded-2xl border border-white/5 bg-[#1a1a1a] px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:border-blue-500/30 focus:outline-none"
              />
              
              <button
                onClick={() => handleSendMessage()}
                disabled={!textInput.trim() || isProcessing}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white hover:scale-105 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 disabled:scale-100 transition-all shadow-md"
              >
                <span className="material-symbols-outlined text-lg">send</span>
              </button>
            </div>

            {/* Big voice controls */}
            <div className="flex justify-center items-center gap-3">
              {isRecording ? (
                <>
                  {/* Pause / Resume Button */}
                  <button
                    onClick={() => {
                      if (isPaused) {
                        resumeListening()
                      } else {
                        pauseListening()
                      }
                    }}
                    className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all hover:scale-105 ${
                      isPaused
                        ? 'border-yellow-500/40 bg-yellow-500/20 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                        : 'border-red-500/40 bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse'
                    }`}
                    title={isPaused ? "Resume recording" : "Pause recording"}
                  >
                    <span className="material-symbols-outlined text-xl">
                      {isPaused ? 'play_arrow' : 'pause'}
                    </span>
                  </button>

                  {/* Stop / Done / Submit Button */}
                  <button
                    onClick={() => {
                      shouldAutoListenRef.current = false
                      stopListening()
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-green-500/40 bg-green-500/20 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:scale-105 transition-all"
                    title="Done and submit"
                  >
                    <span className="material-symbols-outlined text-xl">check</span>
                  </button>
                </>
              ) : (
                /* Start Mic Button */
                <button
                  onClick={() => {
                    shouldAutoListenRef.current = true
                    void startListening()
                  }}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-white/5 text-slate-300 hover:bg-white/10 hover:scale-105 transition-all"
                  title="Record questions"
                >
                  <span className="material-symbols-outlined text-xl">mic</span>
                </button>
              )}

              {isSpeaking && (
                <button
                  onClick={stopSpeech}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/5 bg-white/5 text-slate-400 hover:bg-white/10"
                  title="Mute ORA voice"
                >
                  <span className="material-symbols-outlined text-base">volume_off</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
