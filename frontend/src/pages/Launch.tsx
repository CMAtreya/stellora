import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Compass, Sparkles, Waves } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const cards = [
  {
    label: 'TripArc',
    to: '/triparc/7pillars',
    accent: 'from-indigo-500 to-amber-300',
    copy: 'Structured itineraries that stay adaptive and synced.',
    icon: Sparkles,
  },
  {
    label: 'MoodMap',
    to: '/moodmap/explore',
    accent: 'from-orange-400 via-fuchsia-400 to-sky-400',
    copy: 'Free-roam discovery tuned to how you feel right now.',
    icon: Compass,
  },
]

export default function LaunchPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setEmail(data.session?.user.email ?? null)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'morning'
    if (hour < 18) return 'afternoon'
    return 'evening'
  }, [])

  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      <div className="noise-overlay" />
      <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden>
        <div className="aurora-bg" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Choose your lane</p>
            <h1 className="font-display text-4xl font-semibold leading-tight">Welcome back{email ? `, ${email}` : ''}</h1>
            <p className="mt-2 text-white/70">Good {greeting}. Pick how you want to travel right now.</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70 sm:flex">
            <Waves size={14} />
            Session synced
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {cards.map((card) => (
            <motion.button
              key={card.label}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => navigate(card.to)}
              disabled={loading}
              className="group relative overflow-hidden rounded-3xl border border-white/12 bg-white/5 p-5 text-left shadow-[0_24px_60px_-48px_rgba(0,0,0,1)] transition focus:outline-none"
            >
              <div className={`absolute inset-0 opacity-60 blur-3xl transition group-hover:opacity-90 bg-gradient-to-br ${card.accent}`} aria-hidden />
              <div className="relative flex h-full flex-col justify-between gap-4">
                <div className="flex items-center gap-3 text-lg font-semibold text-white">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-lg">
                    <card.icon size={18} />
                  </span>
                  {card.label}
                </div>
                <p className="relative text-sm text-white/80">{card.copy}</p>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-white">
                  <span className="rounded-full bg-white/15 px-3 py-1">Live</span>
                  <span className="rounded-full bg-white/15 px-3 py-1">Enter →</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.16em] text-white/65">
          <span className="rounded-full border border-white/15 px-3 py-1">Persistent login</span>
          <span className="rounded-full border border-white/15 px-3 py-1">Offline cache</span>
          <span className="rounded-full border border-white/15 px-3 py-1">Real-time signals</span>
        </div>
      </div>
    </div>
  )
}
