import { motion } from 'framer-motion'
import { Clock3, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

import TripArcShell from '../components/TripArcShell'

const fullTimeline = [
  { time: '08:00', label: 'Breakfast • CTR', duration: '45m', category: 'Food', status: 'done' },
  { time: '09:00', label: 'Transit • Metro', duration: '20m', category: 'Transit', status: 'done' },
  { time: '09:30', label: 'Palace Walk', duration: '90m', category: 'Heritage', status: 'active' },
  { time: '11:15', label: 'Coffee stop', duration: '20m', category: 'Rest', status: 'upcoming' },
  { time: '12:30', label: 'Lunch • Mylari', duration: '60m', category: 'Food', status: 'upcoming' },
  { time: '14:00', label: 'Museum Audio Tour', duration: '75m', category: 'Heritage', status: 'upcoming' },
  { time: '16:00', label: 'Siesta / Rest', duration: '40m', category: 'Rest', status: 'upcoming' },
  { time: '18:00', label: 'Sunset Point', duration: '50m', category: 'Explore', status: 'upcoming' },
]

const statusTone: Record<string, string> = {
  done: 'border-emerald-400/50 text-emerald-200',
  active: 'border-sky-400/60 text-sky-200',
  upcoming: 'border-white/25 text-white/80',
}

export default function StelloraTimeline() {
  return (
    <TripArcShell mainClassName="max-w-5xl">
      <header className="mb-4">
        <p className="text-sm uppercase tracking-[0.2em] text-white/60">Timeline</p>
        <h1 className="font-display text-4xl font-semibold">8 AM – 8 PM</h1>
        <p className="text-white/70">Scroll to see the full day. Cards show status and category.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/triparc/map"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:border-white/40"
          >
            Open smart map
          </Link>
        </div>
      </header>

      <div className="space-y-3">
        {fullTimeline.map((slot) => (
          <motion.div
            key={slot.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">{slot.time}</span>
              <div>
                <p className="text-base font-semibold text-white">{slot.label}</p>
                <p className="text-sm text-white/70">{slot.category} • {slot.duration}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <span className={`rounded-full border px-3 py-1 ${statusTone[slot.status]}`}>{slot.status}</span>
              <span className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-white/70"><Clock3 size={14} /></span>
              <span className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-white/70"><MapPin size={14} /></span>
            </div>
          </motion.div>
        ))}
      </div>
    </TripArcShell>
  )
}
