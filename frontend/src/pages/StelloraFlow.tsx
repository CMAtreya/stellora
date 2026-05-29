import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Compass, LocateFixed, RefreshCw, Sparkles } from 'lucide-react'
import TripArcShell from '../components/TripArcShell'
import { supabase } from '../lib/supabaseClient'
import { logActivity, logTelemetry } from '../lib/activityLog.ts'
import { resolveApiPath } from '../lib/apiClient'

type ItineraryItem = {
  id: string
  xid?: string
  title: string
  location: string
  timeSlot: string
  durationMinutes: number
  category: string
  status?: 'planned' | 'suggested' | 'skipped'
  note?: string
}

type LocationPref = { mode: 'live' | 'manual'; label: string; lat?: number; lng?: number }

type AdjustPayload = {
  city: string
  behind: boolean
  ahead: boolean
  locationPref: LocationPref
  items: ItineraryItem[]
  mood?: string
  categoryPref?: string | string[]
  diet?: string
  moreIdeas?: boolean
  stayDurationHours?: number
  arrivalTime?: string
}

const bgBlobs = [
  'bg-indigo-600/30 w-[32rem] h-[32rem] left-[-14%] top-[-12%]',
  'bg-sky-400/24 w-[28rem] h-[28rem] right-[-10%] top-[6%]',
  'bg-amber-300/18 w-[36rem] h-[36rem] left-[18%] bottom-[-18%]',
]

function FloatingBlob({ className, duration, delay = 0, y = 0 }: { className: string; duration: number; delay?: number; y?: number }) {
  return (
    <motion.span
      className={`dynamic-blob absolute ${className}`}
      initial={{ x: 0, y, scale: 1 }}
      animate={{ x: [-20, 14, -12], y: [y, y + 26, y - 18], scale: [1, 1.08, 0.96] }}
      transition={{ duration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut', delay }}
      aria-hidden
    />
  )
}

function isUuidLike(value: string) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value)
}

async function fetchItinerary(city: string): Promise<ItineraryItem[]> {
  const { data, error } = await supabase
    .from('itinerary_items')
    .select('id,title,location,time_slot,duration_minutes,category,status,note')
    .eq('city', city)
    .order('time_slot', { ascending: true })
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    location: row.location,
    timeSlot: row.time_slot,
    durationMinutes: row.duration_minutes,
    category: row.category,
    status: row.status ?? 'planned',
    note: row.note ?? '',
  }))
}

async function requestAdjustment(payload: AdjustPayload) {
  const { data: sessionData } = await supabase.auth.getSession()
  const bearer = sessionData?.session?.access_token
  const apiUrl = import.meta.env.VITE_API_URL?.trim()
  // Prefer custom backend if provided; otherwise fall back to Supabase Edge Function
  if (apiUrl) {
    const res = await fetch(resolveApiPath('/api/adjust-itinerary'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: bearer ? `Bearer ${bearer}` : '' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return []
    return (await res.json()) as ItineraryItem[]
  }

  const { data, error } = await supabase.functions.invoke('adjust_itinerary', { body: payload })
  if (error || !data) return []
  return data as ItineraryItem[]
}

async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  const apiUrl = import.meta.env.VITE_API_URL?.trim()
  if (!apiUrl) return null
  try {
    const res = await fetch(resolveApiPath(`/api/city-from-coords?lat=${lat}&lon=${lng}`))
    if (!res.ok) return null
    const data = (await res.json()) as { city?: string }
    return data.city ?? null
  } catch {
    return null
  }
}

export default function StelloraFlow() {
  const navigate = useNavigate()
  const [city, setCity] = useState('Bengaluru')
  const [locationPref, setLocationPref] = useState<LocationPref>({ mode: 'manual', label: 'Bengaluru' })
  const [items, setItems] = useState<ItineraryItem[]>([])
  const [, setLoading] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [status, setStatus] = useState<'ontrack' | 'behind' | 'ahead'>('ontrack')
  const [message, setMessage] = useState('Live plan ready for the day.')
  const [mood, setMood] = useState('Calm')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Any'])
  const [diet, setDiet] = useState('Any')
  const [showMore, setShowMore] = useState(true)
  const [geoPending, setGeoPending] = useState(false)
  const [stayDurationHours, setStayDurationHours] = useState(8)
  const [arrivalTime, setArrivalTime] = useState<string>(() => {
    const now = new Date()
    now.setHours(now.getHours() + 2)
    return now.toTimeString().slice(0, 5)
  })
  const suggested = items.filter((i) => i.status === 'suggested')
  const planned = items.filter((i) => i.status !== 'suggested')
  const stackItems = useMemo(() => suggested.slice(0, showMore ? 12 : 6), [suggested, showMore])
  const stackRef = useRef<HTMLDivElement>(null)

  const dayPart = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'morning'
    if (hour < 18) return 'afternoon'
    return 'evening'
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchItinerary(city)
      .then(setItems)
      .finally(() => setLoading(false))
  }, [city])

  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Geolocation not available in this browser.')
      return
    }
    setGeoPending(true)
    setMessage('Requesting live location...')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`
        setLocationPref({ mode: 'live', label, lat: latitude, lng: longitude })
        setMessage('Using live position for nearby swaps.')
        reverseGeocodeCity(latitude, longitude).then((resolvedCity) => {
          if (resolvedCity) {
            setCity(resolvedCity)
          }
        })
        autoAdjustWithLive(latitude, longitude)
        setGeoPending(false)
      },
      (err) => {
        setMessage(err.message || 'Unable to read location. Using manual city.')
        setGeoPending(false)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    )
  }

  const handleToggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        return prev.filter((c) => c !== cat)
      }
      return [...prev, cat]
    })
  }

  const autoAdjustWithLive = async (lat: number, lng: number) => {
    setAdjusting(true)
    setStatus('ontrack')
    setMessage('Refreshing with live location...')
    const updated = await requestAdjustment({
      city,
      behind: false,
      ahead: false,
      locationPref: { mode: 'live', label: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat, lng },
      items,
      mood,
      categoryPref: selectedCategories.length > 0 ? selectedCategories : 'Any',
      diet,
      moreIdeas: showMore || stayDurationHours >= 8,
      stayDurationHours,
      arrivalTime,
    })
    setItems(updated)
    setAdjusting(false)
    setMessage('Plan refreshed with live location.')
  }

  useEffect(() => {
    // Auto-generate day plan on load using current city selection
    requestAdjustment({
      city,
      behind: false,
      ahead: false,
      locationPref,
      items: [],
      mood,
      categoryPref: selectedCategories.length > 0 ? selectedCategories : 'Any',
      diet,
      moreIdeas: true,
      stayDurationHours,
      arrivalTime,
    }).then(setItems)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdjust = async (direction: 'behind' | 'ahead') => {
    setAdjusting(true)
    setStatus(direction)
    setMessage(direction === 'behind' ? 'Running catch-up suggestions...' : 'Finding bonus stops...')
    if (locationPref.mode !== 'live') {
      setMessage('Using city fallback. Tap "Use live location" for real-time picks.')
    }

    const expandedIdeas = showMore || stayDurationHours >= 8
    const updated = await requestAdjustment({
      city,
      behind: direction === 'behind',
      ahead: direction === 'ahead',
      locationPref,
      items,
      mood,
      categoryPref: selectedCategories.length > 0 ? selectedCategories : 'Any',
      diet,
      moreIdeas: expandedIdeas,
      stayDurationHours,
      arrivalTime,
    })
    setItems(updated)
    await logTelemetry('itinerary.adjust', { city, direction, count: updated.length })
    setAdjusting(false)
    setMessage('Plan refreshed.')
  }

  const handleSave = async (item: ItineraryItem): Promise<ItineraryItem[]> => {
    const updatedItems: ItineraryItem[] = items.map((p) => (p.id === item.id ? { ...p, status: 'planned' as const } : p))
    setItems(updatedItems)
    setMessage('Saving item...')
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData?.session) {
      setMessage('Login required to save. Showing locally only.')
      return updatedItems
    }
    const payload: Record<string, any> = {
      title: item.title,
      location: item.location,
      time_slot: item.timeSlot,
      duration_minutes: item.durationMinutes,
      category: item.category,
      status: 'planned',
      note: item.note ?? '',
      city,
      user_id: sessionData.session.user.id,
      source_id: item.id,
    }
    if (isUuidLike(item.id)) {
      payload.id = item.id
    }

    const { error } = await supabase.from('itinerary_items').upsert(payload)
    if (error) {
      setMessage('Save failed, retry later.')
      return updatedItems
    }
    await logActivity('itinerary.save', 'triparc', payload.id ?? item.id, { city })
    setMessage('Saved to your plan.')
    return updatedItems
  }

  const handleUnsave = async (item: ItineraryItem) => {
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'suggested' as const } : p)))
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData?.session) {
      setMessage('Removed locally.')
      return
    }
    // Best-effort delete
    await supabase.from('itinerary_items').delete().match({ id: item.id, user_id: sessionData.session.user.id })
    await logActivity('itinerary.delete', 'triparc', item.id, { city })
    setMessage('Removed from your plan.')
  }

  const handleAddFromStack = async (item: ItineraryItem) => {
    const updated = await handleSave({ ...item, status: 'suggested' })
    const plannedItems = (updated || items).filter((i) => i.status === 'planned')
    setMessage(`${plannedItems.length} saved · stay here to keep exploring`)
  }

  const handleMoreIdeas = async () => {
    setAdjusting(true)
    setStatus('ahead')
    setMessage('Loading a fresh stack of ideas...')
    const plannedOnly = items.filter((p) => p.status === 'planned')
    const updated = await requestAdjustment({
      city,
      behind: false,
      ahead: true,
      locationPref,
      items: plannedOnly,
      mood,
      categoryPref: selectedCategories.length > 0 ? selectedCategories : 'Any',
      diet,
      moreIdeas: true,
      stayDurationHours,
      arrivalTime,
    })
    const nextSuggested = updated.filter((i) => i.status === 'suggested')
    setItems([...plannedOnly, ...nextSuggested])
    await logTelemetry('itinerary.moreIdeas', { city, count: nextSuggested.length })
    setAdjusting(false)
    setMessage('New ideas loaded.')
  }

  const handleRemoveSuggestion = (id: string) => {
    setItems((prev) => prev.filter((p) => !(p.status === 'suggested' && p.id === id)))
    setMessage('Removed from stack. Load more anytime.')
  }

  const handleFinalize = () => {
    const plannedOnly = items.filter((p) => p.status === 'planned')
    if (plannedOnly.length === 0) {
      setMessage('Add at least one pick to finalize.')
      return
    }
    navigate('/triparc/finalized', { state: { items: plannedOnly, city } })
  }

  const intentBadge = status === 'behind' ? 'Behind schedule' : status === 'ahead' ? 'Ahead of schedule' : 'On track'

  return (
    <TripArcShell mainClassName="max-w-6xl">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-slate-950 to-black opacity-80" />
        {bgBlobs.map((cls, idx) => (
          <FloatingBlob key={cls} className={cls} duration={18 + idx * 2} delay={idx * 0.4} y={idx * 6} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 py-2">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-white/60">Good {dayPart}</p>
          <h1 className="font-display text-4xl font-semibold leading-tight text-white">Smart Flow - Adaptive day</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
          <Sparkles size={14} className="text-amber-200" />
          {intentBadge}
        </div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-4"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
              <div className="rounded-full border border-white/15 bg-white/5 px-3 py-2">
                City ·
                <select
                  className="bg-transparent px-2 text-white"
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value)
                    setLocationPref({ mode: 'manual', label: e.target.value })
                  }}
                >
                  {['Bengaluru', 'Mysuru', 'Chennai', 'Mumbai'].map((c) => (
                    <option key={c} value={c} className="bg-slate-900 text-white">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-full border border-white/15 bg-white/5 px-3 py-2">
                Arriving ·
                <input
                  type="time"
                  className="bg-transparent px-2 text-white w-20"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                />
              </div>
              <div className="rounded-full border border-white/15 bg-white/5 px-3 py-2">
                Stay ·
                <input
                  type="number"
                  min={2}
                  max={16}
                  className="bg-transparent px-2 text-white w-12"
                  value={stayDurationHours}
                  onChange={(e) => setStayDurationHours(Number(e.target.value))}
                />
                <span>h</span>
              </div>
              <div className="rounded-full border border-white/15 bg-white/5 px-3 py-2">
                Mood ·
                <select
                  className="bg-transparent px-2 text-white"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                >
                  {['Calm', 'Energetic', 'Curious', 'Peaceful'].map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-white">
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-full border border-white/15 bg-white/5 px-3 py-2">
                Diet ·
                <select
                  className="bg-transparent px-2 text-white"
                  value={diet}
                  onChange={(e) => setDiet(e.target.value)}
                >
                  {['Any', 'Veg', 'Non-veg', 'Cafe'].map((d) => (
                    <option key={d} value={d} className="bg-slate-900 text-white">
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleUseLiveLocation}
                disabled={geoPending}
                className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:border-white/40"
              >
                <LocateFixed size={14} /> {geoPending ? 'Locating...' : 'Use live location'}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
              <p className="text-xs uppercase tracking-[0.16em] text-white/60">Category Mix (select multiple)</p>
              <div className="flex flex-wrap gap-2">
                {['Any', 'Food', 'Culture', 'Nature', 'Calm', 'Energetic', 'Adventure', 'Shopping'].map((cat) => (
                  <label
                    key={cat}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full border cursor-pointer transition ${
                      selectedCategories.includes(cat)
                        ? 'bg-amber-200/20 border-amber-200/60 text-amber-50'
                        : 'border-white/15 bg-white/5 text-white/80 hover:border-white/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat)}
                      onChange={() => handleToggleCategory(cat)}
                      className="hidden"
                    />
                    <span className={`w-4 h-4 border rounded ${selectedCategories.includes(cat) ? 'bg-amber-200 border-amber-200' : 'border-white/40'}`}>
                      {selectedCategories.includes(cat) && <span className="block text-white text-xs font-bold">✓</span>}
                    </span>
                    <span className="text-sm font-medium">{cat}</span>
                  </label>
                ))}
              </div>
            </div>

            <span className="block rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white/70">{message}</span>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-white/80">
            <button
              onClick={() => handleAdjust('behind')}
              disabled={adjusting}
              className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-slate-900 shadow-md transition hover:bg-white"
            >
              <RefreshCw size={14} /> Catch up
            </button>
            <button
              onClick={() => handleAdjust('ahead')}
              disabled={adjusting}
              className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-white transition hover:border-white/40"
            >
              <Compass size={14} /> Add bonus time
            </button>
            <button
              onClick={handleMoreIdeas}
              disabled={adjusting}
              className="flex items-center gap-2 rounded-full border border-amber-200/60 bg-amber-200/10 px-3 py-2 text-amber-50 transition hover:bg-amber-200/20"
            >
              <Sparkles size={14} /> More ideas
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-indigo-900/30 backdrop-blur">
            <div className="flex items-center justify-between pb-3 text-white/80">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">Your day</p>
                <h2 className="text-lg font-semibold text-white">Timeline</h2>
              </div>
              <button
                onClick={handleFinalize}
                className="rounded-full bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-900 shadow hover:bg-white"
              >
                Finalize plan
              </button>
            </div>
            <div className="space-y-3">
              {planned.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-white/70">
                  No items yet. Save a few picks from the stack to build your flow.
                </div>
              )}
              {planned.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-white/8 via-white/6 to-white/4 px-4 py-3 text-white"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/60">
                      <span>{item.timeSlot || 'Anytime'}</span>
                      <span className="h-1 w-1 rounded-full bg-white/40" />
                      <span>{item.category}</span>
                    </div>
                    <p className="text-lg font-semibold">{item.title}</p>
                    <p className="text-sm text-white/70">{item.location}</p>
                    {item.note && <p className="text-xs text-white/60">{item.note}</p>}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/80">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{item.durationMinutes} min</span>
                    <button
                      onClick={() => handleUnsave(item)}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.14em] hover:border-white/40"
                    >
                      Remove
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="space-y-4"
        >
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-indigo-900/30 backdrop-blur">
            <div className="flex items-center justify-between text-white/80">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/50">Stack</p>
                <h2 className="text-lg font-semibold text-white">Ideas nearby</h2>
              </div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/60">
                <span className="rounded-full bg-white/10 px-2 py-1">{stackItems.length} visible</span>
                <button
                  onClick={() => setShowMore((prev) => !prev)}
                  className="rounded-full border border-white/20 bg-white/10 px-2 py-1 hover:border-white/40"
                >
                  {showMore ? 'Show fewer' : 'Show more'}
                </button>
              </div>
            </div>
            <div ref={stackRef} className="mt-3 space-y-3 overflow-hidden">
              <AnimatePresence initial={false}>
                {stackItems.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, delay: idx * 0.02 }}
                    className="rounded-2xl border border-white/10 bg-gradient-to-r from-white/8 via-white/6 to-white/4 px-4 py-3 text-white shadow-sm shadow-indigo-900/30"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/60">
                          <span>{item.timeSlot || 'Flexible'}</span>
                          <span className="h-1 w-1 rounded-full bg-white/40" />
                          <span>{item.category}</span>
                        </div>
                        <p className="text-lg font-semibold">{item.title}</p>
                        <p className="text-sm text-white/70">{item.location}</p>
                        {item.note && <p className="text-xs text-white/60">{item.note}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2 text-sm text-white/80">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{item.durationMinutes} min</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAddFromStack(item)}
                            className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-900 shadow hover:bg-white"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => handleRemoveSuggestion(item.id)}
                            className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] hover:border-white/40"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {stackItems.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-white/70">
                  Stack is empty. Tap "More ideas" to refresh.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </TripArcShell>
  )
}
