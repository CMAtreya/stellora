import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import TripArcNav from '../components/TripArcNav'
import TimelineCard from '../components/timeline/TimelineCard'
import LeafletMap from '../components/LeafletMap'
import { generateSmartTimeline, searchDestinationPlaces, type MealType } from '../lib/sevenPillarsApi'

type CurateItem = {
  id?: string
  title?: string
  name?: string
  category?: string
  type?: string
  location?: string
  time?: string
  duration?: string
  durationMinutes?: number
  description?: string
  note?: string
  lat?: number
  lng?: number
  dayNumber?: number
  status?: string
  photoUrl?: string
  placeId?: string
  openingHours?: string[]
  priceLevel?: number
}

type TimelineState = {
  city?: string
  tripDays?: number
  plan?: any
  chosen?: any
  travelWindow?: { from?: string; to?: string }
  selectedItineraries?: Array<{
    id?: string
    title?: string
    category?: string
    durationMinutes?: number
    dayNumber?: number
    time?: string
  }>
  restaurantOptions?: Record<MealType, Array<{ name: string; category?: string; address?: string; lat?: number; lng?: number; type?: string }>>
  preferences?: {
    budgetAmount?: number
    composition?: string
    interests?: string[]
    archetypes?: string[]
    tripDays?: number
    dietaryPreferences?: string[]
  }
  items?: CurateItem[]
}

type TimelineEntry = {
  id: string
  kind: 'place' | 'meal' | 'insight'
  title: string
  category?: string
  description?: string
  placeName?: string
  location?: string
  time?: string
  timeSlot?: string
  timeRangeLabel?: string
  durationMinutes?: number
  bestTimeLabel?: string
  weatherLabel?: string
  weather?: { tempC?: number | null; condition?: string; hour?: number }
  mealType?: MealType
  note?: string
  skipped?: boolean
  lat?: number
  lng?: number
  photoUrl?: string
  order?: number
  dayNumber?: number
  rating?: number
  placeId?: string
}

type PlaceOption = {
  label: string
  name: string
  vicinity?: string
  lat?: number
  lng?: number
  rating?: number
  reviews?: number
  placeId?: string
  types?: string[]
}

type GeneratedTimeline = {
  city: string
  weatherData: {
    city: string
    latitude?: number
    longitude?: number
    hourly: Array<{ hour: number; label: string; tempC?: number | null; condition?: string; rainProbability?: number; windKph?: number | null }>
    summary?: { bestWindow?: string; hotHours?: number[] }
  }
  mealOptions: Record<MealType, Array<{ name: string; category?: string; address?: string; lat?: number; lng?: number; type?: string }>>
  timeline: TimelineEntry[]
  analysis: string
  summary: {
    weatherOptimized: boolean
    bestWindow?: string
    crowdTiming?: string
    mealCount: number
    placeCount: number
  }
  selectedMeals: Partial<Record<MealType, string | 'skip'>>
}

const JOURNEY_DRAFT_STORAGE_KEY = 'triparc:journey:draft:v1'
const TIMELINE_CACHE_PREFIX = 'triparc:timeline:cache:v1:'
const TIMELINE_CACHE_TTL_MS = 1000 * 60 * 20

type JourneyDraftStorage = {
  city?: string
  items?: CurateItem[]
  travelWindow?: { from?: string; to?: string }
  preferences?: TimelineState['preferences']
  tripDays?: number
}

function readJourneyDraft(): JourneyDraftStorage | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(JOURNEY_DRAFT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as JourneyDraftStorage
  } catch {
    return null
  }
}

function createTimelineCacheKey(city: string, travelWindow: { from?: string; to?: string }, items: CurateItem[]) {
  const fingerprint = items
    .map((item, index) => `${index}:${item.id || ''}:${item.title || item.name || ''}:${item.dayNumber || 1}:${item.time || ''}:${item.durationMinutes || item.duration || ''}`)
    .join('|')
  return `${TIMELINE_CACHE_PREFIX}${city}:${travelWindow.from || ''}-${travelWindow.to || ''}:${fingerprint}`
}

function readTimelineCache(cacheKey: string): GeneratedTimeline | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt: number; data: GeneratedTimeline }
    if (!parsed?.savedAt || !parsed?.data) return null
    if (Date.now() - parsed.savedAt > TIMELINE_CACHE_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeTimelineCache(cacheKey: string, data: GeneratedTimeline) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    // Ignore cache write failures.
  }
}

const mealKeys: MealType[] = ['breakfast', 'lunch', 'snacks', 'dinner']
const defaultMealPlan: Record<MealType, boolean> = {
  breakfast: true,
  lunch: true,
  snacks: true,
  dinner: true,
}

function parseMinutes(value?: string, fallback = 60) {
  if (!value) return fallback
  const text = value.toLowerCase()
  const n = Number((text.match(/\d+/)?.[0] || '0'))
  if (!Number.isFinite(n) || n <= 0) return fallback
  if (text.includes('hr')) return Math.max(30, n * 60)
  return Math.max(15, n)
}

function formatMinutesAs12Hour(totalMinutes: number) {
  const mins = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h24 = Math.floor(mins / 60)
  const mm = String(mins % 60).padStart(2, '0')
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${String(h12).padStart(2, '0')}:${mm} ${suffix}`
}

function parseTime(value?: string) {
  const text = (value || '').trim().toUpperCase()
  const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/)
  if (!match) return NaN
  const hour = Number(match[1]) % 12 + (match[3] === 'PM' ? 12 : 0)
  return hour * 60 + Number(match[2])
}

function toTimelineEntries(items: CurateItem[], city: string): CurateItem[] {
  if (!items.length) {
    return [
      { title: 'Fushimi Inari Shrine Walk', category: 'Heritage', durationMinutes: 120, location: city, dayNumber: 1 },
      { title: 'Matcha Tea Ceremony', category: 'Culture', durationMinutes: 90, location: 'Gion District', dayNumber: 1 },
      { title: 'Nishiki Market', category: 'Market', durationMinutes: 75, location: 'Central Kyoto', dayNumber: 1 },
    ]
  }
  return items.map((item) => ({
    ...item,
    title: item.title || item.name || 'Planned stop',
    durationMinutes: item.durationMinutes || parseMinutes(item.duration, 60),
  }))
}

function buildImmediateTimeline(items: CurateItem[]): TimelineEntry[] {
  return items.map((item, index) => ({
    id: String(item.id || `entry-${index}`),
    kind: 'place',
    title: item.title || item.name || 'Planned stop',
    category: item.category || 'Planned',
    description: item.description || item.note || 'Curated destination from your draft itinerary.',
    location: item.location,
    time: item.time,
    timeSlot: item.time,
    durationMinutes: item.durationMinutes || parseMinutes(item.duration, 60),
    lat: item.lat,
    lng: item.lng,
    photoUrl: item.photoUrl,
    order: typeof item.dayNumber === 'number' ? undefined : index,
    dayNumber: item.dayNumber || 1,
  }))
}

function getDayGroups(entries: TimelineEntry[]) {
  const grouped = new Map<number, TimelineEntry[]>()
  for (const entry of entries) {
    const day = Math.max(1, Number(entry.dayNumber || 1))
    const list = grouped.get(day) || []
    list.push(entry)
    grouped.set(day, list)
  }
  return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).map(([day, list]) => [day, [...list].sort((a, b) => (a.order || 0) - (b.order || 0))] as [number, TimelineEntry[]])
}

export default function TimelinePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as TimelineState | null) || {}
  const persistedDraft = useMemo(() => readJourneyDraft(), [])
  const city = state.city || persistedDraft?.city || 'Kyoto'
  const [mealPlan] = useState<Record<MealType, boolean>>(defaultMealPlan)
  const [selectedMeals, setSelectedMeals] = useState<Partial<Record<MealType, string | 'skip'>>>({})
  const [generated, setGenerated] = useState<GeneratedTimeline | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeDay, setActiveDay] = useState(1)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [expandedId] = useState<string | null>(null)
  const [mapMarkers, setMapMarkers] = useState<Array<{ lat: number; lng: number; title?: string }>>([])
  const [routePoints, setRoutePoints] = useState<Array<[number, number]>>([])
  const [totalDistanceKm, setTotalDistanceKm] = useState<number | null>(null)
  const [activeStep, setActiveStep] = useState<'plan' | 'curate' | 'timeline'>('timeline')
  const [mealSearchActiveId, setMealSearchActiveId] = useState<string | null>(null)
  const [mealSearchQuery, setMealSearchQuery] = useState('')
  const [mealSearchOptions, setMealSearchOptions] = useState<PlaceOption[]>([])
  const [mealSearchLoading, setMealSearchLoading] = useState(false)
  const [mealSearchError, setMealSearchError] = useState('')
  const [mealSuggestionNote, setMealSuggestionNote] = useState('')

  const sourceItems = useMemo(() => toTimelineEntries(state.items || persistedDraft?.items || [], city), [city, persistedDraft?.items, state.items])
  const tripDays = Math.max(1, Number(state.tripDays || state.preferences?.tripDays || persistedDraft?.tripDays || 1))
  const travelWindow = state.travelWindow || persistedDraft?.travelWindow || { from: '08:00', to: '20:00' }
  const preferences = state.preferences || persistedDraft?.preferences || {}
  const timelineCacheKey = useMemo(() => createTimelineCacheKey(city, travelWindow, sourceItems), [city, sourceItems, travelWindow])

  useEffect(() => {
    const defaultSelection: Partial<Record<MealType, string | 'skip'>> = {}
    mealKeys.forEach((meal) => {
      defaultSelection[meal] = ''
    })
    setSelectedMeals(defaultSelection)
  }, [city])

  const curatedRestaurantFallback = sourceItems
    .filter((item) => /restaurant|cafe|food|dining/i.test(`${item.category || ''} ${item.type || ''}`))
    .slice(0, 8)
    .map((item) => ({ name: item.title || item.name || 'Restaurant', category: item.category, address: item.location, lat: item.lat, lng: item.lng, type: item.type }))

  const mealOptions = generated?.mealOptions || state.restaurantOptions || {
    breakfast: curatedRestaurantFallback,
    lunch: curatedRestaurantFallback,
    snacks: curatedRestaurantFallback,
    dinner: curatedRestaurantFallback,
  }

  const grouped = useMemo(() => getDayGroups(timeline), [timeline])
  const visibleItems = useMemo(() => grouped.find(([day]) => day === activeDay)?.[1] || [], [activeDay, grouped])
  const weatherData = generated?.weatherData

  useEffect(() => {
    if (activeDay > grouped.length) setActiveDay(1)
  }, [activeDay, grouped.length])

  // Compute route for visible items on the active day
  useEffect(() => {
    const computeRoute = async () => {
      if (!visibleItems.length) {
        setMapMarkers([])
        setRoutePoints([])
        setTotalDistanceKm(null)
        return
      }

      // Create markers from visible items
      const items = visibleItems.filter((item) => item.lat && item.lng)
      const markers = items.map((item) => ({
        lat: item.lat!,
        lng: item.lng!,
        title: item.title,
      }))
      setMapMarkers(markers)

      if (markers.length < 2) {
        setRoutePoints([])
        setTotalDistanceKm(null)
        return
      }

      try {
        // Fetch route from OSRM
        const coordPairs = markers.map((m) => `${m.lng},${m.lat}`)
        const coordStr = coordPairs.join(';')
        const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`

        const response = await fetch(url)
        const data = await response.json()

        if (data.routes && data.routes[0]) {
          const route = data.routes[0]
          const geometry = route.geometry.coordinates.map(
            (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
          )
          setRoutePoints(geometry)
          setTotalDistanceKm(route.distance / 1000)
        }
      } catch (err) {
        console.error('Failed to fetch route:', err)
        setRoutePoints([])
        setTotalDistanceKm(null)
      }
    }

    void computeRoute()
  }, [visibleItems])

  const openFullPageMap = () => {
    navigate('/full-map', {
      state: {
        items: visibleItems,
        destination: city,
        mapMarkers,
        routePoints,
      },
    })
  }

  const goToPlan = () => {
    setActiveStep('plan')
    navigate('/triparc/7pillars')
  }

  const goToCurate = () => {
    setActiveStep('curate')
    navigate('/curate', { state })
  }

  const goToTimeline = () => {
    setActiveStep('timeline')
    navigate('/timeline', { state })
  }

  const generateTimeline = async () => {
    const cachedTimeline = readTimelineCache(timelineCacheKey)
    if (cachedTimeline) {
      setGenerated(cachedTimeline)
      setTimeline(cachedTimeline.timeline || buildImmediateTimeline(sourceItems))
      setActiveDay(1)
      return
    }

    setLoading((prev) => prev || timeline.length === 0)
    setError('')
    try {
      const response = await generateSmartTimeline({
        city,
        travelWindow,
        plan: state.plan || {
          dayStart: travelWindow.from,
          dayEnd: travelWindow.to,
          budgetAmount: preferences.budgetAmount,
          composition: preferences.composition,
          interests: preferences.interests || [],
        },
        items: sourceItems,
        preferences,
        mealPlan,
        selectedMeals,
      })
      setGenerated(response)
      setTimeline(response.timeline || [])
      setActiveDay(1)
      writeTimelineCache(timelineCacheKey, response)
    } catch (err: any) {
      setError(err?.message || 'Failed to generate timeline.')
      if (!timeline.length) {
        setTimeline(buildImmediateTimeline(sourceItems))
      }
    } finally {
      setLoading(false)
    }
  }

  const normalizeAfterReorder = (items: TimelineEntry[]) => {
    const ordered = items.map((item, index) => ({ ...item, order: index, dayNumber: item.dayNumber || 1 }))
    setTimeline(ordered)
  }

  const handleDrop = (id: string) => {
    if (!draggedId || draggedId === id) return
    const next = [...timeline]
    const fromIndex = next.findIndex((item) => item.id === draggedId)
    const toIndex = next.findIndex((item) => item.id === id)
    if (fromIndex < 0 || toIndex < 0) return
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    normalizeAfterReorder(next)
    setDraggedId(null)
  }

  const handleEditTime = (id: string) => {
    const next = prompt('Enter new time in HH:MM AM/PM format')
    if (!next) return
    const mins = parseTime(next)
    if (Number.isNaN(mins)) return
    setTimeline((prev) => prev.map((item) => (item.id === id ? { ...item, time: next, timeSlot: `${next} • manual edit` } : item)))
  }

  const handleReplace = (id: string) => {
    const current = timeline.find((item) => item.id === id)
    if (!current) return
    const pool = mealOptions.breakfast.concat(mealOptions.lunch, mealOptions.snacks, mealOptions.dinner).filter(Boolean)
    const replacement = pool.find((item) => item.name !== current.title) || pool[0]
    if (!replacement) return
    setTimeline((prev) => prev.map((item) => (item.id === id ? { ...item, title: replacement.name, placeName: replacement.name, location: replacement.address || item.location, category: replacement.category || item.category, description: 'Replaced with a route-aligned alternative.', } : item)))
  }

  const openMealSearch = (id: string) => {
    setMealSuggestionNote('')
    setMealSearchError('')
    setMealSearchOptions([])
    setMealSearchActiveId(id)
    const target = timeline.find((entry) => entry.id === id)
    setMealSearchQuery(target?.placeName || target?.title || '')
  }

  const closeMealSearch = () => {
    setMealSearchActiveId(null)
    setMealSearchQuery('')
    setMealSearchOptions([])
    setMealSearchError('')
  }

  const handleMealSearchChange = async (id: string, query: string) => {
    setMealSearchActiveId(id)
    setMealSearchQuery(query)
    setMealSearchError('')
    setMealSuggestionNote('')

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setMealSearchOptions([])
      return
    }

    try {
      setMealSearchLoading(true)
      const options = (await searchDestinationPlaces(trimmed, city, 8)) as PlaceOption[]
      setMealSearchOptions(options)
    } catch (err: any) {
      setMealSearchError(err?.message || 'Unable to search places.')
      setMealSearchOptions([])
    } finally {
      setMealSearchLoading(false)
    }
  }

  const handleMealSearchSelect = (id: string, option: PlaceOption) => {
    setTimeline((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              title: entry.mealType ? entry.mealType.charAt(0).toUpperCase() + entry.mealType.slice(1) : entry.title,
              placeName: option.name,
              location: option.vicinity || entry.location || city,
              lat: option.lat,
              lng: option.lng,
              rating: option.rating,
              placeId: option.placeId,
              note: `${option.name}${typeof option.rating === 'number' ? ` (Rating ${option.rating.toFixed(1)})` : ''}`,
            }
          : entry
      )
    )
    setMealSuggestionNote('Place updated from Google Places results.')
    closeMealSearch()
  }

  const suggestNearbyForMeal = async (id: string) => {
    const target = timeline.find((entry) => entry.id === id)
    if (!target) return

    const mealType = target.mealType || 'meal'
    const dietary = (preferences.dietaryPreferences || []).join(' ')
    const foodHint = dietary.trim() || 'restaurant'
    const anchor = target.placeName || target.location || city
    const query = `${foodHint} ${mealType} near ${anchor}`

    try {
      setMealSearchLoading(true)
      setMealSearchError('')
      setMealSearchActiveId(id)
      setMealSearchQuery(query)
      const raw = (await searchDestinationPlaces(query, city, 10)) as PlaceOption[]

      const rated = raw.filter((item) => typeof item.rating === 'number' && item.rating >= 4)
      const fallback = rated.length ? rated : raw

      const sorted = [...fallback].sort((a, b) => {
        const ar = typeof a.rating === 'number' ? a.rating : 0
        const br = typeof b.rating === 'number' ? b.rating : 0
        return br - ar
      })

      setMealSearchOptions(sorted)

      if (sorted[0]) {
        handleMealSearchSelect(id, sorted[0])
        setMealSuggestionNote(`Suggested nearest ${mealType} option with rating ${sorted[0].rating ? sorted[0].rating.toFixed(1) : 'N/A'} based on your food preferences.`)
      } else {
        setMealSuggestionNote('No nearby matching restaurants found. Try searching manually.')
      }
    } catch (err: any) {
      setMealSearchError(err?.message || 'Unable to suggest nearby restaurants.')
      setMealSearchOptions([])
    } finally {
      setMealSearchLoading(false)
    }
  }

  const daySummary = useMemo(() => {
    const totalMinutes = visibleItems.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0)
    const distanceKm = Number((visibleItems.length * 1.7 + totalMinutes / 160).toFixed(1))
    const budget = Number(preferences.budgetAmount || state.plan?.budgetAmount || Math.max(2500, visibleItems.length * 900))
    const food = Math.round(budget * 0.4)
    const entry = Math.round(budget * 0.35)
    const travel = Math.max(0, budget - food - entry)
    const walkingLoad = Math.min(95, Math.max(20, Math.round(distanceKm * 10)))
    const activityDensity = Math.min(95, Math.max(25, Math.round((visibleItems.length / 6) * 100)))
    return { totalMinutes, distanceKm, budget, food, entry, travel, walkingLoad, activityDensity }
  }, [preferences.budgetAmount, state.plan?.budgetAmount, visibleItems])

  const restaurantPreview = useMemo(() => {
    const entries = Object.entries(mealOptions) as Array<[MealType, Array<{ name: string }>]>
    return entries.reduce<Array<{ meal: MealType; name: string }>>((acc, [meal, options]) => {
      options.slice(0, 2).forEach((option) => acc.push({ meal, name: option.name }))
      return acc
    }, [])
  }, [mealOptions])

  const insights = useMemo(() => {
    const first = visibleItems[0]
    const last = visibleItems[visibleItems.length - 1]
    return [
      generated?.analysis || 'Weather, distance, and meal windows were used to balance the day.',
      first ? `Early placement keeps ${first.title} in the calmest window.` : 'The route opens with a soft morning cadence.',
      last ? `Ending with ${last.title} avoids unnecessary backtracking.` : 'Route transitions remain compact and smooth.',
    ]
  }, [generated?.analysis, visibleItems])

  useEffect(() => {
    // Show all curated places instantly while the enriched timeline hydrates.
    setTimeline(buildImmediateTimeline(sourceItems))
    setActiveDay(1)
    void generateTimeline()
    // Auto-generate once for the current route state.
  }, [city, timelineCacheKey, travelWindow.from, travelWindow.to, state.items, state.plan, state.restaurantOptions])

  return (
    <div className="min-h-screen bg-[#131317] text-[#e4e1e7]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 350, 'GRAD' 0, 'opsz' 24; }
        .obsidian-grid { background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px); background-size: 32px 32px; }
        .aurora-bloom { background: radial-gradient(circle at center, rgba(37, 99, 235, 0.08) 0%, transparent 70%); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes stepUnderline {
          from { transform: scaleX(0); transform-origin: left; opacity: 0.75; }
          to { transform: scaleX(1); transform-origin: left; opacity: 1; }
        }
      `}</style>

      <TripArcNav />

      <main className="mx-auto max-w-[1600px] px-8 pb-28 pt-8">
        <header className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-2 text-5xl font-extrabold tracking-tighter text-white">{city} Expedition</h1>
            <p className="max-w-2xl text-[#c3c6d7]">An intelligent timeline that balances weather, meal timing, and route flow around the places you curated.</p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#f7d982]">Travel window {travelWindow.from} - {travelWindow.to} • {tripDays} day{tripDays > 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">
            <button
              type="button"
              onClick={goToPlan}
              className="flex flex-col items-center gap-1 transition-opacity hover:opacity-100"
            >
              <span>Plan</span>
              <div
                className={`h-1 w-12 rounded-full ${activeStep === 'plan' ? 'bg-[#2563eb] shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-white/10'}`}
                style={activeStep === 'plan' ? { animation: 'stepUnderline .35s ease-out' } : undefined}
              />
            </button>
            <button
              type="button"
              onClick={goToCurate}
              className="flex flex-col items-center gap-1 transition-opacity hover:opacity-100"
            >
              <span className={`${activeStep === 'curate' ? 'text-white' : 'text-[#c3c6d7]'} transition hover:text-white`}>Curate</span>
              <div
                className={`h-1 w-16 rounded-full ${activeStep === 'curate' ? 'bg-[#2563eb] shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-white/10'}`}
                style={activeStep === 'curate' ? { animation: 'stepUnderline .35s ease-out' } : undefined}
              />
            </button>
            <button
              type="button"
              onClick={goToTimeline}
              className="flex flex-col items-center gap-1 transition-opacity hover:opacity-100"
            >
              <span className={`${activeStep === 'timeline' ? 'text-white' : 'text-[#c3c6d7]'} transition hover:text-white`}>Timeline</span>
              <div
                className={`h-1 w-16 rounded-full ${activeStep === 'timeline' ? 'bg-[#2563eb] shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-white/10'}`}
                style={activeStep === 'timeline' ? { animation: 'stepUnderline .35s ease-out' } : undefined}
              />
            </button>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-12">
          <aside className="flex flex-col gap-6 lg:col-span-3">
            <div className="rounded-3xl border border-[#434655]/15 bg-[#1b1b1f] p-6">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f1f23]">
                  <span className="material-symbols-outlined text-[#b4c5ff]">travel_explore</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Trip Overview</h3>
                  <p className="text-[10px] uppercase tracking-widest text-[#c3c6d7]">Auto generated day plan</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-xs text-[#c3c6d7]">
                <span>Weather optimized</span>
                <span className="font-bold text-[#b4c5ff]">{generated?.summary.bestWindow || weatherData?.summary?.bestWindow || 'morning'}</span>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-xs text-[#c3c6d7]">
                <span>Meal cards</span>
                <span className="font-bold text-[#b4c5ff]">{generated?.summary.mealCount || mealKeys.filter((meal) => mealPlan[meal]).length}</span>
              </div>
            </div>

            <div className="rounded-3xl border border-[#434655]/15 bg-[#1b1b1f] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#c3c6d7]">Days</h2>
                <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold text-white">{grouped.length} active</span>
              </div>
              <div className="space-y-2">
                {grouped.map(([day, entries]) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setActiveDay(day)}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${activeDay === day ? 'bg-[#2563eb]/15 text-white' : 'bg-white/5 text-[#c3c6d7] hover:bg-white/10'}`}
                  >
                    <div>
                      <div className="text-sm font-bold">Day {String(day).padStart(2, '0')}</div>
                      <div className="text-[10px] uppercase tracking-widest opacity-60">{entries[0]?.category || 'Curated trail'}</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest opacity-70">{entries.length} items</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="flex flex-col gap-6 lg:col-span-6">
            <div className="rounded-3xl border border-[#434655]/15 bg-[#1b1b1f] p-6 shadow-2xl">
              {loading && <p className="mb-4 text-sm text-[#c3c6d7]">Building your itinerary with weather and meal context...</p>}
              {error && <p className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>}
              <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-2 scrollbar-hide">
                {visibleItems.map((entry) => (
                  <div key={entry.id} className="animate-[fadeUp_.35s_ease]">
                    <TimelineCard
                      entry={entry}
                      active={entry.order === 0}
                      onDragStart={(id) => setDraggedId(id)}
                      onDragOver={() => event.preventDefault()}
                      onDrop={handleDrop}
                      onEditTime={handleEditTime}
                      onReplace={handleReplace}
                      onMealSearchOpen={openMealSearch}
                      onMealSuggestNearby={suggestNearbyForMeal}
                      onMealSearchChange={(id, q) => handleMealSearchChange(id, q)}
                      onMealSearchSelect={(id, opt) => handleMealSearchSelect(id, opt)}
                      onMealSearchClose={closeMealSearch}
                      mealSearchActiveId={mealSearchActiveId}
                      mealSearchQuery={mealSearchQuery}
                      mealSearchOptions={mealSearchOptions}
                      mealSearchLoading={mealSearchLoading}
                      mealSearchError={mealSearchError}
                      mealSuggestionNote={mealSuggestionNote}
                    />
                  </div>
                ))}
                {!visibleItems.length && (
                  <div className="rounded-3xl border border-[#434655]/15 bg-white/5 p-6 text-sm text-[#c3c6d7]">No timeline items available for this day.</div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[#434655]/15 bg-[#1b1b1f] p-8">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#c3c6d7]">Day Summary</h3>
                <button
                  type="button"
                  onClick={generateTimeline}
                  disabled={loading}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Regenerate
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">Total Time</p>
                  <p className="mt-1 text-2xl font-black text-white">{Math.round((daySummary.totalMinutes / 60) * 10) / 10} <span className="text-sm font-medium uppercase text-[#c3c6d7]">hrs</span></p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">Distance</p>
                  <p className="mt-1 text-2xl font-black text-white">{daySummary.distanceKm} <span className="text-sm font-medium uppercase text-[#c3c6d7]">km</span></p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">Budget</p>
                  <p className="mt-1 text-2xl font-black text-white">₹{daySummary.budget}</p>
                </div>
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-6 lg:col-span-3">
            <div className="group relative h-72 overflow-hidden rounded-3xl border border-white/10 bg-[#05070a] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.35)] cursor-pointer transition-all hover:border-white/20 hover:shadow-[0_24px_120px_rgba(6,182,212,0.15)]" onClick={openFullPageMap}>
              {/* Map Background */}
              <div className="absolute inset-0 z-0">
                <LeafletMap markers={mapMarkers} route={routePoints} />
              </div>

              {/* Gradient Overlays */}
              <div className="absolute inset-0 z-[5] bg-gradient-to-t from-black/70 via-black/20 to-black/10 pointer-events-none" />
              <div className="absolute inset-0 z-[6] bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.18),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(247,217,130,0.10),transparent_30%)] pointer-events-none" />

              {/* Content Overlay */}
              <div className="relative z-10 flex h-full flex-col justify-between p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-[9px] font-black uppercase tracking-[0.3em] text-[#06B6D4]">nav scan / active</p>
                    <h4 className="text-xl font-black tracking-tight text-white">{city}</h4>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-black/60 transition-colors" onClick={(e) => e.stopPropagation()}>
                      <span className="material-symbols-outlined text-[20px]">my_location</span>
                    </button>
                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-black/60 transition-colors" onClick={(e) => e.stopPropagation()}>
                      <span className="material-symbols-outlined text-[20px]">layers</span>
                    </button>
                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-[#06B6D4]/30 transition-colors opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); openFullPageMap(); }}>
                      <Maximize2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-6">
                    <div className="flex flex-col">
                      <span className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">POIs</span>
                      <span className="text-sm font-bold text-white">{visibleItems.filter((item) => item.kind === 'place').length} Units</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">Optim</span>
                      <span className="text-sm font-bold text-[#06B6D4]">{totalDistanceKm != null ? `${Math.max(0, 100 - Math.min(100, totalDistanceKm))}%` : '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#06B6D4] animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">Live</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[#434655]/15 bg-[#1b1b1f] p-6">
              <div className="mb-5 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563eb]/20">
                  <span className="material-symbols-outlined text-sm text-[#b4c5ff]" style={{ fontVariationSettings: '"FILL" 1' }}>auto_awesome</span>
                </div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">ORA'S ASSISTANCE</h3>
              </div>
              <ul className="flex flex-col gap-4">
                {insights.map((insight) => (
                  <li key={insight} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-lg text-[#b4c5ff]">check_circle</span>
                    <span className="text-sm leading-tight text-[#c3c6d7]">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-[#434655]/15 bg-[#1b1b1f] p-6">
              <h3 className="mb-6 text-xs font-bold uppercase tracking-wider text-white">Day Balance</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-tighter text-[#c3c6d7]"><span>Walking Load</span><span className="text-[#b4c5ff]">{daySummary.walkingLoad}%</span></div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#353439]"><div className="h-full rounded-full bg-[#b4c5ff]" style={{ width: `${daySummary.walkingLoad}%` }} /></div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-tighter text-[#c3c6d7]"><span>Activity Density</span><span className="text-[#b4c5ff]">{daySummary.activityDensity >= 70 ? 'High' : daySummary.activityDensity >= 40 ? 'Medium' : 'Low'}</span></div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#353439]"><div className="h-full rounded-full bg-[#b4c5ff]" style={{ width: `${daySummary.activityDensity}%` }} /></div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[#434655]/15 bg-[#1b1b1f] p-6">
              <h3 className="mb-6 text-xs font-bold uppercase tracking-wider text-white">Budget Breakdown</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#1f1f23] p-3"><span className="text-[10px] font-bold uppercase text-[#c3c6d7]">Food</span><span className="text-sm font-bold text-white">₹{daySummary.food}</span></div>
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#1f1f23] p-3"><span className="text-[10px] font-bold uppercase text-[#c3c6d7]">Entry</span><span className="text-sm font-bold text-white">₹{daySummary.entry}</span></div>
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#1f1f23] p-3"><span className="text-[10px] font-bold uppercase text-[#c3c6d7]">Travel</span><span className="text-sm font-bold text-white">₹{daySummary.travel}</span></div>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-8 overflow-hidden rounded-3xl border border-[#434655]/15 bg-[#1b1b1f] p-8">
          <div className="absolute right-0 top-0 h-32 w-32 bg-[#2563eb]/10 blur-[60px]" />
          <div className="relative z-10 flex flex-col gap-4">
            <h4 className="text-sm font-bold uppercase tracking-widest text-[#c3c6d7]">Weather & Meal Context</h4>
            <div className="grid gap-4 md:grid-cols-3">
              {(weatherData?.hourly || []).slice(0, 3).map((hour) => (
                <div key={hour.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-[#c3c6d7]">{hour.label}</span>
                    <span className="text-sm font-bold text-[#b4c5ff]">{hour.tempC ?? '--'}°</span>
                  </div>
                  <p className="mt-2 text-sm text-white">{hour.condition || 'clear'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
