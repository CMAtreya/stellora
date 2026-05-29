import { useEffect, useMemo, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, MapPin, Sparkles, X, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import TripArcShell from '../components/TripArcShell'
import { supabase } from '../lib/supabaseClient'
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
    dayNumber?: number
    crowdLevel?: string
    lat?: number
    lng?: number
    areaSqm?: number
    walkMetersHint?: number
}

type WeatherHint = {
    bestTime: 'morning' | 'afternoon' | 'evening'
    tempC?: number
    condition?: string
    note?: string
}

type FoodHint = {
    slot: 'breakfast' | 'brunch' | 'lunch' | 'evening' | 'dinner'
    note?: string
}

type SnackHint = {
    id: string
}

type LocationState = {
    items?: ItineraryItem[]
    city?: string
    plan?: any
    chosen?: any
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? 'border-white bg-white text-slate-900 shadow-lg' : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:text-white'
                }`}
        >
            {label}
        </button>
    )
}

export default function StelloraFinalized() {
    const location = useLocation()
    const navigate = useNavigate()
    const state = (location.state as LocationState | null) || {}
    const [city] = useState(state.city || 'Bengaluru')

    // Base items from source (either saved or generated)
    const [baseItems, setBaseItems] = useState<ItineraryItem[]>(state.items || [])

    // Time controls
    const [startTime, setStartTime] = useState('10:00') // Default start 10 AM
    const [endTime, setEndTime] = useState('20:00') // Default end 8 PM

    // Derived state
    const [items, setItems] = useState<ItineraryItem[]>([])
    const [day2Items, setDay2Items] = useState<ItineraryItem[]>([])

    const [activeDay, setActiveDay] = useState<1 | 2>(1)
    const [overflow, setOverflow] = useState<ItineraryItem[]>([]) // Original overflow from AI
    const [selectedOverflow, setSelectedOverflow] = useState<Set<string>>(new Set())
    const [showTomorrowPopup, setShowTomorrowPopup] = useState(false)
    const [loading, setLoading] = useState(false)
    const [arranging, setArranging] = useState(false)
    const [message, setMessage] = useState(state.items?.length ? 'Your finalized stops for today.' : 'Loading your finalized stops...')
    const [showStoryDialog, setShowStoryDialog] = useState(false)
    const [weatherHints, setWeatherHints] = useState<Record<string, WeatherHint>>({})
    const [foodHints, setFoodHints] = useState<Record<string, FoodHint>>({})
    const [snackAsk, setSnackAsk] = useState<{ item: ItineraryItem; idx: number } | null>(null)
    const [snackLoading, setSnackLoading] = useState<string | null>(null)
    const [fatigueHandled, setFatigueHandled] = useState<Set<string>>(new Set())

    // Trigger story dialog after a short delay if we have items
    useEffect(() => {
        if (items.length > 0 && !state.items) {
            const timer = setTimeout(() => setShowStoryDialog(true), 2500)
            return () => clearTimeout(timer)
        }
    }, [items.length])

    const dayPart = useMemo(() => {
        const hour = new Date().getHours()
        if (hour < 12) return 'morning'
        if (hour < 18) return 'afternoon'
        return 'evening'
    }, [])

    useEffect(() => {
        const fetchWeatherHints = async () => {
            if (!baseItems.length) return
            const unique = baseItems
                .filter((item, idx, arr) => arr.findIndex(i => i.id === item.id) == idx)
                .filter((item) => {
                    const cat = (item.category || '').toLowerCase()
                    return !(cat.includes('food') || cat.includes('restaurant') || cat.includes('cafe'))
                })
            const results: Record<string, WeatherHint> = {}
            await Promise.all(unique.map(async (item) => {
                try {
                    const res = await fetch(resolveApiPath('/api/weather-hint'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            city: state.city || city,
                            title: item.title,
                            location: item.location,
                            lat: item.lat,
                            lng: item.lng,
                        })
                    })
                    if (!res.ok) return
                    const data = await res.json()
                    if (data?.bestTime) {
                        results[item.id] = {
                            bestTime: data.bestTime,
                            tempC: data.tempC,
                            condition: data.condition,
                            note: data.note,
                        }
                    }
                } catch {
                    // ignore per-item errors
                }
            }))
            if (Object.keys(results).length) {
                setWeatherHints(results)
            }
        }

        fetchWeatherHints()
    }, [baseItems, city, state.city])

    useEffect(() => {
        const fetchFoodHints = async () => {
            if (!baseItems.length) return
            const foods = baseItems.filter((item) => {
                const cat = (item.category || '').toLowerCase()
                return cat.includes('food') || cat.includes('restaurant') || cat.includes('cafe')
            })
            if (!foods.length) return
            const prefs = state.plan?.answers || {}
            const results: Record<string, FoodHint> = {}
            await Promise.all(foods.map(async (item) => {
                try {
                    const res = await fetch(resolveApiPath('/api/food-slot'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: item.title, city: state.city || city, preferences: prefs })
                    })
                    if (!res.ok) return
                    const data = await res.json()
                    if (data?.slot) {
                        results[item.id] = { slot: data.slot, note: data.note }
                    }
                } catch {
                    // ignore per-item errors
                }
            }))
            if (Object.keys(results).length) setFoodHints(results)
        }

        fetchFoodHints()
    }, [baseItems, city, state.city, state.plan])

    // Time manipulation helpers
    const addMinutes = (timeStr: string, minutes: number): string => {
        const [h, m] = timeStr.split(':').map(Number)
        const date = new Date()
        date.setHours(h, m + minutes, 0)
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    const parseMinutes = (timeStr: string): number => {
        const [h, m] = timeStr.split(':').map(Number)
        return h * 60 + m
    }

    const adjustTime = (type: 'start' | 'end', delta: number) => {
        if (type === 'start') {
            setStartTime(prev => addMinutes(prev, delta))
        } else {
            setEndTime(prev => addMinutes(prev, delta))
        }
    }

    const strideMeters = 0.8

    const computeOnSiteWalk = useCallback((item: ItineraryItem): number => {
        if (typeof item.walkMetersHint === 'number' && item.walkMetersHint > 0) return item.walkMetersHint
        if (typeof item.areaSqm === 'number' && item.areaSqm > 0) {
            const approxSide = Math.sqrt(item.areaSqm)
            return Math.round(approxSide * 1.6)
        }
        const cat = (item.category || '').toLowerCase()
        if (cat.includes('heritage') || cat.includes('monument')) return 900
        if (cat.includes('experience')) return 650
        if (cat.includes('shop')) return 450
        return 300
    }, [])

    const estimateWalk = useCallback((prev: ItineraryItem | null, curr: ItineraryItem) => {
        const fallbackMeters = 800
        const onSiteMeters = computeOnSiteWalk(curr)
        if (!prev || !prev.lat || !prev.lng || !curr.lat || !curr.lng) {
            const totalMeters = fallbackMeters + onSiteMeters
            return { travelMeters: fallbackMeters, onSiteMeters, totalMeters, steps: Math.round(totalMeters / strideMeters) }
        }
        const toRad = (v: number) => (v * Math.PI) / 180
        const R = 6371000
        const dLat = toRad(curr.lat - prev.lat)
        const dLon = toRad(curr.lng - prev.lng)
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(prev.lat)) * Math.cos(toRad(curr.lat)) * Math.sin(dLon / 2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        const travelMeters = Math.round(R * c)
        const totalMeters = travelMeters + onSiteMeters
        return { travelMeters, onSiteMeters, totalMeters, steps: Math.round(totalMeters / strideMeters) }
    }, [computeOnSiteWalk])

    const markFatigueHandled = useCallback((itemId?: string) => {
        if (!itemId) return
        setFatigueHandled(prev => {
            const next = new Set(prev)
            next.add(itemId)
            return next
        })
    }, [])

    const dismissSnackAsk = useCallback((itemId?: string) => {
        if (itemId) markFatigueHandled(itemId)
        setSnackAsk(null)
    }, [markFatigueHandled])

    const addSnackAfter = async (item: ItineraryItem) => {
        setSnackLoading(item.id)
        try {
            const res = await fetch(resolveApiPath('/api/snack-nearby'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: item.title,
                    city: state.city || city,
                    lat: item.lat,
                    lng: item.lng,
                })
            })
            if (!res.ok) throw new Error('No nearby snack found')
            const data = await res.json()
            setBaseItems((prev) => {
                const idx = prev.findIndex((p) => p.id === item.id)
                const insertAt = idx >= 0 ? idx + 1 : prev.length
                const snack: ItineraryItem = {
                    id: data.placeId || `snack-${Date.now()}`,
                    title: data.name || 'Snack break',
                    location: data.address || (state.city || city || 'Nearby'),
                    timeSlot: '',
                    durationMinutes: 30,
                    category: 'Food - snack',
                    status: 'planned',
                    lat: data.lat,
                    lng: data.lng,
                    note: 'Added for a quick refresh based on your walk.',
                }
                const next = [...prev]
                next.splice(insertAt, 0, snack)
                return next
            })
            setMessage('Added a nearby snack stop after that walk.')
        } catch (e: any) {
            setMessage(e?.message || 'Could not find a snack nearby.')
        } finally {
            setSnackLoading(null)
            dismissSnackAsk(item.id)
        }
    }

    const shuffleItems = () => {
        const shuffled = [...baseItems]
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        setBaseItems(shuffled)
        setMessage('Shuffled your stops. Tap AI Arrange to optimize.')
    }

    const aiArrange = async () => {
        if (!baseItems.length) return
        setArranging(true)
        try {
            const foods = baseItems.filter((i) => (i.category || '').toLowerCase().includes('food') || (i.category || '').toLowerCase().includes('restaurant') || (i.category || '').toLowerCase().includes('cafe'))
            const nonFoods = baseItems.filter((i) => !foods.includes(i))

            const priority = { morning: 0, afternoon: 1, evening: 2 }
            const sortedNonFoods = [...nonFoods].sort((a, b) => {
                const ha = weatherHints[a.id]
                const hb = weatherHints[b.id]
                const pa = ha ? priority[ha.bestTime] ?? 3 : 3
                const pb = hb ? priority[hb.bestTime] ?? 3 : 3
                return pa - pb
            })

            const arrangeFoods = () => {
                const buckets: Record<string, ItineraryItem[]> = {
                    breakfast: [], brunch: [], lunch: [], evening: [], dinner: [], other: [],
                }
                foods.forEach((f) => {
                    const hint = foodHints[f.id]
                    const slot = hint?.slot || 'lunch'
                    if (buckets[slot]) buckets[slot].push(f)
                    else buckets.other.push(f)
                })
                return [
                    ...buckets.breakfast,
                    ...buckets.brunch,
                    ...buckets.lunch,
                    ...buckets.evening,
                    ...buckets.dinner,
                    ...buckets.other,
                ]
            }

            const merged: ItineraryItem[] = []
            const foodSlots = arrangeFoods()
            // Interleave: morning sights, lunch, afternoon sights, dinner, remainder
            const morningBlock = sortedNonFoods.filter((i) => (weatherHints[i.id]?.bestTime || 'afternoon') === 'morning')
            const eveningBlock = sortedNonFoods.filter((i) => weatherHints[i.id]?.bestTime === 'evening')
            const afternoonBlock = sortedNonFoods.filter((i) => !morningBlock.includes(i) && !eveningBlock.includes(i))

            merged.push(...morningBlock)
            // breakfast/brunch slots
            foodSlots.filter((f) => (foodHints[f.id]?.slot || '') === 'breakfast').forEach((f) => merged.push(f))
            foodSlots.filter((f) => (foodHints[f.id]?.slot || '') === 'brunch').forEach((f) => merged.push(f))
            merged.push(...afternoonBlock)
            // lunch slot
            const lunchOnes = foodSlots.filter((f) => (foodHints[f.id]?.slot || 'lunch') === 'lunch')
            lunchOnes.forEach((f) => merged.push(f))
            // evening slot
            merged.push(...eveningBlock)
            foodSlots.filter((f) => (foodHints[f.id]?.slot || '') === 'evening').forEach((f) => merged.push(f))
            // dinner slot
            foodSlots.filter((f) => (foodHints[f.id]?.slot || '') === 'dinner').forEach((f) => merged.push(f))
            // leftovers
            const consumed = new Set(merged.map((m) => m.id))
            foodSlots.filter((f) => !consumed.has(f.id)).forEach((f) => merged.push(f))

            // Recompute time slots sequentially from startTime
            let cursor = startTime
            const recomputed = merged.map((item) => {
                const duration = item.durationMinutes || 75
                const end = addMinutes(cursor, duration)
                const withTime = { ...item, timeSlot: `${cursor} - ${end}` }
                cursor = addMinutes(end, 15)
                return withTime
            })
            setBaseItems(recomputed)
            setMessage('Arranged with weather + meal timing. Fine-tune if needed.')
        } finally {
            setArranging(false)
        }
    }

    // Recalculate timeline based on start/end constraints
    useEffect(() => {
        if (!baseItems.length) return

        let current = startTime
        const endMinutes = parseMinutes(endTime)

        const d1: ItineraryItem[] = []
        const d2: ItineraryItem[] = []

        baseItems.forEach(item => {
            const itemEnd = addMinutes(current, item.durationMinutes)
            const itemEndMinutes = parseMinutes(itemEnd)

            if (itemEndMinutes <= endMinutes) {
                d1.push({ ...item, timeSlot: current, dayNumber: 1 })
                current = addMinutes(current, item.durationMinutes + 15) // +15 min travel/buffer
            } else {
                d2.push({ ...item, timeSlot: '--:--', dayNumber: 2 })
            }
        })

        setItems(d1)
        setDay2Items(d2)
    }, [baseItems, startTime, endTime])

    const currentDayItems = useMemo(() => (activeDay === 1 ? items : day2Items), [activeDay, day2Items, items])

    const walkStats = useMemo(() => {
        let total = 0
        let steps = 0
        let count = 0
        let heaviest: { item: ItineraryItem; idx: number; totalMeters: number; steps: number } | null = null

        currentDayItems.forEach((item, idx) => {
            const cat = (item.category || '').toLowerCase()
            if (!(cat.includes('heritage') || cat.includes('experience'))) return
            const prev = idx > 0 ? currentDayItems[idx - 1] : null
            const w = estimateWalk(prev, item)
            total += w.totalMeters
            steps += w.steps
            count += 1
            if (!heaviest || w.totalMeters > heaviest.totalMeters) {
                heaviest = { item, idx, totalMeters: w.totalMeters, steps: w.steps }
            }
        })

        const avgMeters = count ? total / count : 0
        const avgSteps = count ? steps / count : 0
        const fatigueThreshold = Math.max(1200, avgMeters * 1.15)
        return { avgMeters, avgSteps, fatigueThreshold, heaviest }
    }, [activeDay, currentDayItems, estimateWalk])

    useEffect(() => {
        const heaviest = walkStats.heaviest as { item: ItineraryItem; idx: number; totalMeters: number; steps: number } | null
        if (snackAsk || !heaviest) return
        if (fatigueHandled.has(heaviest.item.id)) return
        if (heaviest.totalMeters >= walkStats.fatigueThreshold) {
            setSnackAsk({ item: heaviest.item, idx: heaviest.idx })
        }
    }, [fatigueHandled, snackAsk, walkStats])


    const generate = async (isSpeedRun = false) => {
        if (!state.chosen && !state.items) return
        setLoading(true)
        setMessage(isSpeedRun ? 'Optimizing for maximum coverage...' : 'Consulting AI for travel times & crowds...')
        try {
            const res = await fetch(resolveApiPath('/api/generate-full-itinerary'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    city: state.city,
                    plan: state.plan,
                    chosen: state.chosen,
                    speedRun: isSpeedRun
                })
            })
            if (!res.ok) throw new Error('Generation failed')
            const data = await res.json()
            setBaseItems(data.timeline || [])
            setOverflow(data.overflow || [])
            setMessage(data.analysis || 'Your optimized itinerary is ready.')
        } catch (e) {
            setMessage('Could not auto-generate. Showing manual picks.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (state.items?.length) {
            setBaseItems(state.items)
            return
        }

        const loadSaved = async () => {
            setLoading(true)
            const { data, error } = await supabase
                .from('itinerary_items')
                .select('*')
                .eq('status', 'planned')
                .eq('city', city)
                .order('time_slot', { ascending: true })

            if (error) {
                setLoading(false)
                if (state.chosen) generate()
                return
            }

            if (data && data.length > 0) {
                const mapped = data.map((row) => ({
                    id: row.id,
                    xid: row.xid,
                    title: row.title,
                    location: row.location,
                    timeSlot: row.time_slot,
                    durationMinutes: row.duration_minutes,
                    category: row.category,
                    status: row.status ?? 'planned',
                    note: row.note ?? '',
                    dayNumber: row.day_number ?? 1,
                    crowdLevel: row.crowd_level
                }))
                setBaseItems(mapped.filter(i => i.dayNumber === 1 || !i.dayNumber))
                setMessage('Your finalized stops for today.')
            } else {
                if (state.chosen) {
                    generate()
                } else {
                    setMessage('No finalized stops yet. Add a pick from the Flow page.')
                }
            }
            setLoading(false)
        }

        loadSaved()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [city, state.items])

    return (
        <TripArcShell mainClassName="max-w-6xl">
            <header className="mb-10 space-y-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/60 mb-2">TripArc Finalized</p>
                        <h1 className="font-display text-4xl font-semibold leading-tight md:text-6xl text-white">Your Day in {city}.</h1>
                        <p className="text-lg text-white/60 mt-2 max-w-2xl">Refined by AI for crowds, travel time, and your vibe signals. This is your master plan.</p>
                    </div>
                    <div className="flex items-center gap-3 self-start">
                        <button
                            onClick={() => navigate('/triparc/stories', { state: { items } })}
                            className="flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-200 transition hover:border-emerald-300/60 hover:bg-emerald-500/20 hover:text-white"
                        >
                            <Sparkles size={14} /> Stories
                        </button>
                        <button
                            onClick={() => navigate('/timeline')}
                            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10 hover:text-white hover:border-white/30"
                        >
                            <ArrowLeft size={14} /> Back
                        </button>
                    </div>
                </div>
            </header>

            {/* Time Machine & Controls */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 flex flex-col gap-6 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 md:p-8 shadow-[0_32px_64px_-32px_rgba(0,0,0,0.5)] md:flex-row md:items-center md:justify-between backdrop-blur-md"
            >
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                            <Clock className="text-white" size={18} />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Time Machine</p>
                            <h2 className="text-xl font-semibold text-white">Design your timeline</h2>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-white/90 mt-2">
                        <div className="group flex items-center gap-3 rounded-full border border-white/10 bg-white/5 pl-4 pr-2 py-1.5 transition hover:border-white/20 hover:bg-white/10">
                            <span className="text-[10px] uppercase tracking-wider opacity-50">Start</span>
                            <span className="font-mono text-lg">{startTime}</span>
                            <div className="flex gap-1 ml-1">
                                <button onClick={() => adjustTime('start', -30)} className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition">-</button>
                                <button onClick={() => adjustTime('start', 30)} className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition">+</button>
                            </div>
                        </div>
                        <ArrowRight size={16} className="text-white/20" />
                        <div className="group flex items-center gap-3 rounded-full border border-white/10 bg-white/5 pl-4 pr-2 py-1.5 transition hover:border-white/20 hover:bg-white/10">
                            <span className="text-[10px] uppercase tracking-wider opacity-50">End</span>
                            <span className="font-mono text-lg">{endTime}</span>
                            <div className="flex gap-1 ml-1">
                                <button onClick={() => adjustTime('end', -30)} className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition">-</button>
                                <button onClick={() => adjustTime('end', 30)} className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition">+</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col items-start gap-1 sm:items-end p-4 rounded-xl bg-white/5 border border-white/5">
                        <p className="text-2xl font-bold text-white leading-none">
                            {items.length} <span className="text-sm font-normal text-white/50 uppercase tracking-wider ml-1">Stops Today</span>
                        </p>
                        {day2Items.length > 0 && <p className="text-xs font-medium text-amber-300/80 uppercase tracking-widest">+ {day2Items.length} for tomorrow</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={shuffleItems}
                            className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:border-white/40 transition"
                        >
                            Shuffle order
                        </button>
                        <button
                            onClick={aiArrange}
                            disabled={arranging}
                            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white shadow hover:-translate-y-[1px] transition disabled:opacity-60"
                        >
                            {arranging ? 'Arranging...' : 'AI arrange (weather + meals)'}
                        </button>
                    </div>
                    {walkStats.avgMeters > 0 && (
                        <p className="text-xs text-white/60 mt-1">
                            Heritage/experience walk avg: ~{Math.round(walkStats.avgMeters / 100) / 10} km (~{Math.round(walkStats.avgSteps)} steps)
                        </p>
                    )}
                </div>
            </motion.div>

            <div className="space-y-8">
                <div className="flex items-center justify-center">
                    <div className="flex gap-2 p-1 rounded-full bg-white/5 border border-white/10">
                        <Chip active={activeDay === 1} label="Day 1" onClick={() => setActiveDay(1)} />
                        <Chip active={activeDay === 2} label={`Day 2 ${day2Items.length ? `(${day2Items.length})` : ''}`} onClick={() => setActiveDay(2)} />
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {currentDayItems.length > 0 ? (
                        currentDayItems.map((item, idx, arr) => {
                            const cat = (item.category || '').toLowerCase()
                            const isFood = cat.includes('food') || cat.includes('restaurant') || cat.includes('cafe')
                            const isHeritageExperience = cat.includes('heritage') || cat.includes('monument') || cat.includes('experience')
                            const hint = !isFood ? weatherHints[item.id] : undefined
                            const recommendClass = hint ? 'border-amber-400/60 bg-amber-500/5 shadow-amber-500/20' : 'border-white/10 bg-white/5'
                            const prevItem = idx > 0 ? arr[idx - 1] : null
                            const walk = !isFood ? estimateWalk(prevItem, item) : null
                            const shouldPromptSnack = isHeritageExperience && walk ? walk.totalMeters >= walkStats.fatigueThreshold : false
                            return (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: idx * 0.05 }}
                                className={`group relative flex flex-col gap-4 rounded-[2rem] border p-6 shadow-xl backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-white/20 hover:bg-white/10 ${recommendClass}`}
                            >
                                <div className="absolute top-4 right-4 p-2 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
                                    <MapPin size={48} /> {/* Reduced size from 80 to 48 */}
                                </div>
                                {item.crowdLevel && ['High', 'Critical'].includes(item.crowdLevel) && (
                                    <div className="absolute top-6 right-6 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)] animate-pulse" title="High Traffic" />
                                )}

                                {hint && (
                                    <div className="absolute left-6 -top-3 flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-50 shadow-lg shadow-amber-900/30">
                                        <Sparkles size={12} /> Weather says {hint.bestTime}
                                    </div>
                                )}

                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60">{item.category}</span>
                                        <span className="font-mono text-xs text-emerald-300">{item.timeSlot}</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-white leading-tight pr-8">{item.title}</h3>
                                    <p className="text-sm text-white/60 mt-1 line-clamp-1 flex items-center gap-1.5">
                                        <MapPin size={12} className="opacity-70" />
                                        {item.location}
                                    </p>
                                    {walk && (
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/70">
                                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[3px]">~{Math.round(walk.totalMeters / 100) / 10} km walk</span>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[3px]">~{walk.steps} steps</span>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[3px]">includes ~{Math.round(walk.onSiteMeters)} m inside</span>
                                            {shouldPromptSnack && (
                                                <button
                                                    onClick={() => setSnackAsk({ item, idx })}
                                                    className="rounded-full border border-amber-300/60 bg-amber-500/10 px-2 py-[3px] text-amber-50 transition hover:border-amber-300 hover:bg-amber-500/20"
                                                >
                                                    Need a quick snack?
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {hint && (
                                    <div className="relative mt-1 rounded-2xl border border-amber-300/40 bg-amber-500/10 p-3 text-amber-50 text-sm">
                                        <p className="font-semibold">We kept this for the {hint.bestTime}.</p>
                                        <p className="text-amber-50/80 text-xs mt-1">
                                            {hint.condition ? `${hint.condition}. ` : ''}
                                            {hint.tempC ? `Peak around ${hint.tempC.toFixed(0)}°C. ` : ''}
                                            {hint.note || 'Better comfort later in the day.'}
                                        </p>
                                    </div>
                                )}
                                {item.note && (
                                    <div className="mt-auto pt-4 border-t border-white/5">
                                        <p className="text-sm text-white/50 italic leading-relaxed">"{item.note}"</p>
                                    </div>
                                )}
                            </motion.div>
                        )})
                    ) : (
                        !loading && (
                            <div className="col-span-full py-20 text-center">
                                <p className="text-lg text-white/40 font-medium">Nothing scheduled for {activeDay === 1 ? 'today' : 'tomorrow'}.</p>
                                <p className="text-sm text-white/20 mt-2">Adjust the time machine or curate more stops.</p>
                            </div>
                        )
                    )}
                </div>
            </div>

            {loading && (
                <div className="mt-20 flex justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-emerald-400" />
                        <p className="text-xs uppercase tracking-[0.2em] text-white/40 animate-pulse">Orchestrating...</p>
                    </div>
                </div>
            )}

            {snackAsk && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70" onClick={() => dismissSnackAsk(snackAsk.item.id)} />
                    <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
                        <h3 className="text-lg font-semibold">That was a walk.</h3>
                        <p className="mt-2 text-sm text-white/70">Add a nearby snack/juice stop after {snackAsk.item.title}?</p>
                        <div className="mt-4 flex gap-2">
                            <button
                                onClick={() => addSnackAfter(snackAsk.item)}
                                disabled={snackLoading === snackAsk.item.id}
                                className="rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow disabled:opacity-60"
                            >
                                {snackLoading === snackAsk.item.id ? 'Finding...' : 'Add snack nearby'}
                            </button>
                            <button
                                onClick={() => dismissSnackAsk(snackAsk.item.id)}
                                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:border-white/40"
                            >
                                Skip
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Overflow / Suggestions */}
            {!loading && overflow.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-24 pt-10 border-t border-white/10"
                >
                    <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-white/50 mb-1">More Options</p>
                            <h3 className="text-2xl font-semibold text-white">Nearby Suggestions</h3>
                        </div>
                        {selectedOverflow.size > 0 && (
                            <button
                                onClick={async () => {
                                    const toMove = overflow.filter(o => selectedOverflow.has(o.id))
                                    setBaseItems(prev => [...prev, ...toMove.map(t => ({ ...t, dayNumber: 1, status: 'planned' as const }))])
                                    setOverflow(prev => prev.filter(o => !selectedOverflow.has(o.id)))
                                    setSelectedOverflow(new Set())
                                }}
                                className="rounded-full bg-emerald-500 px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-xl shadow-emerald-900/40 hover:bg-emerald-400 transition hover:-translate-y-0.5"
                            >
                                Add {selectedOverflow.size} Items
                            </button>
                        )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {overflow.map((item) => {
                            const isSelected = selectedOverflow.has(item.id)
                            return (
                                <div
                                    key={item.id}
                                    onClick={() => {
                                        const next = new Set(selectedOverflow)
                                        if (next.has(item.id)) next.delete(item.id)
                                        else next.add(item.id)
                                        setSelectedOverflow(next)
                                    }}
                                    className={`group cursor-pointer rounded-2xl border p-5 transition-all duration-300 ${isSelected ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10'}`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] uppercase tracking-wider text-white/40 group-hover:text-white/60 transition">{item.category}</span>
                                        <div className={`h-5 w-5 rounded-full border flex items-center justify-center transition ${isSelected ? 'bg-emerald-500 border-emerald-500 scale-110' : 'border-white/20 group-hover:border-white/40'}`}>
                                            {isSelected && <span className="text-[10px] text-white font-bold">✓</span>}
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-white/90 group-hover:text-white transition">{item.title}</p>
                                </div>
                            )
                        })}
                    </div>
                </motion.div>
            )}


            {/* Story Discovery Modal */}
            {showStoryDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowStoryDialog(false)} />
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="relative z-10 w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 p-8 shadow-2xl ring-1 ring-white/10"
                    >
                        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/20 blur-[80px]" />
                        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-indigo-500/20 blur-[80px]" />

                        <button
                            onClick={() => setShowStoryDialog(false)}
                            className="absolute right-5 top-5 rounded-full p-2 text-white/30 hover:bg-white/10 hover:text-white transition"
                        >
                            <X size={20} />
                        </button>

                        <div className="relative flex flex-col items-center text-center">
                            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-purple-500/30">
                                <Sparkles size={40} className="text-white" />
                            </div>

                            <h3 className="font-display text-3xl font-bold text-white">Unlock Stories?</h3>
                            <p className="mt-3 text-base leading-relaxed text-white/60">
                                You're visiting some legendary spots. Should we enable the audio guide for secrets and history?
                            </p>

                            <div className="mt-8 flex w-full flex-col gap-3">
                                <button
                                    onClick={() => navigate('/triparc/stories', { state: { items } })}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-4 text-sm font-bold uppercase tracking-wider text-slate-900 shadow-lg transition hover:scale-[1.02] hover:bg-emerald-50"
                                >
                                    <Sparkles size={16} /> Yes, Start Stories
                                </button>
                                <button
                                    onClick={() => setShowStoryDialog(false)}
                                    className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-transparent py-4 text-sm font-medium text-white/50 transition hover:bg-white/5 hover:text-white"
                                >
                                    maybe later
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </TripArcShell>
    )
}
