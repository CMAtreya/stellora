import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Compass, MapPinned, MessageCircle, ShieldCheck, Sparkles, User, Zap } from 'lucide-react'
import TripArcNav from '../components/TripArcNav'

const options = [
  {
    label: 'Smart Travel Map',
    to: '/full-map',
    icon: MapPinned,
    copy: 'Open your live route board with pin layers, crowd heat zones, and story-aware navigation.',
    accent: 'from-amber-300 via-yellow-400 to-orange-500',
  },
  {
    label: '7 Pillars setup',
    to: '/triparc/7pillars',
    icon: Compass,
    copy: 'Build a Gen Z friendly run-of-show with crowd-aware slots, buffer windows, and cost clarity.',
    accent: 'from-indigo-500 via-sky-500 to-emerald-400',
  },
  {
    label: 'Real-time Translator',
    to: '/translator',
    icon: MessageCircle,
    copy: 'Tap-to-translate text, menus, and locals with cultural context and offline packs.',
    accent: 'from-emerald-400 via-cyan-400 to-blue-500',
  },
  {
    label: 'Alerts & notifications',
    to: '/triparc/today',
    icon: ShieldCheck,
    copy: 'Crowd spikes, closing time nudges, and weather shifts surfaced at the right moment.',
    accent: 'from-amber-300 via-orange-400 to-rose-400',
  },
  {
    label: 'Public profile',
    to: '/triparc/profile',
    icon: User,
    copy: 'Share your travel vibe, memorable journeys, and adventures with the world.',
    accent: 'from-rose-300 via-pink-400 to-purple-500',
  },
]

const statPills = [
  'Crowd-aware routes',
  'Cost heuristics (₹)',
  'Live buffers',
  'Offline-first',
]

export default function TripArcLanding() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden>
        <div className="aurora-bg" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(120,200,255,0.24),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(255,180,120,0.18),transparent_36%),radial-gradient(circle_at_50%_75%,rgba(120,110,255,0.18),transparent_40%)]" aria-hidden />

      <TripArcNav />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-16 pt-10 lg:px-10">
        <section className="flex flex-1 flex-col justify-between gap-10 lg:flex-row lg:items-center">
          <div className="space-y-6 lg:w-1/2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/70">
              <Sparkles size={14} />
              TripArc by MoodMap
            </div>
            <h1 className="font-display text-5xl font-semibold leading-tight md:text-6xl">
              Full-screen travel brain with Apple-smooth polish.
            </h1>
            <p className="text-lg text-white/75">
              TripArc is the decision engine that balances energy, crowd tolerance, budget heuristics, and vibe before AI writes the plan. MoodMap stays your playful, feeling-first sidekick.
            </p>
            <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-white/70">
              {statPills.map((pill) => (
                <span key={pill} className="rounded-full border border-white/20 bg-white/5 px-3 py-1">
                  {pill}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/full-map" className="rounded-full bg-gradient-to-r from-[#f2ca50] to-[#d4af37] px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#2f2404] shadow-[0_20px_38px_-18px_rgba(242,202,80,0.58)] transition hover:-translate-y-[2px]">
                Open smart map →
              </Link>
              <Link to="/triparc/7pillars" className="rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-900 shadow-lg transition hover:-translate-y-[2px]">
                Start 7 pillars →
              </Link>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative flex w-full max-w-xl flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 p-6 shadow-[0_24px_60px_-38px_rgba(0,0,0,1)] backdrop-blur"
          >
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 via-transparent to-white/5" aria-hidden />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/60">Decision engine</p>
                <p className="text-xl font-semibold text-white">TripArc core</p>
              </div>
              <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white">Live</span>
            </div>
            <div className="relative space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4">
              {[{ label: 'Energy level', value: 'Low', color: 'bg-emerald-300' }, { label: 'Crowd tolerance', value: 'Low', color: 'bg-amber-300' }, { label: 'Budget vibe', value: 'Medium', color: 'bg-blue-300' }].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm text-white">
                  <span className="text-white/70">{item.label}</span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-white">
                    <span className={`h-2 w-2 rounded-full ${item.color}`} />
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="relative rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/60">Next move</p>
              <p className="text-lg font-semibold text-white">Palace walk → Coffee → Indie market</p>
              <p className="mt-1 text-sm text-white/70">Crowd dips for 75 minutes. We stacked buffer + faster hop between stops.</p>
              <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/70">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1">
                  <Zap size={12} />
                  Low crowd window
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1">
                  <Compass size={12} />
                  2.1 km · auto
                </span>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {options.map((opt, idx) => (
            <motion.div
              key={opt.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 p-5 shadow-[0_24px_60px_-38px_rgba(0,0,0,1)]"
            >
              <div className={`absolute inset-0 opacity-70 blur-3xl transition group-hover:opacity-95 bg-gradient-to-br ${opt.accent}`} aria-hidden />
              <div className="relative flex h-full flex-col justify-between gap-4">
                <div className="flex items-center gap-3 text-lg font-semibold text-white">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-lg">
                    <opt.icon size={18} />
                  </span>
                  {opt.label}
                </div>
                <p className="text-sm text-white/80">{opt.copy}</p>
                <Link to={opt.to} className="inline-flex items-center justify-between rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-900 shadow transition hover:translate-y-[-2px]">
                  Enter →
                </Link>
              </div>
            </motion.div>
          ))}
        </section>

        <section id="alerts" className="mt-12 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 p-6 shadow-[0_24px_60px_-38px_rgba(0,0,0,1)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-white/60">Timeline generation</p>
              <h3 className="text-2xl font-semibold text-white">Rule-first planning before AI polishes.</h3>
              <p className="text-white/75">We cap walking distance, enforce buffer time, slot meals, and respect rest windows before asking AI to draft the sequence. Google APIs feed places, distances, and hours—costs use heuristics, not guesses.</p>
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/70">
                <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1">Distance Matrix</span>
                <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1">Directions</span>
                <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1">Places</span>
                <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1">Budget heuristics</span>
              </div>
            </div>
            <div className="grid w-full max-w-md grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/40 p-4">
              {[{ title: 'Opening hours check', detail: 'Validates each stop with Places' }, { title: 'Crowd trend', detail: 'Uses popular times + smoothing' }, { title: 'Cost bands', detail: '₹ bands by category' }, { title: 'Buffer guard', detail: 'Enforces recovery time' }].map((item) => (
                <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/60">{item.title}</p>
                  <p className="mt-1 text-white">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
