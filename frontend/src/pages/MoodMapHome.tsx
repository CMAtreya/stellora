import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Compass, Flame, MapPin, Sparkles } from 'lucide-react'

import Navbar from '../components/Navbar'

const moodCards = [
  { label: 'Calm', icon: Sparkles, colors: 'from-sky-200 to-blue-400' },
  { label: 'Energetic', icon: Flame, colors: 'from-orange-300 to-amber-500' },
  { label: 'Curious', icon: Compass, colors: 'from-fuchsia-300 to-indigo-500' },
  { label: 'Tired', icon: MapPin, colors: 'from-emerald-200 to-teal-500' },
]

const exploreDeck = [
  { title: 'Quiet garden nearby', mood: 'Calm', badge: '6 min • Crowd light' },
  { title: 'Street food hotspot', mood: 'Energetic', badge: '10 min • Open late' },
  { title: 'Indie art studio', mood: 'Curious', badge: '9 min • Resident artist' },
  { title: 'Riverside sunset', mood: 'Calm', badge: '14 min • Golden hour' },
  { title: 'Board game bar', mood: 'Tired', badge: '8 min • Indoors' },
]

const mapPins = [
  { label: 'Hidden Cafe', distance: '6 min', mood: 'Calm', x: '24%', y: '32%' },
  { label: 'Indie Studio', distance: '9 min', mood: 'Curious', x: '62%', y: '48%' },
  { label: 'Sunset Point', distance: '14 min', mood: 'Peaceful', x: '38%', y: '68%' },
]

export default function MoodMapHome() {
  const [selectedMood, setSelectedMood] = useState('Calm')
  const dayPart = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'morning'
    if (hour < 18) return 'afternoon'
    return 'evening'
  }, [])

  const filteredDeck = exploreDeck.filter((card) => card.mood === selectedMood || selectedMood === 'Calm' || card.mood === 'Calm')

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-400/20 via-fuchsia-500/16 to-sky-500/20 text-white">
      <div className="noise-overlay" />
      <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden>
        <div className="aurora-bg" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-6">
        <Navbar mode="moodmap" mood={selectedMood} />

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-white/70">How are you feeling right now?</p>
            <h1 className="font-display text-4xl font-semibold leading-tight text-white">Explore on your own vibe</h1>
            <p className="mt-1 text-white/75">{dayPart === 'evening' ? 'Golden hour picks are lighting up.' : 'Fresh drops tuned to weather, crowd, and time.'}</p>
          </div>
          <div className="hidden rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 sm:flex">Live city signal</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <div className="glass-card rounded-3xl border border-white/10 p-5 shadow-2xl backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-white/70">Mood cards</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {moodCards.map((m) => (
                  <button
                    key={m.label}
                    onClick={() => setSelectedMood(m.label)}
                    className={`rounded-2xl border border-white/10 bg-gradient-to-br ${m.colors} px-3 py-4 text-left text-slate-900 shadow-2xl transition ${selectedMood === m.label ? 'ring-2 ring-white/70' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                      <span>{m.label}</span>
                      <m.icon size={16} />
                    </div>
                    <span className="mt-2 inline-block text-xs text-slate-900/80">Tap to rebuild feed</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-3xl border border-white/10 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
                <span>Explore cards</span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Live</span>
              </div>
              <div className="mt-3 space-y-3">
                <AnimatePresence>
                  {filteredDeck.map((card) => (
                    <motion.div
                      key={card.title}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white"
                    >
                      <div>
                        <p className="text-sm text-white/70">{card.mood} · {dayPart}</p>
                        <p className="text-lg font-semibold">{card.title}</p>
                        <p className="text-sm text-white/75">{card.badge}</p>
                      </div>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">Pin</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.05 }}
            className="space-y-4"
          >
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-5 shadow-[0_30px_80px_-60px_rgba(0,0,0,1)]">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
                <span>Map preview</span>
                <MapPin size={16} />
              </div>
              <div className="relative mt-4 h-72 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.16),transparent_45%),radial-gradient(circle_at_70%_50%,rgba(255,170,120,0.25),transparent_45%),radial-gradient(circle_at_50%_80%,rgba(120,220,255,0.22),transparent_45%)]">
                {mapPins.map((pin) => (
                  <motion.div
                    key={pin.label}
                    className="absolute flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 backdrop-blur"
                    style={{ left: pin.x, top: pin.y }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <span className="relative flex h-8 w-8 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-300/50" aria-hidden />
                      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-900 shadow-md"><MapPin size={16} /></span>
                    </span>
                    <div className="text-xs text-white">
                      <p className="font-semibold">{pin.label}</p>
                      <p className="text-white/80">{pin.distance} · {pin.mood}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-3xl border border-white/10 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
                <span>Context chips</span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">Live</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Time · {dayPart}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Weather steady</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Crowd filtered</span>
              </div>
            </div>
          </motion.div>
        </div>

        <button className="fixed bottom-6 right-6 z-40 rounded-full bg-gradient-to-r from-orange-400 via-fuchsia-500 to-sky-500 px-6 py-4 text-base font-semibold uppercase tracking-[0.16em] text-slate-900 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] transition hover:translate-y-[-2px]">
          Surprise Me
        </button>
      </div>
    </div>
  )
}
