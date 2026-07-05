import { useEffect, useMemo, useState, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import TripArcNav from '../components/TripArcNav'
import { useOraPageContext } from '../types/oraContext'
import { tripStore, useTripStore } from '../store/tripStore'
import { globalActionRegistry } from '../agent/actionRegistry'
import TimelineCard from '../components/timeline/TimelineCard'
import LeafletMap from '../components/LeafletMap'
import { generateSmartTimeline, searchDestinationPlaces, getPlaceDetails, type MealType } from '../lib/sevenPillarsApi'

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
  photoReference?: string
  openingHours?: string[]
  priceLevel?: number
}

type TimelineState = {
  city?: string
  tripDays?: number
  plan?: any
  chosen?: any
  startLocation?: {
    lat: number
    lng: number
    label?: string
  }
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
  photoReference?: string
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
  photoReference?: string
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
const ROUTE_SAVINGS_STORAGE_KEY = 'triparc:timeline:route-savings:v1'
const SHOW_MEAL_CARDS_STORAGE_KEY = 'triparc:timeline:show-meals:v1'
const TIMELINE_SAVED_DRAFT_PREFIX = 'triparc:timeline:saved-draft:v1:'
const TIMELINE_CACHE_TTL_MS = 1000 * 60 * 20

type JourneyDraftStorage = {
  city?: string
  items?: CurateItem[]
  travelWindow?: { from?: string; to?: string }
  preferences?: TimelineState['preferences']
  tripDays?: number
  plan?: any
  chosen?: any
}

type RouteSavings = {
  optimizedDistanceKm: number
  baselineDistanceKm: number
  distanceSavedKm: number
  costSaved: number
  nearestStopId?: string | null
  nearestStopTitle?: string
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

function writeJourneyDraft(payload: JourneyDraftStorage) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(JOURNEY_DRAFT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage failures.
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

function writeRouteSavings(data: RouteSavings | null) {
  if (typeof window === 'undefined') return
  try {
    if (!data) {
      window.localStorage.removeItem(ROUTE_SAVINGS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(ROUTE_SAVINGS_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    // Ignore cache write failures.
  }
}

function readRouteSavings(): RouteSavings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ROUTE_SAVINGS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: RouteSavings }
    if (!parsed?.data) return null
    return parsed.data
  } catch {
    return null
  }
}

function readShowMealCards(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(SHOW_MEAL_CARDS_STORAGE_KEY)
    if (raw == null) return true
    return raw !== 'false'
  } catch {
    return true
  }
}

function writeShowMealCards(value: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SHOW_MEAL_CARDS_STORAGE_KEY, value ? 'true' : 'false')
  } catch {
    // Ignore storage failures.
  }
}

function createTimelineSavedDraftKey(timelineCacheKey: string) {
  return `${TIMELINE_SAVED_DRAFT_PREFIX}${timelineCacheKey}`
}

function readTimelineSavedDraft(timelineCacheKey: string): TimelineEntry[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(createTimelineSavedDraftKey(timelineCacheKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: number; timeline?: TimelineEntry[] }
    if (!Array.isArray(parsed?.timeline)) return null
    return parsed.timeline
  } catch {
    return null
  }
}

function writeTimelineSavedDraft(timelineCacheKey: string, timeline: TimelineEntry[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      createTimelineSavedDraftKey(timelineCacheKey),
      JSON.stringify({ savedAt: Date.now(), timeline }),
    )
  } catch {
    // Ignore storage failures.
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

function extractPhotoReferenceFromUrl(url?: string) {
  if (!url) return ''
  const match = url.match(/[?&]ref=([^&]+)/i)
  if (!match?.[1]) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
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

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371 // km
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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
  const entries: TimelineEntry[] = items.map((item, index) => ({
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
    placeId: item.placeId,
    photoReference: item.photoReference || extractPhotoReferenceFromUrl(item.photoUrl),
    order: typeof item.dayNumber === 'number' ? undefined : index,
    dayNumber: item.dayNumber || 1,
  }))

  return sortTimelineEntriesByTime(entries)
}

function buildNearestNeighborRoute(items: TimelineEntry[], startLocation?: { lat: number; lng: number } | null) {
  const remaining = items.filter((item) => item.lat != null && item.lng != null)
  const ordered: TimelineEntry[] = []
  let cursor = startLocation ? { ...startLocation } : null

  while (remaining.length) {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    remaining.forEach((item, index) => {
      if (cursor) {
        const distance = haversineKm(cursor.lat, cursor.lng, item.lat!, item.lng!)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      } else if (index === 0) {
        bestIndex = 0
      }
    })

    const [next] = remaining.splice(bestIndex, 1)
    ordered.push(next)
    cursor = { lat: next.lat!, lng: next.lng! }
  }

  return ordered
}

async function fetchOsrmRoute(startLocation: { lat: number; lng: number } | null, items: TimelineEntry[]) {
  const points = items.filter((item) => item.lat != null && item.lng != null)
  if (!points.length) return null
  const coordPairs = startLocation ? [`${startLocation.lng},${startLocation.lat}`] : []
  coordPairs.push(...points.map((item) => `${item.lng},${item.lat}`))
  if (coordPairs.length < 2) return null

  const coordStr = coordPairs.join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
  const response = await fetch(url)
  const data = await response.json()
  const route = data?.routes?.[0]
  if (!route?.geometry?.coordinates?.length) return null

  return {
    distanceKm: Number(route.distance || 0) / 1000,
    geometry: route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number]),
  }
}

function sortTimelineEntriesByTime(entries: TimelineEntry[]) {
  return [...entries].sort((a, b) => {
    const aTime = parseTime(a.time || a.timeSlot || a.timeRangeLabel)
    const bTime = parseTime(b.time || b.timeSlot || b.timeRangeLabel)
    const aHasTime = Number.isFinite(aTime)
    const bHasTime = Number.isFinite(bTime)
    if (aHasTime && bHasTime && aTime !== bTime) return aTime - bTime
    if (aHasTime !== bHasTime) return aHasTime ? -1 : 1
    const aOrder = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.POSITIVE_INFINITY
    const bOrder = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.title.localeCompare(b.title)
  })
}

function getDayGroups(entries: TimelineEntry[]) {
  const grouped = new Map<number, TimelineEntry[]>()
  for (const entry of entries) {
    if (entry.kind === 'meal') continue // Completely remove breakfast, lunch, snacks, and dinner cards
    const day = Math.max(1, Number(entry.dayNumber || 1))
    const list = grouped.get(day) || []
    list.push(entry)
    grouped.set(day, list)
  }
  return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).map(([day, list]) => [day, sortTimelineEntriesByTime(list)] as [number, TimelineEntry[]])
}

export default function TimelinePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setPageContext } = useOraPageContext()

  useEffect(() => {
    const timelineUnlocked = localStorage.getItem('triparc:timeline:unlocked:v1') === 'true'
    if (!timelineUnlocked) {
      navigate('/curate', { replace: true })
    }
  }, [navigate])
  const storeActiveDay = useTripStore((state) => state.activeDay || 1)
  const state = (location.state as TimelineState | null) || {}
  const persistedDraft = useMemo(() => readJourneyDraft(), [])
  const city = state.city || persistedDraft?.city || 'Kyoto'
  const [mealPlan] = useState<Record<MealType, boolean>>(defaultMealPlan)
  const [showMealCards, setShowMealCards] = useState<boolean>(() => readShowMealCards())
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
  const [routeStartLocation, setRouteStartLocation] = useState<{ lat: number; lng: number; label?: string } | null>(null)
  const [showStartLocationPrompt, setShowStartLocationPrompt] = useState(false)
  const [startLocationReady, setStartLocationReady] = useState(false)
  const [startLocationQuery, setStartLocationQuery] = useState('')
  const [startLocationOptions, setStartLocationOptions] = useState<PlaceOption[]>([])
  const [startLocationLoading, setStartLocationLoading] = useState(false)
  const [startLocationError, setStartLocationError] = useState('')
  const [nearestStopId, setNearestStopId] = useState<string | null>(null)
  const [nearestStopLabel, setNearestStopLabel] = useState('')
  const [activeStep, setActiveStep] = useState<'plan' | 'curate' | 'timeline'>('timeline')
  const [mealSearchActiveId, setMealSearchActiveId] = useState<string | null>(null)
  const [mealSearchQuery, setMealSearchQuery] = useState('')
  const [mealSearchOptions, setMealSearchOptions] = useState<PlaceOption[]>([])
  const [mealSearchLoading, setMealSearchLoading] = useState(false)
  const [mealSearchError, setMealSearchError] = useState('')
  const [mealSuggestionNote, setMealSuggestionNote] = useState('')
  const [foodEstimates, setFoodEstimates] = useState<Record<string, number>>({})
  const [entryEstimates, setEntryEstimates] = useState<Record<string, number>>({})
  const [draftSaveMessage, setDraftSaveMessage] = useState('')

  function findNearestVisibleItem(items: TimelineEntry[], location: { lat: number; lng: number }) {
    let nearest: TimelineEntry | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const item of items) {
      if (item.lat == null || item.lng == null) continue
      const distance = haversineKm(location.lat, location.lng, item.lat, item.lng)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = item
      }
    }
    return nearest ? { item: nearest, distanceKm: nearestDistance } : null
  }

  const storeItinerary = useTripStore((state) => state.itinerary)

  const storeItems = useMemo(() => {
    const flat: CurateItem[] = []
    storeItinerary.forEach((dayObj) => {
      const dayNumber = Number(dayObj.day || 1)
      const dayItems = dayObj.items || []
      dayItems.forEach((item: any, idx) => {
        flat.push({
          id: item.id || `draft-${dayNumber}-${idx}-${item.time}`,
          time: item.time,
          title: item.title,
          category: item.category || 'Suggested',
          duration: item.duration || `${item.durationMinutes || 60} min`,
          durationMinutes: item.durationMinutes || 60,
          description: item.description || 'Draft stop.',
          dayNumber,
          lat: item.lat,
          lng: item.lng,
          location: item.location || item.title || 'Planned stop',
        })
      })
    })
    return flat
  }, [storeItinerary])

  const sourceItems = useMemo(() => {
    const itemsToUse = storeItems.length ? storeItems : (state.items || persistedDraft?.items || [])
    return toTimelineEntries(itemsToUse, city)
  }, [city, persistedDraft?.items, state.items, storeItems])

  const tripDays = Math.max(1, Number(state.tripDays || state.preferences?.tripDays || persistedDraft?.tripDays || 1))
  const travelWindow = state.travelWindow || persistedDraft?.travelWindow || { from: '08:00', to: '20:00' }
  const preferences = state.preferences || persistedDraft?.preferences || {}
  const timelineCacheKey = useMemo(() => createTimelineCacheKey(city, travelWindow, sourceItems), [city, sourceItems, travelWindow])

  useEffect(() => {
    setActiveDay(storeActiveDay)
  }, [storeActiveDay])

  const autoSaveTimelineTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (loading || !timeline.length) return

    if (autoSaveTimelineTimerRef.current) {
      window.clearTimeout(autoSaveTimelineTimerRef.current)
    }

    autoSaveTimelineTimerRef.current = window.setTimeout(() => {
      writeTimelineSavedDraft(timelineCacheKey, timeline)
      console.log('[Timeline] Auto-saved timeline changes.')
    }, 1000)

    return () => {
      if (autoSaveTimelineTimerRef.current) {
        window.clearTimeout(autoSaveTimelineTimerRef.current)
      }
    }
  }, [timeline, timelineCacheKey, loading])

  useEffect(() => {
    const visibleEntities = timeline
      .filter((item) => Number(item.dayNumber || 1) === activeDay)
      .map((item) => ({
        type: 'activity',
        id: item.id || `timeline-${item.title}-${item.time || 'planned'}`,
        summary: `${item.title} at ${item.time || 'planned time'}`
      }))

    setPageContext({
      pageId: 'timeline',
      pageSummary: `Itinerary Timeline for ${city} - Day ${activeDay} (${visibleEntities.length} items)`,
      visibleEntities,
      availableActions: ['navigate', 'optimize_route', 'set_start_location', 'show_day'],
      userFacingState: {
        city,
        activeDay,
        tripDays,
        startLocation: routeStartLocation ? {
          label: routeStartLocation.label,
          lat: routeStartLocation.lat,
          lng: routeStartLocation.lng
        } : null,
        timelineEntries: timeline.map(t => ({
          id: t.id,
          title: t.title,
          time: t.time,
          location: t.location,
          dayNumber: t.dayNumber,
          lat: t.lat,
          lng: t.lng,
          category: t.category,
          bestTimeLabel: t.bestTimeLabel,
          weatherLabel: t.weatherLabel
        }))
      },
      lastUpdated: Date.now()
    })

    return () => {
      setPageContext(null)
    }
  }, [city, activeDay, timeline, tripDays, routeStartLocation, setPageContext])

  useEffect(() => {
    globalActionRegistry.register('set_start_location', (params) => {
      console.log('[ORA Action] set_start_location:', params)
      if (params.lat != null && params.lng != null) {
        const payload = {
          lat: Number(params.lat),
          lng: Number(params.lng),
          label: params.label || params.location || 'Start Location'
        }
        setRouteStartLocation(payload)
        setStartLocationQuery(payload.label)
        setShowStartLocationPrompt(false)
        
        // Save to localStorage
        const storageKey = `triparc:timeline:start-location:${timelineCacheKey}`
        localStorage.setItem(storageKey, JSON.stringify(payload))
      }
    })

    globalActionRegistry.register('optimize_route', () => {
      console.log('[ORA Action] optimize_route triggered')
      
      setTimeline((prevTimeline) => {
        // Filter items for the active day
        const dayItems = prevTimeline.filter(
          (item) => Number(item.dayNumber || 1) === activeDay && item.kind === 'place' && !item.skipped
        )
        if (!dayItems.length) return prevTimeline

        // Sort items using buildNearestNeighborRoute based on routeStartLocation
        const sortedRouteItems = [...dayItems].sort((a, b) => {
          const aTime = parseTime(a.time || a.timeSlot || a.timeRangeLabel)
          const bTime = parseTime(b.time || b.timeSlot || b.timeRangeLabel)
          if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime
          return 0
        })

        const optimizedRouteItems = buildNearestNeighborRoute(sortedRouteItems, routeStartLocation)

        // Parse starting window time
        const startWindowFrom = travelWindow?.from || '08:00'
        let currentMinutes = (() => {
          const parts = startWindowFrom.split(':')
          const hh = Number(parts[0] || 8)
          const mm = Number(parts[1] || 0)
          return hh * 60 + mm
        })()

        // Create map of optimized IDs to their new slots
        const optMap = new Map<string, { time: string; timeSlot: string; order: number }>()
        optimizedRouteItems.forEach((item, index) => {
          const duration = item.durationMinutes || 60
          const startTimeStr = formatMinutesAs12Hour(currentMinutes)
          const endTimeStr = formatMinutesAs12Hour(currentMinutes + duration)
          optMap.set(item.id, {
            time: startTimeStr,
            timeSlot: `${startTimeStr} - ${endTimeStr}`,
            order: index
          })
          currentMinutes += duration + 15 // 15-minute transit buffer
        })

        // Reconstruct the timeline list with updated order/times for active day items
        const nextTimeline = prevTimeline.map((item) => {
          if (Number(item.dayNumber || 1) !== activeDay || item.kind !== 'place' || item.skipped) {
            return item
          }
          const opt = optMap.get(item.id)
          if (!opt) return item
          return {
            ...item,
            time: opt.time,
            timeSlot: opt.timeSlot,
            order: opt.order
          }
        })

        const sortedResult = sortTimelineEntriesByTime(nextTimeline)
        // Persist to localStorage saved draft
        setTimeout(() => {
          writeTimelineSavedDraft(timelineCacheKey, sortedResult)
          setDraftSaveMessage('Timeline rearranged according to the shortest distance from your start location.')
        }, 50)

        return sortedResult
      })
    })

    return () => {
      globalActionRegistry.unregister('set_start_location')
      globalActionRegistry.unregister('optimize_route')
    }
  }, [activeDay, routeStartLocation, travelWindow, timelineCacheKey])

  useEffect(() => {
    const storageKey = `triparc:timeline:start-location:${timelineCacheKey}`
    const readStoredStartLocation = () => {
      if (typeof window === 'undefined') return null
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw) as { lat?: number; lng?: number; label?: string }
        if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null
        return { lat: parsed.lat, lng: parsed.lng, label: parsed.label }
      } catch {
        return null
      }
    }

    const stored = state.startLocation || readStoredStartLocation()
    if (stored) {
      setRouteStartLocation(stored)
      setStartLocationQuery(stored.label || '')
      setShowStartLocationPrompt(false)
    } else {
      setRouteStartLocation(null)
      setStartLocationQuery('')
      setShowStartLocationPrompt(true)
    }
    setStartLocationReady(true)
  }, [state.startLocation, timelineCacheKey])

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
  const visibleItems = useMemo(() => {
    const dayItems = grouped.find(([day]) => day === activeDay)?.[1] || []
    return showMealCards ? dayItems : dayItems.filter((entry) => entry.kind !== 'meal')
  }, [activeDay, grouped, showMealCards])
  const weatherData = generated?.weatherData

  useEffect(() => {
    writeShowMealCards(showMealCards)
  }, [showMealCards])

  useEffect(() => {
    if (activeDay > grouped.length) setActiveDay(1)
  }, [activeDay, grouped.length])

  // Route protection: disable timeline page until plan is ready
  useEffect(() => {
    const checkPlanReady = () => {
      try {
        const raw = localStorage.getItem('triparc:journey:draft:v1')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.items && parsed.items.length > 0) return true
        }
      } catch {}
      return false
    }
    if (!checkPlanReady()) {
      alert("The timeline is locked. Please manually select/add items to fill your draft itinerary on the Curate page first!")
      navigate('/curate')
    }
  }, [navigate])

  useEffect(() => {
    if (state.startLocation?.label) {
      setStartLocationQuery(state.startLocation.label)
    }
  }, [state.startLocation?.label])

  useEffect(() => {
    const trimmed = startLocationQuery.trim()
    if (!showStartLocationPrompt || trimmed.length < 2) {
      setStartLocationOptions([])
      setStartLocationError('')
      setStartLocationLoading(false)
      return () => undefined
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setStartLocationLoading(true)
      void searchDestinationPlaces(trimmed, city, 8)
        .then((results) => {
          if (cancelled) return
          setStartLocationOptions(results)
          setStartLocationError(results.length ? '' : 'No matching hotel or locality found.')
        })
        .catch((error) => {
          if (cancelled) return
          console.error('Failed to search start location:', error)
          setStartLocationOptions([])
          setStartLocationError('Could not load suggestions. Please try again.')
        })
        .finally(() => {
          if (!cancelled) setStartLocationLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [city, showStartLocationPrompt, startLocationQuery])

  const applyStartLocation = (option: PlaceOption) => {
    if (option.lat == null || option.lng == null) {
      setStartLocationError('That suggestion does not include coordinates. Please pick another one.')
      return
    }
    const nextStartLocation = {
      lat: option.lat,
      lng: option.lng,
      label: option.vicinity ? `${option.name} • ${option.vicinity}` : option.name,
    }
    setRouteStartLocation(nextStartLocation)
    setShowStartLocationPrompt(false)
    setStartLocationQuery(nextStartLocation.label || option.name)
    try {
      window.localStorage.setItem(`triparc:timeline:start-location:${timelineCacheKey}`, JSON.stringify(nextStartLocation))
    } catch {}
    setStartLocationOptions([])
    setStartLocationError('')
  }

  // Compute route for visible items on the active day
  useEffect(() => {
    if (!startLocationReady) return
    const computeRoute = async () => {
      if (!visibleItems.length) {
        setMapMarkers([])
        setRoutePoints([])
        setTotalDistanceKm(null)
        setNearestStopId(null)
        setNearestStopLabel('')
        writeRouteSavings(null)
        return
      }

      if (!routeStartLocation) {
        setMapMarkers([])
        setRoutePoints([])
        setTotalDistanceKm(null)
        setNearestStopId(null)
        setNearestStopLabel('')
        writeRouteSavings(null)
        return
      }

      const sortedRouteItems = [...visibleItems].sort((a, b) => {
        const aTime = parseTime(a.time || a.timeSlot || a.timeRangeLabel)
        const bTime = parseTime(b.time || b.timeSlot || b.timeRangeLabel)
        if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime
        return 0
      })

      const nearest = findNearestVisibleItem(sortedRouteItems, routeStartLocation)
      const optimizedRouteItems = buildNearestNeighborRoute(sortedRouteItems, routeStartLocation)
      const baselineRouteItems = sortedRouteItems.filter((item) => item.lat != null && item.lng != null)

      if (nearest) {
        setNearestStopId(nearest.item.id)
        setNearestStopLabel(`${nearest.item.title} • nearest stop to save fuel (${nearest.distanceKm.toFixed(1)} km away)`)
      } else {
        setNearestStopId(null)
        setNearestStopLabel('')
      }

      const optimizedMarkers = optimizedRouteItems.map((item) => ({
        lat: item.lat!,
        lng: item.lng!,
        title: item.title,
      }))
      setMapMarkers(optimizedMarkers)

      if (optimizedMarkers.length < 1) {
        setRoutePoints([])
        setTotalDistanceKm(null)
        writeRouteSavings(null)
        return
      }

      try {
        const [baselineRoute, optimizedRoute] = await Promise.all([
          fetchOsrmRoute(routeStartLocation, baselineRouteItems),
          fetchOsrmRoute(routeStartLocation, optimizedRouteItems),
        ])

        const chosenRoute = optimizedRoute || baselineRoute
        if (chosenRoute) {
          setRoutePoints(chosenRoute.geometry)
          setTotalDistanceKm(chosenRoute.distanceKm)
        } else {
          setRoutePoints([])
          setTotalDistanceKm(null)
        }

        const baselineDistanceKm = baselineRoute?.distanceKm ?? optimizedRoute?.distanceKm ?? 0
        const optimizedDistanceKm = optimizedRoute?.distanceKm ?? baselineRoute?.distanceKm ?? 0
        const distanceSavedKm = Math.max(0, baselineDistanceKm - optimizedDistanceKm)
        const perKmCost = Number((preferences as any).taxiPerKm || 30)
        const costSaved = Math.max(0, Math.round(distanceSavedKm * perKmCost))
        writeRouteSavings({
          optimizedDistanceKm,
          baselineDistanceKm,
          distanceSavedKm,
          costSaved,
          nearestStopId: nearest?.item.id || null,
          nearestStopTitle: nearest?.item.title,
        })
      } catch (err) {
        console.error('Failed to fetch route:', err)
        setRoutePoints([])
        setTotalDistanceKm(null)
        writeRouteSavings(null)
      }
    }

    void computeRoute()
  }, [routeStartLocation, startLocationReady, visibleItems])

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
      setTimeline(sortTimelineEntriesByTime(cachedTimeline.timeline || buildImmediateTimeline(sourceItems)))
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
      setTimeline(sortTimelineEntriesByTime(response.timeline || []))
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

  const saveTimelineAsDraft = () => {
    const selectedItems = sortTimelineEntriesByTime(
      timeline.filter((entry) => entry.kind !== 'insight' && !entry.skipped)
    )

    if (!selectedItems.length) {
      setDraftSaveMessage('Nothing to save yet. Add or generate timeline items first.')
      return
    }

    const draftItems: CurateItem[] = selectedItems.map((entry, index) => ({
      id: entry.id,
      title: entry.placeName || entry.title,
      name: entry.placeName || entry.title,
      category: entry.category || (entry.kind === 'meal' ? 'Food' : 'Planned'),
      type: entry.kind === 'meal' ? (entry.mealType || 'meal') : entry.category,
      location: entry.location,
      time: entry.time || entry.timeSlot || entry.timeRangeLabel,
      durationMinutes: entry.durationMinutes,
      duration: entry.durationMinutes ? `${entry.durationMinutes} min` : undefined,
      description: entry.description,
      note: entry.note,
      lat: entry.lat,
      lng: entry.lng,
      dayNumber: entry.dayNumber || 1,
      status: entry.skipped ? 'skipped' : 'upcoming',
      photoUrl: entry.photoUrl,
      placeId: entry.placeId,
      photoReference: entry.photoReference || extractPhotoReferenceFromUrl(entry.photoUrl),
      priceLevel: Number.isFinite(Number(entry.rating)) ? Math.max(1, Math.min(4, Math.round(Number(entry.rating) - 1))) : undefined,
    }))

    writeJourneyDraft({
      ...(persistedDraft || {}),
      city,
      items: draftItems,
      travelWindow,
      preferences,
      tripDays,
      plan: state.plan || persistedDraft?.plan,
      chosen: state.chosen || persistedDraft?.chosen,
    })
    writeTimelineSavedDraft(timelineCacheKey, selectedItems)

    setDraftSaveMessage(`Draft saved with ${draftItems.length} selected items. This version will stay until a new curate draft is generated.`)
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
              photoReference: option.photoReference || extractPhotoReferenceFromUrl((option as any).photoUrl),
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
    const routeDistanceKm = totalDistanceKm != null ? Math.round(totalDistanceKm * 10) / 10 : null
    // compute pairwise straight-line distances between consecutive items as fallback
    const pairwiseDistanceKm = visibleItems.reduce((sum, cur, idx, arr) => {
      if (idx === 0) return 0
      const prev = arr[idx - 1]
      const aLat = Number(prev?.lat ?? (prev as any)?.details?.lat)
      const aLng = Number(prev?.lng ?? (prev as any)?.details?.lng)
      const bLat = Number(cur?.lat ?? (cur as any)?.details?.lat)
      const bLng = Number(cur?.lng ?? (cur as any)?.details?.lng)
      if (!aLat || !aLng || !bLat || !bLng) return sum
      return sum + haversineKm(aLat, aLng, bLat, bLng)
    }, 0)
    const fallbackDistanceKm = Number((visibleItems.length * 1.7 + totalMinutes / 160).toFixed(1))
    const totalDistance = routeDistanceKm ?? (pairwiseDistanceKm > 0 ? Math.round(pairwiseDistanceKm * 10) / 10 : fallbackDistanceKm)
    const distanceKm = totalDistance
    const travelDistanceForCost = routeDistanceKm ?? (pairwiseDistanceKm > 0 ? pairwiseDistanceKm : distanceKm)
    const budget = Number(preferences.budgetAmount || state.plan?.budgetAmount || Math.max(2500, visibleItems.length * 900))
    // Use per-food estimates when available; fallback to 40% of budget
    const estimatedFoodSum = visibleItems.reduce((sum, item) => {
      if (!item) return sum
      const key = (item.title || '').trim()
      const val = key && typeof foodEstimates[key] === 'number' ? foodEstimates[key] : 0
      return sum + val
    }, 0)
    const estimatedEntrySum = visibleItems.reduce((sum, item) => {
      if (!item) return sum
      const key = (item.title || '').trim()
      const val = key && typeof entryEstimates[key] === 'number' ? entryEstimates[key] : 0
      return sum + val
    }, 0)
    const food = estimatedFoodSum > 0 ? Math.round(estimatedFoodSum) : Math.round(budget * 0.4)
    const entry = estimatedEntrySum > 0 ? Math.round(estimatedEntrySum) : Math.round(budget * 0.35)
    // approximate taxi cost: base fare + per-km rate (INR)
    const perKm = Number((preferences as any).taxiPerKm || 30)
    const baseFare = Number((preferences as any).taxiBaseFare || 50)
    const taxiCost = Math.max(0, Math.round(baseFare + perKm * travelDistanceForCost))
    const travel = taxiCost
    const walkingLoad = Math.min(95, Math.max(20, Math.round(distanceKm * 10)))
    const activityDensity = Math.min(95, Math.max(25, Math.round((visibleItems.length / 6) * 100)))
    return { totalMinutes, distanceKm, totalDistanceKm: totalDistance, budget, food, entry, travel, walkingLoad, activityDensity }
  }, [preferences.budgetAmount, state.plan?.budgetAmount, visibleItems, foodEstimates, entryEstimates])

  // Estimate food costs for visible food items using place details (rating/reviews).
  useEffect(() => {
    let cancelled = false
    const toEstimate = visibleItems
      .filter((it) => /restaurant|cafe|food|dining|meal|eatery/i.test(`${it.category || ''}`) || /breakfast|lunch|dinner|snacks/i.test(String(it.title || '')))
      .map((it) => (it.title || '').trim())
      .filter(Boolean)
    if (!toEstimate.length) return

    const run = async () => {
      const next: Record<string, number> = { ...foodEstimates }
      for (const name of toEstimate) {
        if (cancelled) return
        if (typeof next[name] === 'number') continue
        try {
          const { details } = await getPlaceDetails(name, city)
          // Heuristic: base price (INR) by category/typical meal
          let base = 300 // default avg meal per person
          const cat = (details.category || '').toLowerCase()
          if (cat.includes('fine') || cat.includes('fine dining') || cat.includes('luxury')) base = 1200
          else if (cat.includes('restaurant') || cat.includes('bistro') || cat.includes('dining')) base = 600
          else if (cat.includes('cafe') || cat.includes('tea') || cat.includes('coffee')) base = 250

          // Adjust by rating
          const rating = Number((details as any).rating || 0)
          let multiplier = 1
          if (rating >= 4.5) multiplier = 1.9
          else if (rating >= 4.0) multiplier = 1.35
          else if (rating >= 3.5) multiplier = 1.05
          else multiplier = 0.85

          // Reviews boost for very popular places
          const reviews = Number((details as any).reviews || 0)
          if (reviews > 500) multiplier *= 1.12

          // Scale by user's budget amount (higher budgets -> higher typical spend)
          const userBudget = Number(preferences.budgetAmount || state.plan?.budgetAmount || 37500)
          const budgetScale = Math.max(0.7, Math.min(1.6, userBudget / 37500))

          const estimate = Math.max(50, Math.round(base * multiplier * budgetScale))
          next[name] = estimate
        } catch (err) {
          // fallback heuristic for when details aren't available
          next[name] = 450
        }
      }
      if (!cancelled) setFoodEstimates((prev) => ({ ...prev, ...next }))
    }

    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems, city])

  // Estimate entry fees for heritage/museum places.
  useEffect(() => {
    let cancelled = false
    const toEstimate = visibleItems
      .filter((it) => /(museum|heritage|palace|fort|gallery|historic)/i.test(`${it.category || ''} ${it.title || ''}`))
      .map((it) => (it.title || '').trim())
      .filter(Boolean)
    if (!toEstimate.length) return

    const run = async () => {
      const next: Record<string, number> = { ...entryEstimates }
      for (const name of toEstimate) {
        if (cancelled) return
        if (typeof next[name] === 'number') continue
        try {
          const { details } = await getPlaceDetails(name, city)
          let base = 200
          const cat = (details.category || '').toLowerCase()
          if (cat.includes('palace') || cat.includes('fort') || cat.includes('heritage')) base = 400
          else if (cat.includes('museum')) base = 300
          else if (cat.includes('gallery')) base = 200

          const rating = Number((details as any).rating || 0)
          let multiplier = 1
          if (rating >= 4.5) multiplier = 1.25
          else if (rating >= 4.0) multiplier = 1.15
          else if (rating >= 3.5) multiplier = 1.05
          else multiplier = 0.9

          const reviews = Number((details as any).reviews || 0)
          if (reviews > 500) multiplier *= 1.08

          const estimate = Math.max(0, Math.round(base * multiplier))
          next[name] = estimate
        } catch (err) {
          next[name] = 0
        }
      }
      if (!cancelled) setEntryEstimates((prev) => ({ ...prev, ...next }))
    }

    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems, city])

  const restaurantPreview = useMemo(() => {
    const entries = Object.entries(mealOptions) as Array<[MealType, Array<{ name: string }>]>
    return entries.reduce<Array<{ meal: MealType; name: string }>>((acc, [meal, options]) => {
      options.slice(0, 2).forEach((option) => acc.push({ meal, name: option.name }))
      return acc
    }, [])
  }, [mealOptions])

  const heritagePreview = useMemo(() => {
    return visibleItems
      .filter((it) => /(museum|heritage|palace|fort|gallery|historic)/i.test(`${it.category || ''} ${it.title || ''}`))
      .slice(0, 6)
      .map((it) => ({ name: (it.title || '').trim() }))
  }, [visibleItems])

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
    const savedDraft = readTimelineSavedDraft(timelineCacheKey)
    if (savedDraft?.length) {
      setTimeline(sortTimelineEntriesByTime(savedDraft))
      setGenerated(null)
      setActiveDay(1)
      setDraftSaveMessage('Loaded your saved timeline draft for this itinerary.')
      return
    }

    // Show all curated places instantly while the enriched timeline hydrates.
    setTimeline(buildImmediateTimeline(sourceItems))
    setActiveDay(1)
    setDraftSaveMessage('')
    void generateTimeline()
    // Auto-generate once for the current route state.
  }, [city, timelineCacheKey, travelWindow.from, travelWindow.to, sourceItems, state.plan, state.restaurantOptions])

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

      {showStartLocationPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#17171c] p-6 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.75)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#b4c5ff]">Start location</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white">Type your hotel or locality</h2>
                <p className="mt-2 text-sm text-[#c3c6d7]">Pick the place you want the route to start from. We’ll build the timeline route from here instead of using your current location.</p>
              </div>
            </div>

            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#c3c6d7]">search</span>
              <input
                value={startLocationQuery}
                onChange={(event) => {
                  setStartLocationQuery(event.target.value)
                  setStartLocationError('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    const first = startLocationOptions[0]
                    if (first) applyStartLocation(first)
                  }
                }}
                placeholder="Search hotel, locality, landmark..."
                className="w-full rounded-2xl border border-white/10 bg-[#101114] py-4 pl-12 pr-4 text-white outline-none transition focus:border-[#b4c5ff]/40 focus:ring-2 focus:ring-[#b4c5ff]/20"
                type="text"
              />
            </div>

            {startLocationLoading && <p className="mt-3 text-xs text-[#c3c6d7]">Searching suggestions...</p>}
            {startLocationError && <p className="mt-3 text-xs text-amber-200">{startLocationError}</p>}

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1 scrollbar-hide">
              {startLocationOptions.map((option) => (
                <button
                  key={option.placeId || `${option.name}-${option.vicinity || ''}`}
                  type="button"
                  onClick={() => applyStartLocation(option)}
                  className="flex w-full items-start justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-[#b4c5ff]/30 hover:bg-white/10"
                >
                  <span className="block">
                    <span className="block text-sm font-semibold text-white">{option.name}</span>
                    <span className="mt-1 block text-xs text-[#c3c6d7]">{option.vicinity || 'Nearby locality'}</span>
                  </span>
                  <span className="rounded-full bg-[#b4c5ff]/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#b4c5ff]">Use</span>
                </button>
              ))}
              {!startLocationLoading && startLocationQuery.trim().length >= 2 && startLocationOptions.length === 0 && !startLocationError && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-xs text-[#c3c6d7]">
                  Suggestions will appear here as you type.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
              <div className="mt-3 rounded-2xl bg-white/5 px-4 py-3 text-xs text-[#c3c6d7]">
                <div className="flex items-center justify-between gap-2">
                  <span>Route start</span>
                  <button
                    type="button"
                    onClick={() => setShowStartLocationPrompt(true)}
                    className="text-[10px] font-bold uppercase tracking-widest text-[#b4c5ff] transition hover:text-white"
                  >
                    Change
                  </button>
                </div>
                <p className="mt-2 font-bold text-white">
                  {routeStartLocation?.label || 'Choose a hotel or locality'}
                </p>
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
              {draftSaveMessage && <p className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{draftSaveMessage}</p>}
              {nearestStopLabel && (
                <div className="mb-4 rounded-2xl border border-[#2563eb]/20 bg-[#2563eb]/10 px-4 py-3 text-sm text-[#b4c5ff]">
                  {nearestStopLabel}
                </div>
              )}
              <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-2 scrollbar-hide">
                {visibleItems.map((entry) => (
                  <div key={entry.id} className="animate-[fadeUp_.35s_ease]">
                    <TimelineCard
                      entry={entry}
                      active={entry.id === nearestStopId || entry.order === 0}
                      routeHint={entry.id === nearestStopId ? `Nearest from ${routeStartLocation?.label || 'your chosen start'} · start here to save fuel` : undefined}
                      onDragStart={(id) => setDraggedId(id)}
                      onDragOver={(_, event) => event.preventDefault()}
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveTimelineAsDraft}
                    disabled={loading || timeline.length === 0}
                    className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={generateTimeline}
                    disabled={loading}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">Total Time</p>
                  <p className="mt-1 text-2xl font-black text-white">{Math.round((daySummary.totalMinutes / 60) * 10) / 10} <span className="text-sm font-medium uppercase text-[#c3c6d7]">hrs</span></p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">Distance</p>
                  <p className="mt-1 text-2xl font-black text-white">{daySummary.totalDistanceKm} <span className="text-sm font-medium uppercase text-[#c3c6d7]">km</span></p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">Budget</p>
                  {(() => {
                    const calcBudget = Number(daySummary.food || 0) + Number(daySummary.entry || 0) + Number(daySummary.travel || 0)
                    return (
                      <>
                        <p className="mt-1 text-2xl font-black text-white">₹{calcBudget}</p>
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-6 lg:col-span-3">
            <div className="rounded-3xl border border-white/10 bg-[#1b1b1f] p-4 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c3c6d7]">Start location</p>
                  <p className="mt-1 text-sm font-semibold text-white">{routeStartLocation?.label || 'Choose a hotel or locality'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStartLocationQuery(routeStartLocation?.label || '')
                    setShowStartLocationPrompt(true)
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b4c5ff] transition hover:border-[#b4c5ff]/40 hover:bg-[#b4c5ff]/10"
                >
                  Edit
                </button>
              </div>
            </div>

            <div className="group relative h-72 overflow-hidden rounded-3xl border border-white/10 bg-[#05070a] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.35)] cursor-pointer transition-all hover:border-white/20 hover:shadow-[0_24px_120px_rgba(6,182,212,0.15)]" onClick={openFullPageMap}>
              {/* Map Background */}
              <div className="absolute inset-0 z-0">
                <LeafletMap markers={mapMarkers} route={routePoints} startMarker={routeStartLocation ? { lat: routeStartLocation.lat, lng: routeStartLocation.lng, title: routeStartLocation.label || 'Start location' } : undefined} />
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
                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-black/60 transition-colors" onClick={(e) => { e.stopPropagation(); setStartLocationQuery(routeStartLocation?.label || ''); setShowStartLocationPrompt(true); }}>
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
              <h3 className="mb-6 text-xs font-bold uppercase tracking-wider text-white">Budget Breakdown</h3>
              <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#1f1f23] p-3">
                    <span className="text-[10px] font-bold uppercase text-[#c3c6d7]">Food</span>
                    <span className="text-sm font-bold text-white">₹{daySummary.food}</span>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#1f1f23] p-3">
                    <span className="text-[10px] font-bold uppercase text-[#c3c6d7]">Entry</span>
                    <span className="text-sm font-bold text-white">₹{daySummary.entry}</span>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-2xl bg-[#1f1f23] p-3">
                    <span className="text-[10px] font-bold uppercase text-[#c3c6d7]">Travel</span>
                    <span className="text-sm font-bold text-white">₹{daySummary.travel}</span>
                  </div>
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
