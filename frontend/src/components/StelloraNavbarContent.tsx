import { motion } from 'framer-motion'
import { Bell, User } from 'lucide-react'

export default function StelloraNavbarContent({ progress, status }: { progress: number; status: string }) {
  return (
    <motion.div layout className="flex flex-1 items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <motion.span layout className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white">TripArc</motion.span>
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
          {status}
        </div>
        <div className="hidden sm:block">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">Day progress</p>
          <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-brand-gradient" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-white/80">
        <button className="rounded-full border border-white/15 bg-white/5 p-2 hover:border-white/30" aria-label="Notifications">
          <Bell size={16} />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold text-white">
          <User size={16} />
        </button>
      </div>
    </motion.div>
  )
}
