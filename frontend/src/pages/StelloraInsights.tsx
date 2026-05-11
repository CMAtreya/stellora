import { motion } from 'framer-motion'
import { Activity, BarChart3, Gauge, PiggyBank } from 'lucide-react'

import TripArcShell from '../components/TripArcShell'

const insightCards = [
  { title: 'Budget used', value: '₹1,420 / ₹3,500', hint: 'Within planned range', icon: PiggyBank },
  { title: 'Time efficiency', value: '92%', hint: 'You saved ~1.5 hrs today', icon: Gauge },
  { title: 'Crowd avoidance', value: '88%', hint: 'Avoided two spikes', icon: Activity },
]

export default function StelloraInsights() {
  return (
    <TripArcShell mainClassName="max-w-5xl">
      <header className="mb-5">
        <p className="text-sm uppercase tracking-[0.2em] text-white/60">Insights</p>
        <h1 className="font-display text-4xl font-semibold">Today feels premium</h1>
        <p className="text-white/70">Quick readouts that prove the system is working for you.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {insightCards.map((card) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/70">
              <span>{card.title}</span>
              <card.icon size={16} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
            <p className="text-sm text-white/70">{card.hint}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/70">
          <span>Premium highlight</span>
          <BarChart3 size={16} />
        </div>
        <p className="mt-3 text-lg font-semibold text-white">You saved ~1.5 hrs today</p>
        <p className="text-white/70">Crowd-aware reroutes and tight transitions kept you ahead of spikes.</p>
      </div>
    </TripArcShell>
  )
}
