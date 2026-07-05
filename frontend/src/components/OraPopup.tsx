import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tripStore } from '../store/tripStore'
import { sendOraChat, fetchOraHistory, deleteOraHistory, type OraMessage } from '../lib/oraApi'
import { useOraVoice } from '../hooks/useOraVoice'
import { useOraPageContext, type PageContext } from '../types/oraContext'
import { globalActionRegistry } from '../agent/actionRegistry'

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
  const navigate = useNavigate()
  const { pageContext, getOtherPagesSummary } = useOraPageContext()
  const [messages, setMessages] = useState<OraMessage[]>([])
  const [textInput, setTextInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const shouldAutoListenRef = useRef(true)
  const contextRef = useRef(pageContext)
  useEffect(() => {
    contextRef.current = pageContext
  }, [pageContext])

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
    stopSpeech,
    voiceState,
    handsFreeMode,
    setHandsFreeMode,
    isAgentPaused,
    setIsAgentPaused,
    pauseAgent,
    resumeAgent
  } = useOraVoice({
    voice: 'en-US-AvaNeural',
    onTranscriptComplete: (text) => {
      void handleSendMessage(text)
    }
  })

  // Load history when opening popup
  useEffect(() => {
    if (isOpen) {
      void loadHistory()
      setHandsFreeMode(true) // Always start in hands-free/wake-word-ready mode
      if (triggerActiveListenOnOpen) {
        setTriggerActiveListenOnOpen(false)
        void startListening() // Directly start listening to user's question!
      }
    } else {
      setHandsFreeMode(false)
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

  useEffect(() => {
    const handleItineraryAdded = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const addedPlace = detail.addedPlace || 'a new place'
      
      console.log(`[ORA Proactive] Detected addition of place: ${addedPlace}. Prompting ORA...`)
      
      const systemQuery = `I just added "${addedPlace}" to my draft itinerary. Based on my preferences and the current draft items, please suggest the best places to visit next and comment on the optimal times/order for this addition.`
      
      try {
        setIsProcessing(true)
        
        const userMsg: OraMessage = { role: 'user', content: `Added ${addedPlace} to Day ${detail.dayNumber || 1}.` }
        setMessages(prev => [...prev, userMsg])
        
        const otherPagesSummary = getOtherPagesSummary()
        const res = await sendOraChat(systemQuery, contextRef.current, otherPagesSummary)
        
        const botMsg: OraMessage = { role: 'assistant', content: res.response }
        setMessages(prev => [...prev, botMsg])
        
        void playSpeech(res.response)
        
        if (res.actions && res.actions.length > 0) {
          for (const action of res.actions) {
            if (contextRef.current?.availableActions.includes(action.type)) {
              console.log(`ORA Proactive Dispatching Action: ${action.type}`, action.params)
              void globalActionRegistry.dispatch(action.type, action.params)
            }
          }
        }
      } catch (err) {
        console.error("Proactive ORA prompt failed:", err)
      } finally {
        setIsProcessing(false)
      }
    }

    window.addEventListener('ora-itinerary-added', handleItineraryAdded)
    return () => {
      window.removeEventListener('ora-itinerary-added', handleItineraryAdded)
    }
  }, [getOtherPagesSummary, playSpeech])

  const loadHistory = async () => {
    const hist = await fetchOraHistory(25)
    if (hist.length === 0) {
      const welcomeContent = "Hello! I'm ORA, your AI travel companion. Let's design your expedition. To get started, what is your group composition, active day cycle, investment scope, gastronomy preferences, destinations, and special interests?"
      const welcomeMsg: OraMessage = { role: 'assistant', content: welcomeContent }
      setMessages([welcomeMsg])
      void playSpeech(welcomeContent)
    } else {
      setMessages(hist)
    }
  }

  const handleSendMessage = async (textToSend?: string) => {
    if (isAgentPaused) {
      resumeAgent()
    }
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
      let activeContext: PageContext = pageContext ? { ...pageContext } : {
        pageId: "global-fallback",
        visibleEntities: [],
        availableActions: ["navigate"],
        userFacingState: {},
        lastUpdated: Date.now()
      }

      // Standardize timezone and location context inside userFacingState
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      activeContext.userFacingState = {
        ...activeContext.userFacingState,
        timezone
      }

      try {
        if (navigator.geolocation) {
          const coords = await new Promise<GeolocationCoordinates | null>((res) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => res(pos.coords),
              () => res(null),
              { timeout: 2000 }
            )
          })
          if (coords) {
            activeContext.userFacingState.location = `Lat: ${coords.latitude.toFixed(4)}, Lng: ${coords.longitude.toFixed(4)}`
          }
        }
      } catch (e) {}

      // Send to backend with other pages summary context
      const otherPagesSummary = getOtherPagesSummary()
      const res = await sendOraChat(text, activeContext, otherPagesSummary)
      
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

      // Dispatch permitted whitelisted actions returned from backend
      if (res.actions && res.actions.length > 0) {
        for (const action of res.actions) {
          if (activeContext.availableActions.includes(action.type)) {
            console.log(`ORA Dispatching Action: ${action.type}`, action.params)
            void globalActionRegistry.dispatch(action.type, action.params)
          } else {
            console.warn(`Disallowed action type bypassed client-side: ${action.type}`)
          }
        }
      }
      
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

  useEffect(() => {
    const handleOpenOra = (e: Event) => {
      const customEvent = e as CustomEvent
      const query = customEvent.detail?.query
      const activeListen = customEvent.detail?.activeListen
      
      if (activeListen) {
        setHandsFreeMode(true)
      }
      
      if (query) {
        // Automatically send the query message to ORA!
        void handleSendMessage(query)
      } else if (activeListen) {
        void startListening()
      }
    }
    window.addEventListener('stellora:open-ora', handleOpenOra)
    return () => {
      window.removeEventListener('stellora:open-ora', handleOpenOra)
    }
  }, [handleSendMessage])

  const handleClearHistory = async () => {
    if (window.confirm("Are you sure you want to clear your conversation history and preferences with ORA?")) {
      const ok = await deleteOraHistory()
      if (ok) {
        setMessages([])
        setShowSettings(false)
        
        // Reset local storage drafts
        localStorage.removeItem('triparc:journey:draft:v1')
        localStorage.removeItem('triparc:seven-pillars:draft:v1')
        localStorage.removeItem('triparc:timeline:unlocked:v1')
        
        // Reset trip store to blank state
        tripStore.setState({
          destination: 'Kyoto',
          itinerary: [
            {
              day: 1,
              date: new Date().toISOString().split('T')[0],
              items: []
            }
          ]
        })
        
        // Close ORA Popup
        onClose()
        
        // Force a clean reload to navigate back to the start planning page with fresh state
        window.location.href = '/triparc/7pillars'
      }
    }
  }

  // Draw simple visualization during speech/recording
  useEffect(() => {
    if (isAgentPaused || voiceState === 'idle' || voiceState === 'thinking' || !canvasRef.current) return
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
      
      // Dynamic colors based on voiceState
      ctx.strokeStyle = 
        voiceState === 'wake_word' ? 'rgba(34, 211, 238, 0.6)' // cyan
        : voiceState === 'listening' ? 'rgba(239, 68, 68, 0.7)' // red
        : 'rgba(59, 130, 246, 0.7)' // blue (speaking)

      const amplitude = voiceState === 'wake_word' ? 4 : (voiceState === 'listening' ? 10 : 8)
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
  }, [voiceState])

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
          {/* Hands-Free Toggle */}
          <button
            onClick={() => setHandsFreeMode(!handsFreeMode)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/5 ${handsFreeMode ? 'text-cyan-400 bg-white/5 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'text-slate-400'}`}
            title={handsFreeMode ? "Disable Hands-Free Mode" : "Enable Hands-Free Mode"}
          >
            <span className="material-symbols-outlined text-lg">
              {handsFreeMode ? 'mic' : 'mic_off'}
            </span>
          </button>
          {/* Pause / Resume Agent Toggle */}
          <button
            onClick={() => {
              if (isAgentPaused) {
                resumeAgent()
              } else {
                pauseAgent()
              }
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/5 ${
              isAgentPaused 
                ? 'text-yellow-400 bg-white/5 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.2)]' 
                : 'text-slate-400'
            }`}
            title={isAgentPaused ? "Resume ORA Agent" : "Pause ORA Agent"}
          >
            <span className="material-symbols-outlined text-lg">
              {isAgentPaused ? 'play_arrow' : 'pause'}
            </span>
          </button>
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

          {/* Hands-Free Voice Mode Toggle */}
          <div className="space-y-2 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-white">Hands-Free Voice Mode</label>
              <button
                onClick={() => setHandsFreeMode(!handsFreeMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${handsFreeMode ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${handsFreeMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Enables continuous hands-free dialogue: ORA listens for "Hey ORA", transcribes, and speaks without any typing needed.
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
          {isAgentPaused ? (
            <div className="h-10 bg-[#0d0d0d] flex items-center justify-between px-4 border-t border-white/5 relative">
              <div className="flex-1 h-full flex items-center justify-center mr-16">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Speaking and listening stopped</p>
              </div>
              <div className="absolute right-4 text-[10px] uppercase font-bold tracking-wider text-yellow-500 flex items-center gap-1.5 animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                <span>Agent Paused</span>
              </div>
            </div>
          ) : voiceState !== 'idle' && (
            <div className="h-10 bg-[#0d0d0d] flex items-center justify-between px-4 border-t border-white/5 relative">
              <div className="flex-1 h-full flex items-center justify-center mr-16">
                <canvas ref={canvasRef} width={240} height={40} className="w-full h-full" />
              </div>
              <div className="absolute right-4 text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                {voiceState === 'wake_word' && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                    <span className="text-cyan-400">Say "Hey ORA"</span>
                  </>
                )}
                {voiceState === 'listening' && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-red-500">Listening...</span>
                  </>
                )}
                {voiceState === 'thinking' && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-bounce" />
                    <span className="text-yellow-500">Thinking...</span>
                  </>
                )}
                {voiceState === 'speaking' && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-blue-500">Speaking...</span>
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
                onChange={(e) => {
                  setTextInput(e.target.value)
                  if (isAgentPaused) {
                    resumeAgent()
                  }
                }}
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
              {handsFreeMode ? (
                /* Hands-Free Voice Mode Active - Show Stop Voice Button */
                <button
                  onClick={() => setHandsFreeMode(false)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all shadow-md"
                  title="Stop continuous hands-free voice mode"
                >
                  <span className="material-symbols-outlined text-sm">mic_off</span>
                  <span>Stop Hands-Free</span>
                </button>
              ) : isRecording ? (
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
                    if (isAgentPaused) {
                      resumeAgent()
                    } else {
                      setHandsFreeMode(true)
                      void startListening()
                    }
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
