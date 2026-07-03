import { useState, useEffect } from 'react'
import { OraPopup } from './OraPopup'
import { usePorcupine } from '../hooks/usePorcupine'
import { OraActivityIndicator } from './OraActivityIndicator'


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

  // Programmatic ORA trigger
  useEffect(() => {
    const handleOpenOra = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail?.activeListen) {
        setTriggerActiveListen(true)
      }
      setPopupOpen(true)
    }
    window.addEventListener('stellora:open-ora', handleOpenOra)
    return () => {
      window.removeEventListener('stellora:open-ora', handleOpenOra)
    }
  }, [])

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
          onClick={() => {
            if (!popupOpen) {
              setTriggerActiveListen(true)
            }
            setPopupOpen(!popupOpen)
          }}
          className={`w-16 h-16 bg-[#2563eb] rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 shadow-[0_0_20px_rgba(37,99,235,0.45)] relative overflow-hidden ${
            popupOpen ? 'border border-white/10 bg-[#1f1f23]' : ''
          }`}
          title="ORA Travel Companion"
        >
          {popupOpen ? (
            <span className="material-symbols-outlined text-3xl z-10">close</span>
          ) : (
            <span className="material-symbols-outlined text-3xl z-10" style={{ fontVariationSettings: '"FILL" 1' }}>
              auto_awesome
            </span>
          )}
        </button>
      </div>

      {/* ORA Activity indicator and log toast */}
      <OraActivityIndicator popupOpen={popupOpen} />

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

