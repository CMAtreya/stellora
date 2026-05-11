import { motion } from 'framer-motion'
import { ArrowLeft, Map, Search, User } from 'lucide-react'

export default function MoodMapNavbarContent({ mood }: { mood: string }) {
  return (
    <motion.div layout className="flex flex-1 items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <button className="rounded-full border border-white/15 bg-white/10 p-2 text-white/80 hover:border-white/30" aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
          Feeling {mood} 🌿
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        <div className="hidden md:flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80">
          <Search size={14} />
          <input
            className="w-48 bg-transparent text-sm text-white placeholder-white/50 outline-none"
            placeholder="Search or explore"
            aria-label="Search"
          />
        </div>
        <button className="rounded-full border border-white/15 bg-white/10 p-2 text-white/80 hover:border-white/30" aria-label="Toggle map">
          <Map size={16} />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold text-white">
          <User size={16} />
        </button>
      </div>
    </motion.div>
  )
}
