import React, { useEffect, useRef, useState } from 'react'
import { Timer, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function SOSHeader({ initialTimeSeconds = 35 }: { initialTimeSeconds?: number }) {
  const [seconds, setSeconds] = useState(initialTimeSeconds)
  const startedAtRef = useRef<number>(Date.now())

  useEffect(() => {
    startedAtRef.current = Date.now() - initialTimeSeconds * 1000

    const tick = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)))
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [initialTimeSeconds])

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const timeString = formatTime(seconds)

  return (
    <header className="fixed top-0 w-full z-50 bg-[#0a0a0d]/86 backdrop-blur-xl shadow-2xl shadow-black/60 h-16 grid grid-cols-3 items-center px-6 border-b border-white/5">
      <div className="flex items-center gap-3"><span className="text-[1.03rem] font-black text-[#ffb8b0] tracking-[-0.04em] uppercase drop-shadow-[0_0_14px_rgba(255,184,176,0.18)]">TripArc</span></div>
      <div className="flex justify-center items-center gap-2 status-blink">
        <span className="w-2 h-2 bg-[#ffb4ab] rounded-full recording-dot shadow-[0_0_12px_rgba(255,180,171,0.32)]" />
        <span className="font-extrabold text-[1.03rem] tracking-[0.10em] text-[#ffb4ab] uppercase drop-shadow-[0_0_16px_rgba(255,180,171,0.24)]">SOS ACTIVE</span>
      </div>
      <div className="flex items-center gap-4 justify-self-end">
        <div className="bg-[#333036] px-4 py-1 rounded-full flex items-center gap-2 border border-white/5 shadow-[0_0_20px_rgba(0,0,0,0.15)] min-w-[84px] justify-center">
          <Timer className="text-[#ffb4ab] text-[13px]" />
          <span className="font-mono text-[0.98rem] font-bold text-[#f3eef0] tracking-[0.16em] leading-none">{timeString}</span>
        </div>
        <Link to="/sos-settings" className="p-2 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center" aria-label="SOS settings">
          <Settings className="text-[#b0a8b1]" size={18} />
        </Link>
      </div>
    </header>
  )
}
