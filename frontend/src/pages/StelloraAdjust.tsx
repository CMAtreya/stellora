import { motion } from 'framer-motion'
import { ArrowRight, Crosshair, Sparkles, ToggleLeft, Undo2 } from 'lucide-react'

import TripArcShell from '../components/TripArcShell'

const suggestions = [
  { title: 'Skip next activity', desc: 'Jump to lunch and keep buffer intact.' },
  { title: 'Replace with nearby', desc: 'Swap Palace Walk with Lakeside Cafe (7 min).' },
  { title: 'Add rest', desc: 'Insert 20-min rest near current location.' },
]

export default function StelloraAdjust() {
  return (
    <TripArcShell mainClassName="max-w-5xl">
      <header className="mb-5">
        <p className="text-sm uppercase tracking-[0.2em] text-white/60">Manual override</p>
        <h1 className="font-display text-4xl font-semibold">Adjust Plan</h1>
        <p className="text-white/70">Approve the changes you want. No surprises.</p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <button className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30"><Undo2 size={16} /> Undo last change</button>
        <button className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30"><ToggleLeft size={16} /> Freeze schedule</button>
        <button className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30"><Crosshair size={16} /> Focus on food</button>
      </div>

      <div className="space-y-3">
        {suggestions.map((s) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <div>
              <p className="text-base font-semibold text-white">{s.title}</p>
              <p className="text-sm text-white/70">{s.desc}</p>
            </div>
            <button className="rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white">
              Approve
            </button>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
          <span>AI suggestions</span>
          <Sparkles size={14} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[{ title: 'Slide lunch 20 min', copy: 'Keeps buffer before museum.' }, { title: 'Swap sunset spot', copy: 'Less crowd, better light.' }].map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
              <p className="text-white font-semibold">{item.title}</p>
              <p className="text-white/70">{item.copy}</p>
              <button className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
                <ArrowRight size={14} /> Review
              </button>
            </div>
          ))}
        </div>
      </div>
    </TripArcShell>
  )
}
