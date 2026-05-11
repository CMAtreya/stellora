import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

import Navbar from '../components/Navbar'

const picks = [
  { title: 'Hidden rooftop chai', why: 'Crowd is light, sunset in 35 min, matches Calm mood.' },
  { title: 'Indie arcade night', why: 'Indoor, energetic, close to your last check-in.' },
]

export default function MoodMapSurprise() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-400/16 via-fuchsia-500/14 to-sky-500/18 text-white">
      <div className="noise-overlay" />
      <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden>
        <div className="aurora-bg" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 pb-12 pt-6">
        <Navbar mode="moodmap" mood="Calm" />
        <header className="mb-5">
          <p className="text-sm uppercase tracking-[0.2em] text-white/70">Surprise me</p>
          <h1 className="font-display text-4xl font-semibold">One big CTA</h1>
          <p className="text-white/75">AI picks 1 thing and tells you why it fits right now.</p>
        </header>

        <div className="space-y-4">
          {picks.map((pick, idx) => (
            <motion.div
              key={pick.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className="rounded-3xl border border-white/12 bg-white/10 p-5 shadow-2xl backdrop-blur"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/70">
                <span>{pick.title}</span>
                <Sparkles size={16} />
              </div>
              <p className="mt-3 text-sm text-white/80">{pick.why}</p>
              <button className="mt-4 w-full rounded-full bg-gradient-to-r from-orange-400 via-fuchsia-500 to-sky-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-900 shadow-[0_16px_32px_-18px_rgba(0,0,0,0.8)]">Take me there</button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
