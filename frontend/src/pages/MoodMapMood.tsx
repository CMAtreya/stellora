import { useState } from 'react'
import { motion } from 'framer-motion'
import { Compass, Flame, MapPin, MoonStar, Sparkles } from 'lucide-react'

import Navbar from '../components/Navbar'

const moods = [
  { label: 'Calm', desc: 'Slow, quiet places', icon: Sparkles, colors: 'from-sky-200 to-blue-400' },
  { label: 'Energetic', desc: 'High energy, food, music', icon: Flame, colors: 'from-orange-300 to-amber-500' },
  { label: 'Curious', desc: 'Hidden finds, indie', icon: Compass, colors: 'from-fuchsia-300 to-indigo-500' },
  { label: 'Tired', desc: 'Low effort, cozy', icon: MoonStar, colors: 'from-emerald-200 to-teal-500' },
  { label: 'Peaceful', desc: 'Nature, shade, calm', icon: MapPin, colors: 'from-cyan-200 to-emerald-400' },
]

export default function MoodMapMood() {
  const [selected, setSelected] = useState('Calm')

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-400/16 via-fuchsia-500/14 to-sky-500/18 text-white">
      <div className="noise-overlay" />
      <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden>
        <div className="aurora-bg" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-12 pt-6">
        <Navbar mode="moodmap" mood={selected} />
        <header className="mb-5">
          <p className="text-sm uppercase tracking-[0.2em] text-white/70">Mood selector</p>
          <h1 className="font-display text-4xl font-semibold">Pick how you feel</h1>
          <p className="text-white/75">Selecting a mood rebuilds the Explore feed instantly.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {moods.map((m) => (
            <motion.button
              key={m.label}
              onClick={() => setSelected(m.label)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`rounded-3xl border border-white/12 bg-gradient-to-br ${m.colors} px-4 py-5 text-left text-slate-900 shadow-2xl transition ${selected === m.label ? 'ring-2 ring-white/70' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">{m.label}</p>
                  <p className="text-sm text-slate-900/80">{m.desc}</p>
                </div>
                <m.icon size={20} />
              </div>
              <p className="mt-3 rounded-full bg-white/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-900">Rebuild feed</p>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
