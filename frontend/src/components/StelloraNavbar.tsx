import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, Sparkles, User } from 'lucide-react'

const tripArcLinks = [
  { label: 'Today', to: '/triparc/today' },
  { label: 'Timeline', to: '/timeline' },
  { label: 'Adjust Plan', to: '/triparc/adjust' },
  { label: 'Insights', to: '/triparc/insights' },
  { label: 'Smart Flow', to: '/triparc/flow' },
]

type Props = {
  status?: 'On track' | 'Behind' | 'Ahead'
}

export default function TripArcNavbar({ status = 'On track' }: Props) {
  const location = useLocation()

  return (
    <motion.nav
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="sticky top-0 z-30 mb-6 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-[0_12px_40px_-22px_rgba(0,0,0,1)] backdrop-blur"
    >
      <div className="flex items-center gap-3 text-sm font-semibold text-white">
        <span className="rounded-lg bg-white/10 px-3 py-1.5 text-base tracking-[0.12em]">TripArc</span>
        <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/70 sm:flex">
          <Sparkles size={14} className="text-amber-200" />
          Structured & adaptive
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center gap-1 text-sm font-semibold text-white/80">
        {tripArcLinks.map((link) => {
          const active = location.pathname === link.to
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={`rounded-full px-3.5 py-2 transition ${active ? 'bg-white text-slate-900 shadow-[0_12px_28px_-18px_rgba(255,255,255,0.9)]' : 'text-white/70 hover:bg-white/10'}`}
            >
              {link.label}
            </NavLink>
          )
        })}
      </div>

      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
        <span className={`flex items-center gap-1 rounded-full border px-3 py-1 ${status === 'Behind' ? 'border-amber-300/50 text-amber-200' : 'border-emerald-300/50 text-emerald-200'}`}>
          <CheckCircle2 size={14} />
          {status}
        </span>
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white">
          <User size={16} />
        </button>
      </div>
    </motion.nav>
  )
}
