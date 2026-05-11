import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

import Navbar from '../components/Navbar'

const pins = [
  { label: 'Quiet Garden', detail: 'Shaded • 6 min', mood: 'Calm', x: '20%', y: '30%' },
  { label: 'Food Street', detail: 'Spicy • 10 min', mood: 'Energetic', x: '55%', y: '46%' },
  { label: 'Indie Studio', detail: 'Artsy • 9 min', mood: 'Curious', x: '72%', y: '62%' },
]

export default function MoodMapMap() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-400/16 via-fuchsia-500/14 to-sky-500/18 text-white">
      <div className="noise-overlay" />
      <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden>
        <div className="aurora-bg" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-12 pt-6">
        <Navbar mode="moodmap" mood="Calm" />

        <header className="mb-5">
          <p className="text-sm uppercase tracking-[0.2em] text-white/70">Map</p>
          <h1 className="font-display text-4xl font-semibold">Tap to explore</h1>
          <p className="text-white/75">No timeline — just glowing pins to wander toward.</p>
        </header>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-5 shadow-[0_30px_80px_-60px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
            <span>Numbered recommendations</span>
            <Sparkles size={16} />
          </div>
          <div className="relative mt-4 h-96 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.16),transparent_45%),radial-gradient(circle_at_70%_50%,rgba(255,170,120,0.25),transparent_45%),radial-gradient(circle_at_50%_80%,rgba(120,220,255,0.22),transparent_45%)]">
            {pins.map((pin, idx) => (
              <motion.div
                key={pin.label}
                className="absolute flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 backdrop-blur"
                style={{ left: pin.x, top: pin.y }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
              >
                <span className="relative flex h-8 w-8 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-300/50" aria-hidden />
                  <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-900 shadow-md">{idx + 1}</span>
                </span>
                <div className="text-xs text-white">
                  <p className="font-semibold">{pin.label}</p>
                  <p className="text-white/80">{pin.detail} · {pin.mood}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
