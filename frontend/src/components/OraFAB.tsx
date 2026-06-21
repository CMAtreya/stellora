import { useState, useEffect } from 'react'
import { OraPopup } from './OraPopup'
import { usePorcupine } from '../hooks/usePorcupine'

export default function OraFAB() {
  const [popupOpen, setPopupOpen] = useState(false)
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => {
    return localStorage.getItem('stellora:ora_wakeword') !== 'false'
  })
  const [triggerActiveListen, setTriggerActiveListen] = useState(false)

  // Save preference
  useEffect(() => {
    localStorage.setItem('stellora:ora_wakeword', String(wakeWordEnabled))
  }, [wakeWordEnabled])

  // Soft Chime synthesizer using standard Web Audio API oscillators (0% network requests, 0% files)
  const playSoftChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // Tone 1: C5
      const osc1 = audioCtx.createOscillator()
      const gain1 = audioCtx.createGain()
      osc1.connect(gain1)
      gain1.connect(audioCtx.destination)
      
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime) // C5
      gain1.gain.setValueAtTime(0.12, audioCtx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.3)
      
      osc1.start()
      osc1.stop(audioCtx.currentTime + 0.3)
      
      // Tone 2: E5 (delayed by 110ms)
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
    } catch (e) {
      console.error("Failed to generate chime:", e)
    }
  }

  // Wake Word hook
  const {
    isListening: isWakeListening,
    isSupported: isWakeSupported
  } = usePorcupine({
    enabled: wakeWordEnabled && !popupOpen,
    onKeywordDetected: () => {
      playSoftChime()
      setTriggerActiveListen(true)
      setPopupOpen(true)
    }
  })

  return (
    <>
      {/* ORA Floating Action Button (FAB) */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setPopupOpen(!popupOpen)}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 ${
            popupOpen
              ? 'bg-zinc-800 text-white border border-white/10'
              : isWakeListening
              ? 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] animate-pulse'
              : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white'
          }`}
          title="ORA Travel Companion"
        >
          {/* Halo rings when wake listening */}
          {isWakeListening && !popupOpen && (
            <span className="absolute -inset-2 rounded-full border border-cyan-500/30 animate-ping opacity-60 pointer-events-none" />
          )}

          {popupOpen ? (
            <span className="material-symbols-outlined text-2xl">chat</span>
          ) : (
            <span className="material-symbols-outlined text-2xl">
              {isWakeListening ? 'sensors' : 'forum'}
            </span>
          )}
        </button>
      </div>

      {/* ORA Converse Popup */}
      <OraPopup
        isOpen={popupOpen}
        onClose={() => setPopupOpen(false)}
        wakeWordEnabled={wakeWordEnabled}
        setWakeWordEnabled={setWakeWordEnabled}
        triggerActiveListenOnOpen={triggerActiveListen}
        setTriggerActiveListenOnOpen={setTriggerActiveListen}
      />
    </>
  )
}
