import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageCircleMore, ShieldCheck, User } from 'lucide-react'

const translatorLinks = [
  { label: 'Live', to: '/translator' },
]

export default function TranslatorNavbar() {
  const location = useLocation()

  return (
    <motion.nav
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="sticky top-0 z-30 mb-6 flex items-center justify-between gap-4 rounded-2xl border border-white/12 bg-slate-950/90 px-4 py-3 shadow-[0_16px_44px_-28px_rgba(0,0,0,1)] backdrop-blur"
    >
      <div className="flex items-center gap-3 text-sm font-semibold text-white">
        <span className="rounded-lg bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 px-3 py-1.5 text-base text-slate-900 shadow">Translator</span>
        <span className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/70 sm:flex">
          <MessageCircleMore size={14} />
          Live + cultural guard
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center gap-1 text-sm font-semibold text-white/80">
        {translatorLinks.map((link) => {
          const active = location.pathname === link.to
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={`rounded-full px-3.5 py-2 transition ${active ? 'bg-white text-slate-900 shadow-[0_12px_28px_-18px_rgba(255,255,255,0.95)]' : 'text-white/70 hover:bg-white/10'}`}
            >
              {link.label}
            </NavLink>
          )
        })}
      </div>

      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
        <span className="flex items-center gap-1 rounded-full border border-emerald-300/50 px-3 py-1 text-emerald-200">
          <ShieldCheck size={14} />
          Safe
        </span>
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white">
          <User size={16} />
        </button>
      </div>
    </motion.nav>
  )
}
