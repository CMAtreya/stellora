import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Compass, Sparkles, User } from 'lucide-react'

type Props = {
  mood?: string
}

const moodLinks = [
  { label: 'Explore', to: '/moodmap/explore' },
  { label: 'Mood', to: '/moodmap/mood' },
  { label: 'Map', to: '/moodmap/map' },
  { label: 'Surprise Me', to: '/moodmap/surprise' },
]

export default function MoodMapNavbar({ mood = 'Calm' }: Props) {
  const location = useLocation()

  return (
    <motion.nav
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="sticky top-0 z-30 mb-6 flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-[0_16px_50px_-28px_rgba(0,0,0,0.85)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="rounded-lg bg-gradient-to-r from-orange-400 via-fuchsia-400 to-sky-400 px-3 py-1.5 text-base text-slate-900 shadow-[0_10px_30px_-20px_rgba(0,0,0,1)]">MoodMap</span>
        <span className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/70 sm:flex">
          <Compass size={14} />
          Free-roam mode
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center gap-1 text-sm font-semibold text-white/80">
        {moodLinks.map((link) => {
          const active = location.pathname === link.to
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={`rounded-full px-3.5 py-2 transition ${active ? 'bg-white text-slate-900 shadow-[0_16px_32px_-18px_rgba(255,255,255,1)]' : 'text-white/70 hover:bg-white/10'}`}
            >
              {link.label}
            </NavLink>
          )
        })}
      </div>

      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
        <span className="flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-white">
          <Sparkles size={14} className="text-orange-200" />
          {mood}
        </span>
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/20 text-white">
          <User size={16} />
        </button>
      </div>
    </motion.nav>
  )
}
