import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, CheckCircle2, Clock3, Cloud, Droplets, ShieldCheck, Wallet } from 'lucide-react'

import Navbar from '../components/Navbar'
import { requestAdjustItinerary, type ItineraryItem } from '../lib/adjustItinerary'
import { supabase } from '../lib/supabaseClient'
import { logActivity, logTelemetry } from '../lib/activityLog.ts'

const timeline = [
  { time: '08:30', label: 'Breakfast • CTR', tag: 'Low crowd' },
  { time: '09:45', label: 'Palace Walk', tag: 'Audio ready' },
  { time: '12:30', label: 'Lunch • Mylari', tag: 'Budget ₹350' },
]

const budget = { planned: 3500, used: 1420 }

const liveActivity = {
  label: 'Walking to Palace Gate',
  eta: '12 min',
  crowd: 'Light',
  weather: '27°C • Clear',
  status: 'On time',
}

const blobs = [
  'bg-indigo-600/30 w-[32rem] h-[32rem] left-[-14%] top-[-12%]',
  'bg-sky-400/24 w-[28rem] h-[28rem] right-[-10%] top-[6%]',
  'bg-amber-300/18 w-[36rem] h-[36rem] left-[18%] bottom-[-18%]',
]

function FloatingBlob({ className, duration, delay = 0, y = 0 }: { className: string; duration: number; delay?: number; y?: number }) {
  return (
    <motion.span
      className={`dynamic-blob absolute ${className}`}
      initial={{ x: 0, y, scale: 1 }}
      animate={{ x: [-24, 18, -16], y: [y, y + 28, y - 20], scale: [1, 1.08, 0.96] }}
      transition={{ duration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut', delay }}
      aria-hidden
    />
  )
}

export default function TripArcHome() {
  const [loadingLocation, setLoadingLocation] = useState(true)
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [suggestions, setSuggestions] = useState<ItineraryItem[]>([])
  const [locError, setLocError] = useState('')
  const [categoryPref, setCategoryPref] = useState('Any')
  const [diet, setDiet] = useState('Any')

  const dayPart = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'morning'
    if (hour < 18) return 'afternoon'
    return 'evening'
  }, [])

  const budgetLeft = budget.planned - budget.used
  const budgetProgress = Math.min((budget.used / budget.planned) * 100, 100)

  useEffect(() => {
    let cancelled = false
    const captureAndFetch = async () => {
      try {
        setLoadingLocation(true)
        const session = await supabase.auth.getSession()
        if (!session.data.session) {
          setLocError('Sign in required for live suggestions.')
          setLoadingLocation(false)
          return
        }
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000 })
        })
        if (cancelled) return

        await supabase.from('user_locations').upsert({
          user_id: session.data.session.user.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: 'live',
        })

        await logActivity('location.upsert', 'triparc', null, { lat: pos.coords.latitude, lng: pos.coords.longitude })

        await fetchSuggestions(pos.coords.latitude, pos.coords.longitude, categoryPref, diet)
      } catch (err: any) {
        if (!cancelled) setLocError(err?.message ?? 'Location unavailable')
      } finally {
        if (!cancelled) setLoadingLocation(false)
      }
    }
    captureAndFetch()
    return () => {
      cancelled = true
    }
  }, [])

  const fetchSuggestions = async (lat: number, lng: number, cat: string, dietPref: string) => {
    setLoadingSuggest(true)
    try {
      const payload = {
        city: 'current',
        behind: false,
        ahead: false,
        locationPref: { mode: 'live' as const, lat, lng, label: 'GPS' },
        items: [],
        categoryPref: cat === 'Any' ? undefined : cat,
        diet: dietPref === 'Any' ? undefined : dietPref,
        moreIdeas: true,
      }
      const data = await requestAdjustItinerary(payload)
      await logTelemetry('suggestions.fetch', { lat, lng, category: cat, diet: dietPref, count: data?.length ?? 0 })
      setSuggestions(data ?? [])
    } catch (err: any) {
      setLocError(err?.message ?? 'Could not fetch suggestions')
    } finally {
      setLoadingSuggest(false)
    }
  }

  const handleRefetch = async () => {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000 })
    })
    fetchSuggestions(pos.coords.latitude, pos.coords.longitude, categoryPref, diet)
  }

  useEffect(() => {
    if (loadingLocation || locError) return
    handleRefetch().catch(() => null)
  }, [categoryPref, diet])

  return (
    <div className="relative min-h-screen bg-dark-navy text-white">
      <div className="noise-overlay" />
      <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden>
        <div className="aurora-bg" />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-slate-950 to-black opacity-80" />
        {blobs.map((cls, idx) => (
          <FloatingBlob key={cls} className={cls} duration={18 + idx * 2} delay={idx * 0.4} y={idx * 6} />
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-12 pt-6">
        <Navbar mode="triparc" status="On track" />

        <div className="flex items-center justify-between gap-3 py-2">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-white/60">Good {dayPart === 'morning' ? 'morning' : dayPart === 'afternoon' ? 'afternoon' : 'evening'}</p>
            <h1 className="font-display text-4xl font-semibold leading-tight text-white">You&apos;re on track today</h1>
            <p className="mt-1 text-white/70">Live signals keep your plan calm and predictable.</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70 sm:flex">
            <ShieldCheck size={14} />
            Offline + Safety synced
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="glass-card rounded-3xl border border-white/10 p-5 shadow-2xl backdrop-blur"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/70">
                <span>Nearby live picks</span>
                <div className="flex items-center gap-2">
                  <select
                    value={categoryPref}
                    onChange={(e) => setCategoryPref(e.target.value)}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
                  >
                    {['Any', 'food', 'cultural', 'amusements', 'outdoors'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={diet}
                    onChange={(e) => setDiet(e.target.value)}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
                  >
                    {['Any', 'veg', 'non-veg', 'cafe'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleRefetch}
                    disabled={loadingSuggest || loadingLocation}
                    className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-60"
                  >
                    {loadingSuggest ? 'Refreshing' : 'Refresh'}
                  </button>
                </div>
              </div>
              {locError && <p className="mt-2 text-sm text-red-200">{locError}</p>}
              <div className="mt-3 space-y-3">
                {loadingLocation || loadingSuggest ? (
                  <p className="text-sm text-white/70">Scanning around you...</p>
                ) : suggestions.length === 0 ? (
                  <p className="text-sm text-white/70">No live picks yet. Try refresh.</p>
                ) : (
                  suggestions.map((s) => (
                    <div key={s.id ?? s.title} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-white/60">{s.timeSlot}</p>
                        <p className="text-base font-semibold text-white">{s.title}</p>
                        <p className="text-white/70">{s.location}</p>
                      </div>
                      <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">{s.category}</span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="glass-card rounded-3xl border border-white/10 p-5 shadow-2xl backdrop-blur"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/70">
                <span>Live activity</span>
                <span className="flex items-center gap-1 text-teal-200"><CheckCircle2 size={14} /> {liveActivity.status}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-sm text-white/70">Current</p>
                  <p className="text-lg font-semibold text-white">{liveActivity.label}</p>
                  <p className="text-white/70">{liveActivity.eta} · {liveActivity.crowd}</p>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-3 text-sm text-white/80">
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 flex items-center gap-2"><Clock3 size={14} /> ETA {liveActivity.eta}</span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 flex items-center gap-2"><Droplets size={14} /> {liveActivity.weather}</span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 flex items-center gap-2"><Cloud size={14} /> Crowd {liveActivity.crowd}</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.05 }}
              className="glass-card rounded-3xl border border-white/10 p-5 shadow-2xl backdrop-blur"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/70">
                <span>Timeline preview</span>
                <a className="text-white/70 hover:text-white" href="/timeline">See full day →</a>
              </div>
              <div className="mt-3 space-y-3">
                {timeline.map((slot) => (
                  <div key={slot.label} className="flex items-start justify-between rounded-2xl bg-white/5 p-3">
                    <div>
                      <p className="text-sm text-white/70">{slot.time}</p>
                      <p className="text-base font-semibold text-white">{slot.label}</p>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">{slot.tag}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[{ label: 'Crowd', value: 'Light' }, { label: 'Weather', value: '27°C • Clear' }, { label: 'Budget', value: '₹1,150 left' }].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/80">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/60">{item.label}</p>
                    <p className="text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="relative rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_30px_80px_-60px_rgba(0,0,0,1)] backdrop-blur"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
                <span>Budget summary</span>
                <Wallet size={14} />
              </div>
              <p className="mt-3 text-3xl font-semibold text-white">₹{budget.used} / ₹{budget.planned}</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-brand-gradient" style={{ width: `${budgetProgress}%` }} />
              </div>
              <p className="mt-2 text-sm text-white/70">You have ₹{budgetLeft} left for today.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/80">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/60">Transfers</p>
                  <p className="text-white">Auto-tracked</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/60">Cash buffer</p>
                  <p className="text-white">₹450 suggested</p>
                </div>
              </div>
              <button className="mt-4 w-full rounded-full bg-brand-gradient px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-glow">Adjust Plan</button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.1 }}
              className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/70">
                <span>Signals</span>
                <Activity size={14} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[{ title: 'Crowd avoidance', value: '92' }, { title: 'Time saved', value: '1.5 hrs' }, { title: 'Fatigue guard', value: 'Balanced' }, { title: 'Offline packs', value: 'Ready' }].map((s) => (
                  <div key={s.title} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/80">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-white/60">{s.title}</p>
                      <p className="text-white">{s.value}</p>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-white/60">
          <span className="rounded-full border border-white/15 px-3 py-1">Ahead of crowd</span>
          <span className="rounded-full border border-white/15 px-3 py-1">Weather steady</span>
          <span className="rounded-full border border-white/15 px-3 py-1">Group synced</span>
        </div>
      </div>
    </div>
  )
}
