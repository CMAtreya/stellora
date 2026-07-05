import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LuCircleArrowOutUpRight } from "react-icons/lu"
import { Loader2 } from 'lucide-react'
import { 
  analyzeDraftItinerary, 
  searchDestinationPlaces, 
  getRecommendations,
  generateJourneyMap,
  saveSevenPillarsProfile
} from '../lib/sevenPillarsApi'
import { supabase } from '../lib/supabaseClient'
import TripArcNav from '../components/TripArcNav'
import { useOraPageContext } from '../types/oraContext'
import { tripStore } from '../store/tripStore'

type TimelineStatus = 'completed' | 'current' | 'upcoming'

type DraftItem = {
  id: string
  time: string
  title: string
  category: string
  type?: string
  location?: string
  lat?: number
  lng?: number
  duration: string
  description: string
  status: TimelineStatus
  durationMinutes?: number
  baseDurationMinutes?: number
  dayNumber?: number
  requiresNextDay?: boolean
  order?: number
  image?: string
  priceLevel?: number
}

type PlaceSuggestion = {
  label: string
  name: string
  vicinity?: string
  lat?: number
  lng?: number
}

type BucketlistCard = {
  title: string
  label: string
  meta: string
  image: string
  reason: string
}

type Recommendation = {
  id: string
  name: string
  address: string
  category: string
  why: string
  estimatedMinutes: number
  bestTime: string
  crowdLevel: string
  image?: string
  rating?: number
  reviews?: number
  lat?: number
  lng?: number
  destination?: string
  archetypeMatch?: string[]
  isNearby?: boolean
  priceLevel?: number
}

type TransportMode = 'Walking' | 'Taxi' | 'Public' | 'Flights'

type DraftTimingItem = {
  id?: string
  place: string
  duration: number
  recommended_time: string
  user_time: string
  status: 'optimal' | 'not optimal'
  suggestion: string
  order?: number
  crowd_window?: { peak: number[]; low: number[] }
}

type OptimizedDraftItem = {
  id?: string
  title: string
  category: string
  time: string
  timeSlot: string
  durationMinutes: number
  duration: string
  description: string
  status: string
  dayNumber: number
  requiresNextDay?: boolean
}

type LocationState = {
  city?: string
  plan?: any
  chosen?: any
  tripDays?: number
  manuallyFilled?: boolean
  items?: Array<{
    id?: string
    timeSlot?: string
    time?: string
    title: string
    location?: string
    category?: string
    durationMinutes?: number
    duration?: string
    note?: string
    description?: string
    status?: string
    dayNumber?: number
  }>
  travelWindow?: { from?: string; to?: string }
  preferences?: {
    interests?: string[]
    archetypes?: string[]
    composition?: string
    dietaryPreferences?: string[]
    allergies?: string[]
    budgetTier?: string
    budgetAmount?: number
    destinations?: string[]
    tripDays?: number
  }
}

function parseDurationMinutes(item: DraftItem): number {
  if (typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0) {
    return Math.max(15, Math.round(item.durationMinutes))
  }
  const text = (item.duration || '').toLowerCase().trim()
  const n = Number((text.match(/\d+/)?.[0] || '0'))
  if (!Number.isFinite(n) || n <= 0) return 60
  if (text.includes('hr')) return Math.max(30, n * 60)
  return Math.max(15, n)
}

function formatMinutesAs12Hour(totalMinutes: number): string {
  const mins = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h24 = Math.floor(mins / 60)
  const mm = String(mins % 60).padStart(2, '0')
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${String(h12).padStart(2, '0')}:${mm} ${suffix}`
}

function parseDisplayTimeToMinutes(value?: string): number {
  const text = String(value || '').trim().toUpperCase()
  if (!text) return 24 * 60
  const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/)
  if (!match) return 24 * 60
  let hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const suffix = match[3]
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 24 * 60
  if (suffix) {
    if (suffix === 'AM' && hours === 12) hours = 0
    if (suffix === 'PM' && hours < 12) hours += 12
  }
  return hours * 60 + minutes
}

function getCompositionScheduleProfile(composition: string) {
  const value = composition.toLowerCase()
  if (value.includes('solo')) return { durationFactor: 0.9, transitionMinutes: 10 }
  if (value.includes('friends')) return { durationFactor: 0.95, transitionMinutes: 12 }
  if (value.includes('senior')) return { durationFactor: 1.2, transitionMinutes: 25 }
  if (value.includes('family')) return { durationFactor: 1.1, transitionMinutes: 20 }
  return { durationFactor: 1, transitionMinutes: 15 }
}

function pickBucketlistImage(name: string, city: string, photoUrl?: string) {
  if (photoUrl && photoUrl.trim()) return photoUrl
  return `/api/static-map?query=${encodeURIComponent(`${name} ${city}`)}&width=600&height=400&zoom=14`
}

function clampIndex(index: number, max: number) {
  return Math.max(0, Math.min(index, max))
}

function parseWindowTimeToMinutes(value?: string): number {
  const v = (value || '').trim()
  if (!v) return 10 * 60
  const parts = v.split(':')
  const hh = Number(parts[0] || 0)
  const mm = Number(parts[1] || 0)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 10 * 60
  return Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm))
}

function parseMinutes(value: string | number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  const text = String(value || '').trim()
  const match = text.match(/\d+/)
  if (!match) return 60
  return Math.max(0, Number(match[0]))
}

function deriveItems(stateItems?: LocationState['items']): DraftItem[] {
  if (!stateItems?.length) return []
  const filtered = stateItems.filter((item) => {
    const title = String(item.title || '').trim().toLowerCase()
    const location = String(item.location || '').trim().toLowerCase()
    const category = String(item.category || '').trim().toLowerCase()
    const isPlaceholder = title && location && title === location
    const isGenericCityStop = (category === 'planned' || category === 'general' || !category) && isPlaceholder
    return !isGenericCityStop
  })
  return filtered.map((item, index) => ({
    id: item.id || `draft-${index}-${Date.now()}`,
    time: item.time || item.timeSlot || `${String(10 + index * 2).padStart(2, '0')}:00 AM`,
    title: item.title,
    category: item.category || 'Suggested',
    duration: item.duration || `${item.durationMinutes || 60} min`,
    baseDurationMinutes: Number(item.durationMinutes || 60),
    description: item.description || item.note || 'Draft stop from previous step.',
    status: (item.status as TimelineStatus) || (index === 0 ? 'completed' : index === 1 ? 'current' : 'upcoming'),
    dayNumber: Number(item.dayNumber || 1),
  }))
}

function getTodayISO(): string {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getNextDayISO(): string {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function computeTripDays(destinations: NonNullable<LocationState['preferences']>['destinations'] extends infer T ? T : string[] | undefined): number {
  const dateValues: number[] = []
  for (const dest of destinations || []) {
    const from = new Date(String(dest || ''))
    const to = new Date(String(dest || ''))
    if (!Number.isNaN(from.getTime())) dateValues.push(from.getTime())
    if (!Number.isNaN(to.getTime())) dateValues.push(to.getTime())
  }
  if (!dateValues.length) return 1
  const min = Math.min(...dateValues)
  const max = Math.max(...dateValues)
  const diffDays = Math.floor((max - min) / (24 * 60 * 60 * 1000)) + 1
  return Math.max(1, diffDays)
}

function createNode(index = 1): { id: string; location: string; travelFrom: string; travelTo: string } {
  const dateValue = index === 1 ? getTodayISO() : getNextDayISO()
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    location: '',
    travelFrom: dateValue,
    travelTo: dateValue,
  }
}

const tierPresetByKey: Record<string, number> = {
  shoestring: 7500,
  budget: 17500,
  comfortable: 37500,
  luxury: 65000,
}

function inferTierByAmount(amount: number): string {
  if (amount <= 10000) return 'shoestring'
  if (amount <= 25000) return 'budget'
  if (amount <= 50000) return 'comfortable'
  return 'luxury'
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

const BUDGET_BACKPACKER = 'budget backpacker'

function sanitizeArchetypesForBudget(selected: string[], amount: number): string[] {
  if (amount <= 50000) return selected
  return selected.filter((item) => item !== BUDGET_BACKPACKER)
}

function parseAllergyTokens(value: string): string[] {
  const seen = new Set<string>()
  const tokens = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return tokens
}

const JOURNEY_DRAFT_STORAGE_KEY = 'triparc:journey:draft:v1'

type JourneyDraftStorage = {
  city: string
  items: DraftItem[]
  travelWindow: { from: string; to: string }
  preferences: LocationState['preferences']
  tripDays: number
  plan?: any
  chosen?: any
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
  window.localStorage.setItem(JOURNEY_DRAFT_STORAGE_KEY, JSON.stringify(payload))
}

function isPlanDraftFilled(draft: any): boolean {
  if (!draft) return false
  const hasDest = Array.isArray(draft.destinations) && 
                  draft.destinations.length > 0 && 
                  draft.destinations.some((d: any) => d && d.location && d.location.trim().length > 0)
  const hasBudgetTier = typeof draft.budgetTier === 'string' && draft.budgetTier.trim().length > 0
  const hasBudgetAmount = typeof draft.budgetAmount === 'number' && draft.budgetAmount > 0
  const hasArchetype = Array.isArray(draft.archetypes) && draft.archetypes.length > 0
  const hasComposition = typeof draft.composition === 'string' && draft.composition.trim().length > 0
  const hasInterests = Array.isArray(draft.interests) && draft.interests.length > 0
  return !!(hasDest && hasBudgetTier && hasBudgetAmount && hasArchetype && hasComposition && hasInterests)
}

function isSynthesisStale(planDraft: any, journeyDraft: any): boolean {
  if (!journeyDraft || !journeyDraft.preferences) return true
  if (!planDraft) return false

  const planDests = Array.isArray(planDraft.destinations) 
    ? planDraft.destinations.map((d: any) => d?.location || '').filter(Boolean).sort()
    : []
  const journeyDests = Array.isArray(journeyDraft.preferences.destinations)
    ? journeyDraft.preferences.destinations.map((d: any) => d || '').filter(Boolean).sort()
    : []
  if (JSON.stringify(planDests) !== JSON.stringify(journeyDests)) return true

  if (planDraft.budgetTier !== journeyDraft.preferences.budgetTier) return true
  if (planDraft.budgetAmount !== journeyDraft.preferences.budgetAmount) return true

  const planArchetypes = Array.isArray(planDraft.archetypes) ? [...planDraft.archetypes].sort() : []
  const journeyArchetypes = Array.isArray(journeyDraft.preferences.archetypes) ? [...journeyDraft.preferences.archetypes].sort() : []
  if (JSON.stringify(planArchetypes) !== JSON.stringify(journeyArchetypes)) return true

  if (planDraft.composition !== journeyDraft.preferences.composition) return true

  const planDiet = Array.isArray(planDraft.dietary?.preferences) ? [...planDraft.dietary.preferences].sort() : []
  const journeyDiet = Array.isArray(journeyDraft.preferences.dietaryPreferences) ? [...journeyDraft.preferences.dietaryPreferences].sort() : []
  if (JSON.stringify(planDiet) !== JSON.stringify(journeyDiet)) return true

  const planAllergies = typeof planDraft.dietary?.allergies === 'string' ? planDraft.dietary.allergies : ''
  const journeyAllergies = Array.isArray(journeyDraft.preferences.allergies) 
    ? journeyDraft.preferences.allergies.join(', ')
    : typeof journeyDraft.preferences.allergies === 'string' 
      ? journeyDraft.preferences.allergies 
      : ''
  if (planAllergies !== journeyAllergies) return true

  const planInterests = Array.isArray(planDraft.interests) ? [...planDraft.interests].sort() : []
  const journeyInterests = Array.isArray(journeyDraft.preferences.interests) ? [...journeyDraft.preferences.interests].sort() : []
  if (JSON.stringify(planInterests) !== JSON.stringify(journeyInterests)) return true

  return false
}

export default function CuratePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setPageContext } = useOraPageContext()
  const state = (location.state as LocationState | null) || {}
  const [persistedDraft, setPersistedDraft] = useState<JourneyDraftStorage | null>(() => readJourneyDraft())
  const city = state.city || readJourneyDraft()?.city || 'Jaipur'
  const [items, setItems] = useState<DraftItem[]>(() => {
    if (state.manuallyFilled) return []
    if (state.items?.length) return deriveItems(state.items)
    return persistedDraft?.items || []
  })
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id ?? null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [bucketlistCards, setBucketlistCards] = useState<BucketlistCard[]>([])
  const [overflowCount, setOverflowCount] = useState(0)
  const [selectedTripDays, setSelectedTripDays] = useState<number>(() => {
    const draft = readJourneyDraft()
    const planRaw = localStorage.getItem('triparc:seven-pillars:draft:v1')
    let planDays = 1
    if (planRaw) {
      try {
        const parsedPlan = JSON.parse(planRaw)
        if (parsedPlan && Array.isArray(parsedPlan.destinations)) {
          planDays = computeTripDays(parsedPlan.destinations)
        }
      } catch {}
    }
    return Math.max(
      1,
      Number(
        state.tripDays ||
        state.preferences?.tripDays ||
        draft?.tripDays ||
        draft?.preferences?.tripDays ||
        planDays ||
        1
      )
    )
  })
  const [activeDayTab, setActiveDayTab] = useState<number>(1)
  const [draftTimingAnalysis, setDraftTimingAnalysis] = useState<DraftTimingItem[]>([])
  const [optimizedDraftItems, setOptimizedDraftItems] = useState<OptimizedDraftItem[]>([])
  const [draftAnalysisLoading, setDraftAnalysisLoading] = useState(false)
  const [activeStep, setActiveStep] = useState<'plan' | 'curate' | 'timeline'>('curate')

  const [autoSynthesizing, setAutoSynthesizing] = useState(false)
  const [synthesisError, setSynthesisError] = useState('')

  const preferences = state.preferences || persistedDraft?.preferences || {}
  const selectedDestinations = useMemo(() => {
    const raw = [
      ...(Array.isArray(preferences.destinations) ? preferences.destinations : []),
      ...(Array.isArray(state.chosen?.anchors) ? state.chosen.anchors : []),
    ]
      .map((item) => String(item || '').trim())
      .filter(Boolean)

    const seen = new Set<string>()
    const unique = raw.filter((item) => {
      const key = item.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return unique.length ? unique : [city]
  }, [city, preferences.destinations, state.chosen?.anchors])

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === JOURNEY_DRAFT_STORAGE_KEY) {
        setPersistedDraft(readJourneyDraft())
      }
    }

    const handleFocus = () => setPersistedDraft(readJourneyDraft())

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Route protection: disable curate page until plan is ready
  useEffect(() => {
    const checkPlanReady = () => {
      try {
        const rawJourney = localStorage.getItem('triparc:journey:draft:v1')
        if (rawJourney) {
          const parsed = JSON.parse(rawJourney)
          if (parsed && parsed.items && parsed.items.length > 0) return true
        }

        // Allow staying if the plan page fields are fully filled, so we can auto-synthesize
        const rawPlan = localStorage.getItem('triparc:seven-pillars:draft:v1')
        if (rawPlan) {
          const parsedPlan = JSON.parse(rawPlan)
          if (isPlanDraftFilled(parsedPlan)) return true
        }
      } catch {}
      return false
    }
    if (!checkPlanReady()) {
      alert("Please complete and fill all fields in your journey plan before curating!")
      navigate('/triparc/7pillars')
    }
  }, [navigate])

  // Effect to check and auto-synthesize if needed
  useEffect(() => {
    const checkAndSynthesize = async () => {
      try {
        const rawPlan = localStorage.getItem('triparc:seven-pillars:draft:v1')
        if (!rawPlan) return
        
        const planDraft = JSON.parse(rawPlan)
        if (!isPlanDraftFilled(planDraft)) return

        const rawJourney = localStorage.getItem('triparc:journey:draft:v1')
        let journeyDraft = null
        if (rawJourney) {
          try { journeyDraft = JSON.parse(rawJourney) } catch {}
        }

        if (isSynthesisStale(planDraft, journeyDraft)) {
          setAutoSynthesizing(true)
          setSynthesisError('')

          // 1. Save profile to DB/server
          await saveSevenPillarsProfile(planDraft)

          // 2. Determine destination city
          const firstDest = planDraft.destinations.find((d: any) => d && d.location && d.location.trim())
          const destinationCity = firstDest ? firstDest.location.split(',')[0]?.trim() : 'Bengaluru'

          // 3. Generate journey map
          const itinerary = await generateJourneyMap({
            city: destinationCity,
            plan: {
              locationPref: {
                crowded: planDraft.budgetTier === 'luxury' ? 'medium' : 'low',
                walkKm: planDraft.composition === 'senior citizens' ? 2 : 5,
              },
              budget: planDraft.budgetTier,
              budgetAmount: planDraft.budgetAmount,
              dayStart: planDraft.dayStart || '08:00',
              dayEnd: planDraft.dayEnd || '21:00',
              travelStyle: planDraft.composition,
              food: planDraft.dietary?.preferences || [],
              interests: planDraft.interests || [],
            },
            chosen: { anchors: planDraft.destinations.map((item: any) => item.location) },
            destinations: planDraft.destinations.map((item: any) => ({
              location: item.location,
              travelFrom: item.travelFrom,
              travelTo: item.travelTo,
            })),
          })

          const curatedItems = itinerary.timeline || []
          const tripDays = computeTripDays(planDraft.destinations)

          const journeyPayload = {
            city: destinationCity,
            items: curatedItems,
            travelWindow: { from: planDraft.dayStart || '08:00', to: planDraft.dayEnd || '21:00' },
            preferences: {
              interests: planDraft.interests || [],
              archetypes: planDraft.archetypes || [],
              composition: planDraft.composition,
              dietaryPreferences: planDraft.dietary?.preferences || [],
              allergies: planDraft.dietary?.allergies ? planDraft.dietary.allergies.split(',').map((s: string) => s.trim()) : [],
              budgetTier: planDraft.budgetTier,
              budgetAmount: planDraft.budgetAmount,
              destinations: planDraft.destinations.map((item: any) => item.location),
              tripDays,
            },
            tripDays,
            plan: {
              locationPref: {
                crowded: planDraft.budgetTier === 'luxury' ? 'medium' : 'low',
                walkKm: planDraft.composition === 'senior citizens' ? 2 : 5
              },
              budget: planDraft.budgetTier,
              budgetAmount: planDraft.budgetAmount,
              dayStart: planDraft.dayStart || '08:00',
              dayEnd: planDraft.dayEnd || '21:00',
              travelStyle: planDraft.composition,
              food: planDraft.dietary?.preferences || [],
              interests: planDraft.interests || [],
            },
            chosen: { anchors: planDraft.destinations.map((item: any) => item.location) },
          }

          localStorage.setItem('triparc:journey:draft:v1', JSON.stringify(journeyPayload))

          setItems(deriveItems(curatedItems))
          setSelectedTripDays(tripDays)
          setPersistedDraft(journeyPayload)
          setAutoSynthesizing(false)
        }
      } catch (err: any) {
        console.error("Auto-synthesis error:", err)
        setSynthesisError(err?.message || "An error occurred while synthesizing your itinerary.")
        setAutoSynthesizing(false)
      }
    }

    checkAndSynthesize()
  }, [])

  const initialTravelWindow = useMemo(
    () => ({
      from: state.travelWindow?.from || persistedDraft?.travelWindow?.from || '10:00',
      to: state.travelWindow?.to || persistedDraft?.travelWindow?.to || '20:00',
    }),
    [persistedDraft?.travelWindow?.from, persistedDraft?.travelWindow?.to, state.travelWindow?.from, state.travelWindow?.to],
  )
  const [travelWindow, setTravelWindow] = useState(initialTravelWindow)

  const getCityForDayNumber = useCallback((dayNum: number): string => {
    const startStr = travelWindow.from || getTodayISO()
    const startDate = new Date(startStr)
    if (Number.isNaN(startDate.getTime())) return city

    const targetDate = new Date(startDate.getTime() + (dayNum - 1) * 24 * 60 * 60 * 1000)
    const planDestinations = state.plan?.destinations || persistedDraft?.plan?.destinations || []
    for (const dest of planDestinations) {
      if (!dest || !dest.location || !dest.travelFrom || !dest.travelTo) continue
      const fromTime = new Date(dest.travelFrom).getTime()
      const toTime = new Date(dest.travelTo).getTime()
      if (!Number.isNaN(fromTime) && !Number.isNaN(toTime)) {
        const dDate = new Date(dest.travelFrom)
        dDate.setHours(0,0,0,0)
        const tDate = new Date(dest.travelTo)
        tDate.setHours(23,59,59,999)
        if (targetDate >= dDate && targetDate <= tDate) {
          return dest.location.trim()
        }
      }
    }
    return city
  }, [city, state.plan, persistedDraft, travelWindow.from])

  const getFirstDayForCity = useCallback((cityName: string): number => {
    const cleanCityName = cityName.trim().toLowerCase()
    for (let dayNum = 1; dayNum <= selectedTripDays; dayNum++) {
      const dayCity = getCityForDayNumber(dayNum).toLowerCase()
      if (dayCity.includes(cleanCityName) || cleanCityName.includes(dayCity)) {
        return dayNum
      }
    }
    return 1
  }, [selectedTripDays, getCityForDayNumber])

  const getCityTotalDays = useCallback((cityName: string): number => {
    const cleanName = cityName.toLowerCase().trim()
    let count = 0
    for (let d = 1; d <= selectedTripDays; d++) {
      if (getCityForDayNumber(d).toLowerCase().trim() === cleanName) {
        count++
      }
    }
    return count
  }, [selectedTripDays, getCityForDayNumber])
  const [draftTravelWindow, setDraftTravelWindow] = useState(initialTravelWindow)
  const [selectedTransportMode, setSelectedTransportMode] = useState<TransportMode>('Walking')
  const [walkingToleranceLevel, setWalkingToleranceLevel] = useState<number>(() => {
    const stored = Number(localStorage.getItem('stellora_walking_tolerance') || 15)
    if (stored <= 8) return 0
    if (stored >= 22) return 2
    return 1
  })
  const composition = String(preferences.composition || state.plan?.travelStyle || persistedDraft?.preferences?.composition || 'couple')
  const [dropLocation, setDropLocation] = useState<string>('')

  useEffect(() => {
    setTravelWindow(initialTravelWindow)
    setDraftTravelWindow(initialTravelWindow)
  }, [initialTravelWindow.from, initialTravelWindow.to])

  useEffect(() => {
    const mappedItems = items.map((item, index) => ({
      ...item,
      order: typeof item.order === 'number' ? item.order : index,
      dayNumber: item.dayNumber || 1,
    }))

    writeJourneyDraft({
      city,
      items: mappedItems,
      travelWindow,
      preferences,
      tripDays: selectedTripDays,
      plan: state.plan || persistedDraft?.plan,
      chosen: state.chosen || persistedDraft?.chosen,
    })

    // Sync back to global tripStore
    tripStore.setState((prev) => {
      const grouped = new Map<number, typeof mappedItems>()
      for (const item of mappedItems) {
        const d = Number(item.dayNumber || 1)
        const list = grouped.get(d) || []
        list.push(item)
        grouped.set(d, list)
      }

      const nextItinerary = [...prev.itinerary]
      const maxDay = Math.max(1, ...Array.from(grouped.keys()), selectedTripDays)
      while (nextItinerary.length < maxDay) {
        const nextDayNum = nextItinerary.length + 1
        nextItinerary.push({
          day: nextDayNum,
          date: getTodayISO(),
          items: []
        })
      }

      for (const [dayNum, dayItems] of grouped.entries()) {
        const storeItems = dayItems.map(item => ({
          time: item.time,
          title: item.title,
          location: item.location || item.title,
          durationMinutes: item.durationMinutes || item.baseDurationMinutes || 60,
          lat: item.lat || 35.0116,
          lng: item.lng || 135.7681,
          description: item.description
        }))
        nextItinerary[dayNum - 1] = {
          ...nextItinerary[dayNum - 1],
          day: dayNum,
          items: storeItems
        }
      }

      for (let idx = 0; idx < nextItinerary.length; idx++) {
        const dayNum = idx + 1
        if (!grouped.has(dayNum)) {
          nextItinerary[idx] = {
            ...nextItinerary[idx],
            items: []
          }
        }
      }

      if (JSON.stringify(prev.itinerary) === JSON.stringify(nextItinerary)) {
        return prev
      }

      return {
        ...prev,
        destination: city,
        itinerary: nextItinerary
      }
    })
  }, [city, items, persistedDraft?.chosen, persistedDraft?.plan, preferences, selectedTripDays, state.chosen, state.plan, travelWindow, travelWindow.from, travelWindow.to])

  useEffect(() => {
    const visibleEntities = items.map((item) => ({
      type: 'activity',
      id: item.id || `curate-${item.title}-${item.time || 'planned'}`,
      summary: `${item.title} (${item.duration})`
    }))

    setPageContext({
      pageId: 'curate',
      pageSummary: `Itinerary Curation for ${selectedDestinations.join(', ') || city} (${items.length} items curated)`,
      visibleEntities,
      availableActions: ['add_activity', 'remove_activity', 'navigate', 'update_itinerary', 'show_day'],
      userFacingState: {
        city,
        destinations: selectedDestinations,
        travelWindow,
        tripDays: selectedTripDays,
        itemsCount: items.length,
        items: items.map(item => ({
          title: item.title,
          time: item.time,
          category: item.category,
          dayNumber: item.dayNumber || 1,
          durationMinutes: item.durationMinutes || item.baseDurationMinutes
        }))
      },
      lastUpdated: Date.now()
    })

    return () => {
      setPageContext(null)
    }
  }, [city, items, travelWindow, selectedTripDays, selectedDestinations, setPageContext])

  useEffect(() => {
    return tripStore.subscribe((state) => {
      const derived: DraftItem[] = []
      state.itinerary.forEach((dayObj) => {
        const dayNumber = Number(dayObj.day || 1)
        const dayItems = dayObj.items || []
        dayItems.forEach((item, idx) => {
          derived.push({
            id: `draft-${dayNumber}-${idx}-${item.time}`,
            time: item.time,
            title: item.title,
            category: 'Suggested',
            duration: `${item.durationMinutes || 60} min`,
            baseDurationMinutes: item.durationMinutes || 60,
            durationMinutes: item.durationMinutes || 60,
            description: item.description || 'Draft stop.',
            status: (idx === 0 ? 'completed' : idx === 1 ? 'current' : 'upcoming') as TimelineStatus,
            dayNumber,
            lat: item.lat,
            lng: item.lng,
            location: item.location
          })
        })
      })

      setItems((prev) => {
        const prevSimplified = prev.map(p => ({ title: p.title, time: p.time, dayNumber: p.dayNumber }))
        const derivedSimplified = derived.map(d => ({ title: d.title, time: d.time, dayNumber: d.dayNumber }))
        if (JSON.stringify(prevSimplified) === JSON.stringify(derivedSimplified)) {
          return prev
        }
        return derived
      })
    })
  }, [])

  const alignItemsToWindow = useCallback(
    (source: DraftItem[]) => {
      if (!source.length) return { items: source, overflow: 0 }

      const start = parseWindowTimeToMinutes(travelWindow.from)
      const endRaw = parseWindowTimeToMinutes(travelWindow.to)
      const end = endRaw > start ? endRaw : start + 12 * 60
      const profile = getCompositionScheduleProfile(composition)

      const grouped = new Map<number, DraftItem[]>()
      for (const item of source) {
        const d = Number(item.dayNumber || 1)
        const list = grouped.get(d) || []
        list.push(item)
        grouped.set(d, list)
      }

      const nextItems: DraftItem[] = []
      let totalOverflow = 0

      const daysToProcess = Array.from(
        new Set([
          1,
          activeDayTab,
          selectedTripDays,
          ...Array.from(grouped.keys())
        ])
      ).sort((a, b) => a - b)

      for (const day of daysToProcess) {
        const dayItems = grouped.get(day) || []
        let cursor = start

        dayItems.forEach((item, index) => {
          const baseDuration = item.baseDurationMinutes || parseDurationMinutes(item)
          const duration = Math.max(15, Math.round(baseDuration * profile.durationFactor))

          const latestStart = Math.max(start, end - duration)
          const startAt = Math.min(cursor, latestStart)
          const fits = startAt + duration <= end

          if (fits) {
            cursor = Math.min(end, startAt + duration + profile.transitionMinutes)
            nextItems.push({
              ...item,
              baseDurationMinutes: baseDuration,
              durationMinutes: duration,
              duration: duration >= 60 ? `${Math.round(duration / 60)} hr` : `${duration} min`,
              time: formatMinutesAs12Hour(startAt),
              dayNumber: day,
              requiresNextDay: false,
              status: (item.status as TimelineStatus) || (index === 0 ? 'completed' : index === 1 ? 'current' : 'upcoming'),
            })
          } else {
            totalOverflow += 1
            nextItems.push({
              ...item,
              baseDurationMinutes: baseDuration,
              durationMinutes: duration,
              duration: duration >= 60 ? `${Math.round(duration / 60)} hr` : `${duration} min`,
              time: 'Outside active day cycle',
              dayNumber: day,
              requiresNextDay: true,
              status: 'upcoming' as TimelineStatus,
            })
          }
        })
      }

      return { items: nextItems, overflow: totalOverflow }
    },
    [composition, travelWindow.from, travelWindow.to, activeDayTab, selectedTripDays],
  )

  useEffect(() => {
    setItems((prev) => {
      const aligned = alignItemsToWindow(prev)
      setOverflowCount(aligned.overflow)
      return aligned.items
    })
  }, [alignItemsToWindow])

  const mapFallbackRecommendations = useCallback(
    (items: PlaceSuggestion[], destinationLabel: string) =>
      items.map((item, index) => ({
        id: `fallback-${destinationLabel}-${index}-${Date.now()}`,
        name: item.name,
        address: item.vicinity || destinationLabel,
        category: 'Attraction',
        why: 'Popular destination match for your selected destination.',
        estimatedMinutes: 90,
        bestTime: 'anytime',
        crowdLevel: 'medium',
        lat: item.lat,
        lng: item.lng,
        destination: destinationLabel,
        archetypeMatch: preferences.archetypes || [],
      })),
    [preferences.archetypes],
  )

  const latestAnchorPlace = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].lat != null && items[i].lng != null) {
        return { name: items[i].title, category: items[i].category, lat: items[i].lat, lng: items[i].lng }
      }
    }
    return undefined
  }, [items])

  const fetchRecommendations = useCallback(async (opts?: { excludeNames?: string[] }) => {
    const activeCity = getCityForDayNumber(activeDayTab)
    if (!activeCity) return
    setLoadingRecommendations(true)
    try {
      const exclude = Array.from(
        new Set([
          ...(opts?.excludeNames || []),
          ...items.map(item => item.title)
        ].map(n => n.trim().toLowerCase()).filter(Boolean))
      )
      const result = await getRecommendations({
        city: activeCity,
        destinations: [activeCity],
        interests: preferences.interests || [],
        archetypes: preferences.archetypes || [],
        excludeNames: exclude,
        budgetTier: preferences.budgetTier || 'comfortable',
        budgetAmount: preferences.budgetAmount || 37500,
        composition: preferences.composition || 'couple',
        dietaryPreferences: preferences.dietaryPreferences || [],
        dayStart: travelWindow.from || '09:00',
        dayEnd: travelWindow.to || '21:00',
        latestAnchorPlace,
      })
      if (result.recommendations?.length) {
        setRecommendations(result.recommendations)
      } else {
        const destinationBuckets = await Promise.all([activeCity].map((destination) => searchDestinationPlaces('top sights', destination, 6)))
        const merged = destinationBuckets.flatMap((bucket, bucketIndex) => mapFallbackRecommendations(bucket, activeCity))
        const deduped: Recommendation[] = []
        const seen = new Set<string>()
        for (const item of merged) {
          const key = `${item.name}`.trim().toLowerCase()
          if (!key || seen.has(key)) continue
          seen.add(key)
          deduped.push(item)
        }
        setRecommendations(deduped.slice(0, 18))
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error)
      try {
        const destinationBuckets = await Promise.all([activeCity].map((destination) => searchDestinationPlaces('top sights', destination, 6)))
        const merged = destinationBuckets.flatMap((bucket, bucketIndex) => mapFallbackRecommendations(bucket, activeCity))
        const deduped: Recommendation[] = []
        const seen = new Set<string>()
        for (const item of merged) {
          const key = `${item.name}`.trim().toLowerCase()
          if (!key || seen.has(key)) continue
          seen.add(key)
          deduped.push(item)
        }
        setRecommendations(deduped.slice(0, 18))
      } catch {
        setRecommendations([])
      }
    } finally {
      setLoadingRecommendations(false)
    }
  }, [city, items, latestAnchorPlace, mapFallbackRecommendations, preferences.archetypes, preferences.budgetAmount, preferences.budgetTier, preferences.composition, preferences.dietaryPreferences, preferences.interests, selectedDestinations, travelWindow.from, travelWindow.to, activeDayTab, getCityForDayNumber])


  useEffect(() => {
    if (state.manuallyFilled && state.items?.length) {
      const mappedFromState = state.items.map((item: any, idx: number) => ({
        id: item.id || `rec-man-${idx}`,
        name: item.title || item.name || 'Suggested stop',
        address: item.location || item.address || city,
        category: item.category || 'Sightseeing',
        why: item.note || item.why || 'Aligned with your synthesized planning preferences.',
        estimatedMinutes: item.durationMinutes || 60,
        bestTime: item.timeSlot || item.time || '10:00 AM',
        crowdLevel: item.crowdLevel || 'low',
        lat: item.lat,
        lng: item.lng,
        destination: city,
        isNearby: false,
      }))
      setRecommendations(mappedFromState)
    } else {
      fetchRecommendations()
    }
  }, [fetchRecommendations, state.manuallyFilled, state.items, city])

  useEffect(() => {
    let cancelled = false

    const loadBucketlistCards = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !sessionData.session) {
          if (!cancelled) setBucketlistCards([])
          return
        }

        const { data: lists, error: listErr } = await supabase
          .from('wishlists')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)

        if (listErr || !lists?.length) {
          if (!cancelled) setBucketlistCards([])
          return
        }

        const wishlistId = lists[0].id as string
        const { data: rows, error: rowsErr } = await supabase
          .from('wishlist_items')
          .select('title, location, metadata')
          .eq('wishlist_id', wishlistId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (rowsErr || !rows?.length) {
          if (!cancelled) setBucketlistCards([])
          return
        }

        const cards: BucketlistCard[] = rows.map((row: any) => {
          const meta = (row?.metadata ?? {}) as Record<string, any>
          const title = String(row?.title || meta.name || 'Untitled Place')
          const category = String(meta.category || 'Bucketlist')
          const cityName = String(meta.city || meta.vicinity || row?.location || city)
          const reason = String(meta.reasoning || 'Saved from your Bucketlist')
          const photoUrl = typeof meta.photoUrl === 'string' ? meta.photoUrl : undefined

          return {
            title,
            label: category,
            meta: `${cityName} • ${category}`,
            image: pickBucketlistImage(title, cityName, photoUrl),
            reason,
          }
        })

        const activeCity = getCityForDayNumber(activeDayTab)
        const filtered = cards.filter(card => {
          const cardCity = card.meta.split(' • ')[0].toLowerCase().trim()
          const target = activeCity.toLowerCase().trim()
          return cardCity.includes(target) || target.includes(cardCity)
        })

        if (!cancelled) setBucketlistCards(filtered)
      } catch {
        if (!cancelled) setBucketlistCards([])
      }
    }

    loadBucketlistCards()
    return () => {
      cancelled = true
    }
  }, [city, selectedDestinations, activeDayTab, getCityForDayNumber])

  useEffect(() => {
    if (!bucketlistCards.length) return

    setItems((prev) => {
      let next = [...prev]
      let addedAny = false

      bucketlistCards.forEach((card) => {
        const cardCity = card.meta.split(' • ')[0].trim()
        const isMatched = selectedDestinations.some(dest => 
          cardCity.toLowerCase().includes(dest.toLowerCase()) ||
          dest.toLowerCase().includes(cardCity.toLowerCase())
        )
        if (!isMatched) return

        const alreadyInDraft = prev.some(item => 
          item.title.toLowerCase().trim() === card.title.toLowerCase().trim()
        )
        if (alreadyInDraft) return

        const targetDay = getFirstDayForCity(cardCity)
        next.push({
          id: `bucket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          time: formatMinutesAs12Hour(parseWindowTimeToMinutes(travelWindow.from || '09:00')),
          title: card.title,
          category: 'Bucketlist',
          lat: undefined,
          lng: undefined,
          image: card.image,
          priceLevel: undefined,
          duration: '60 min',
          durationMinutes: 60,
          baseDurationMinutes: 60,
          description: card.reason || 'Added automatically from your Bucketlist.',
          status: 'upcoming' as TimelineStatus,
          dayNumber: targetDay,
        })
        addedAny = true
      })

      if (addedAny) {
        const aligned = alignItemsToWindow(next)
        setOverflowCount(aligned.overflow)
        return aligned.items
      }
      return prev
    })
  }, [bucketlistCards, selectedDestinations, getFirstDayForCity, travelWindow.from])

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setSearchResults([])
      setSearching(false)
      return undefined
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const searchCities = [getCityForDayNumber(activeDayTab)]
        const searchPromises = searchCities.map((c) => searchDestinationPlaces(text, c, 4))
        const bucketResults = await Promise.all(searchPromises)
        const mergedResults = bucketResults.flatMap((bucket, idx) => {
          const currentCity = searchCities[idx]
          return bucket.map(item => ({
            ...item,
            vicinity: item.vicinity 
              ? `${item.vicinity} (${currentCity.split(',')[0].trim()})` 
              : `In ${currentCity.split(',')[0].trim()}`
          }))
        })
        if (!cancelled) setSearchResults(mergedResults)
      } catch {
        if (!cancelled) setSearchResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [city, query, selectedDestinations, activeDayTab, getCityForDayNumber])

  const totalStops = items.length
  
  const walkingTolerance = useMemo(() => {
    if (walkingToleranceLevel === 0) return 8
    if (walkingToleranceLevel === 2) return 22
    return 15
  }, [walkingToleranceLevel])
  
  // Estimate walking distance: ~1.5km per stop + 1.5km base for city exploration
  const estimatedWalkingDistance = 1.5 + totalStops * 1.5
  
  // Walking load: percentage of tolerance used
  const walkingLoad = clampIndex(Math.round((estimatedWalkingDistance / walkingTolerance) * 100), 100)
  const activityDensity = clampIndex(56 + totalStops * 6, 96)
  const restBalance = clampIndex(82 - totalStops * 9, 92)

  const auroraInsights = useMemo(() => {
    const totalItems = items.length
    const analyzedItems = draftTimingAnalysis.length
    const optimalItems = draftTimingAnalysis.filter((item) => item.status === 'optimal')
    const notOptimalItems = draftTimingAnalysis.filter((item) => item.status !== 'optimal')
    const optimalCount = optimalItems.length
    const coverage = analyzedItems > 0 ? Math.round((analyzedItems / Math.max(totalItems, 1)) * 100) : 0
    const sequenceIsSorted = items.every((item, index, array) => index === 0 || parseDisplayTimeToMinutes(array[index - 1]?.time) <= parseDisplayTimeToMinutes(item.time))

    const bestOptimal = optimalItems[0] || draftTimingAnalysis[0] || null
    const mostUrgent = notOptimalItems[0] || draftTimingAnalysis.find((item) => item.suggestion) || null
    const strongestPattern = draftTimingAnalysis.find((item) => item.crowd_window?.peak?.length && item.crowd_window?.low?.length) || null

    const optimalLabel = bestOptimal
      ? `${bestOptimal.place} already fits the best timing window.`
      : 'No analyzed place is optimal yet. Move one stop into a better timing window.'

    const pressureLabel = mostUrgent
      ? `${mostUrgent.place} needs a timing shift. ${mostUrgent.suggestion}`
      : 'All analyzed places are aligned with their ideal windows.'

    const rhythmLabel = strongestPattern
      ? `${coverage}% of the draft is analyzed in real time. ${sequenceIsSorted ? 'Your stop order is already in time sequence.' : 'The order can still be tightened by time.'}`
      : `${coverage}% of the draft is analyzed in real time. The itinerary is still warming up.`

    return [
      {
        tone: 'optimal',
        icon: 'done_all',
        accent: 'text-primary',
        label: 'Best fit',
        title: bestOptimal?.place || 'Awaiting analysis',
        text: optimalLabel,
      },
      {
        tone: 'warning',
        icon: 'warning',
        accent: 'text-error',
        label: 'Timing pressure',
        title: mostUrgent?.place || 'No timing pressure',
        text: pressureLabel,
      },
      {
        tone: 'signal',
        icon: 'auto_awesome',
        accent: 'text-secondary',
        label: 'Route rhythm',
        title: `${optimalCount}/${Math.max(analyzedItems, totalItems || 1)} optimal`,
        text: rhythmLabel,
      },
    ]
  }, [draftTimingAnalysis, items])

  const activePlan = useMemo(
    () => ({
      locationPref: {
        crowded: 'medium' as const,
        walkKm: walkingTolerance,
      },
      budget: 'balanced',
      budgetAmount: 25000,
      dayStart: travelWindow.from,
      dayEnd: travelWindow.to,
      travelStyle: composition,
      travelMode: selectedTransportMode,
      dropLocation: dropLocation || undefined,
      food: [],
      interests: ['heritage', 'food'],
    }),
    [composition, travelWindow.from, travelWindow.to, walkingTolerance, selectedTransportMode, dropLocation],
  )

  const toggleTransportMode = (mode: TransportMode) => {
    setSelectedTransportMode(mode)
  }

  const formatMeridiem = (value: string) => {
    const [hRaw] = String(value || '00:00').split(':')
    const hour = Number(hRaw)
    return Number.isFinite(hour) && hour >= 12 ? 'PM' : 'AM'
  }

  const applyDayPreferences = () => {
    setTravelWindow(draftTravelWindow)
    const showDrop = selectedTransportMode === 'Walking' || selectedTransportMode === 'Taxi'
    if (showDrop) {
      try {
        localStorage.setItem('stellora_drop_location', String(dropLocation || ''))
      } catch {}
    } else {
      try {
        localStorage.setItem('stellora_walking_tolerance', String(walkingTolerance))
      } catch {}
    }
    setStatusMessage('Day preferences updated and itinerary context refreshed.')
  }

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      const runDraftAnalysis = async () => {
        if (!items.length) {
          if (!cancelled) {
            setDraftTimingAnalysis([])
            setDraftAnalysisLoading(false)
          }
          return
        }
        if (!cancelled) setDraftAnalysisLoading(true)
        try {
          const result = await analyzeDraftItinerary({
            city,
            travelWindow,
            plan: activePlan,
            items,
          })
          if (!cancelled) {
            setDraftTimingAnalysis(result.output || [])
            setOptimizedDraftItems(result.optimizedItems || [])
            
            if (result.optimizedItems && result.optimizedItems.length > 0) {
              const prevSimplified = items.map(p => ({ title: p.title, time: p.time, dayNumber: p.dayNumber }))
              const nextSimplified = result.optimizedItems.map((d: any) => ({ title: d.title, time: d.time, dayNumber: d.dayNumber }))
              if (JSON.stringify(prevSimplified) !== JSON.stringify(nextSimplified)) {
                const nextItems = result.optimizedItems.map((item: any, index: number) => ({
                  id: item.id || `optimized-${index}`,
                  time: item.time,
                  title: item.title,
                  category: item.category || 'Suggested',
                  duration: item.duration || `${item.durationMinutes || 60} min`,
                  baseDurationMinutes: item.durationMinutes || 60,
                  durationMinutes: item.durationMinutes || 60,
                  description: item.description || 'Draft stop.',
                  status: (item.status as TimelineStatus) || 'upcoming',
                  dayNumber: Number(item.dayNumber || 1),
                  requiresNextDay: item.requiresNextDay,
                  lat: item.lat,
                  lng: item.lng,
                  location: item.location
                }))
                setItems(nextItems)
                setOverflowCount(nextItems.filter((entry) => entry.requiresNextDay).length)
              }
            }
          }
        } catch {
          if (!cancelled) setDraftTimingAnalysis([])
          if (!cancelled) setOptimizedDraftItems([])
        } finally {
          if (!cancelled) setDraftAnalysisLoading(false)
        }
      }

      void runDraftAnalysis()
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activePlan, city, items, travelWindow.from, travelWindow.to])

  const addItemFromSuggestion = (title: string, durationMinutes: number = 60, category: string = 'Suggested', lat?: number, lng?: number, image?: string, priceLevel?: number) => {
    setItems((prev) => {
      const next = [
        ...prev,
        {
          id: `new-${Date.now()}`,
          time: formatMinutesAs12Hour(parseWindowTimeToMinutes(travelWindow.from)),
          title,
          category,
          lat,
          lng,
          image,
          priceLevel,
          duration: durationMinutes > 60 ? `${Math.round(durationMinutes / 60)} hr` : `${durationMinutes} min`,
          durationMinutes,
          baseDurationMinutes: durationMinutes,
          description: 'Added from recommended nearby suggestions.',
          status: 'upcoming' as TimelineStatus,
          dayNumber: activeDayTab,
        },
      ]
      const aligned = alignItemsToWindow(next)
      setOverflowCount(aligned.overflow)
      return aligned.items
    })
    setStatusMessage(`Added ${title} to Day ${activeDayTab} of the draft itinerary. (${durationMinutes} minutes)`)
    window.dispatchEvent(
      new CustomEvent('ora-itinerary-added', {
        detail: { addedPlace: title, dayNumber: activeDayTab },
      })
    )
  }

  const addNearestBranchOfRecommendation = async (
    title: string,
    durationMinutes: number = 60,
    category: string = 'Suggested',
    priceLevel?: number,
    image?: string,
    lat?: number,
    lng?: number
  ) => {
    // Directly add the provided place title without searching for alternative branches.
    addItemFromSuggestion(title, durationMinutes, category, lat, lng, image, priceLevel)
  }

  // Helper function to calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Get the anchor location (last placed item's coordinates or user's starting point)
  const getAnchorLocation = () => {
    // Find the last item with coordinates
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].lat != null && items[i].lng != null) {
        return { lat: items[i].lat!, lng: items[i].lng! }
      }
    }
    // If no items, try to get from localStorage or return undefined
    return undefined
  }

  // Find the nearest branch when multiple results exist
  const findNearestResult = (results: PlaceSuggestion[]): PlaceSuggestion | null => {
    if (!results.length) return null
    if (results.length === 1) return results[0]

    const anchorLocation = getAnchorLocation()
    if (!anchorLocation || !anchorLocation.lat || !anchorLocation.lng) {
      // If no anchor, return the first result
      return results[0]
    }

    // Calculate distances and return the nearest
    let nearest = results[0]
    let minDistance = Infinity

    for (const result of results) {
      if (result.lat != null && result.lng != null) {
        const distance = calculateDistance(anchorLocation.lat, anchorLocation.lng, result.lat, result.lng)
        if (distance < minDistance) {
          minDistance = distance
          nearest = result
        }
      }
    }

    return nearest
  }

  const addItemFromSearch = async (placeName: string) => {
    setStatusMessage(`Adding ${placeName}...`)
    try {
      // Directly add the place by name; do not attempt to resolve multiple branches.
      addItemFromSuggestion(placeName, 60, 'Suggested')
      setQuery('')
    } catch (error) {
      // Fallback: add with default duration
      console.error('Could not fetch place details:', error)
      addItemFromSuggestion(placeName, 60, 'Suggested')
      setQuery('')
    }
  }

  const removeItem = (id: string) => {
    setItems((prev) => {
      const aligned = alignItemsToWindow(prev.filter((item) => item.id !== id))
      setOverflowCount(aligned.overflow)
      return aligned.items
    })
    if (expandedId === id) setExpandedId(null)
    setStatusMessage('Stop removed from the draft itinerary.')
  }

  const replaceItem = (id: string) => {
    setItems((prev) => {
      const replaced = prev.map((item) =>
        item.id === id
          ? {
              ...item,
              title: 'AI Replaced Premium Stop',
              category: 'Optimized',
              description: 'Route-optimized replacement with lower crowd pressure.',
            }
          : item,
      )
      const sorted = [...replaced].sort((left, right) => {
        const leftDay = Number(left.dayNumber || 1)
        const rightDay = Number(right.dayNumber || 1)
        if (leftDay !== rightDay) return leftDay - rightDay
        const leftTime = parseDisplayTimeToMinutes(left.time)
        const rightTime = parseDisplayTimeToMinutes(right.time)
        if (leftTime !== rightTime) return leftTime - rightTime
        return (left.title || '').localeCompare(right.title || '')
      })
      const aligned = alignItemsToWindow(sorted)
      setOverflowCount(aligned.overflow)
      return aligned.items
    })
    setStatusMessage('Stop replaced with a route-optimized alternative.')
  }

  const editTime = () => {
    setItems((prev) => {
      const aligned = alignItemsToWindow(prev)
      setOverflowCount(aligned.overflow)
      return aligned.items
    })
    setStatusMessage('Times re-aligned to your selected travel window.')
  }

  const reorder = (fromId: string, toId: string) => {
    const fromIndex = items.findIndex((item) => item.id === fromId)
    const toIndex = items.findIndex((item) => item.id === toId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    const next = [...items]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    const aligned = alignItemsToWindow(next)
    setOverflowCount(aligned.overflow)
    setItems(aligned.items)
    setStatusMessage('Draft itinerary reordered.')
  }

  const pushAllToTimeline = () => {
    if (items.length === 0) {
      alert("Please manually select/add items to fill your draft itinerary first!")
      return
    }
    window.localStorage.setItem('triparc:timeline:unlocked:v1', 'true')
    setActiveStep('timeline')
    setFinalizing(true)
    setStatusMessage('Pushing all curated destinations to your timeline...')
    const orderedItems = [...items].sort((left, right) => {
      const leftDay = Number(left.dayNumber || 1)
      const rightDay = Number(right.dayNumber || 1)
      if (leftDay !== rightDay) return leftDay - rightDay
      return (left.time || '').localeCompare(right.time || '')
    })

    writeJourneyDraft({
      city,
      items: orderedItems.map((item, index) => ({
        ...item,
        order: typeof item.order === 'number' ? item.order : index,
        dayNumber: item.dayNumber || 1,
      })),
      travelWindow,
      preferences,
      tripDays: selectedTripDays,
      plan: activePlan,
      chosen: {
        curated: orderedItems.map((item) => item.title),
      },
    })

    navigate('/timeline', {
      state: {
        city,
        items: orderedItems.map((item, index) => ({
          ...item,
          order: index,
          dayNumber: item.dayNumber || 1,
        })),
        plan: activePlan,
        chosen: {
          curated: orderedItems.map((item) => item.title),
        },
        selectedItineraries: orderedItems.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          durationMinutes: item.durationMinutes || item.baseDurationMinutes || 60,
          dayNumber: item.dayNumber || 1,
          time: item.time,
        })),
        travelWindow,
        preferences: {
          ...preferences,
          tripDays: selectedTripDays,
        },
        tripDays: selectedTripDays,
      },
    })
    setFinalizing(false)
  }

  const goToPlan = () => {
    setActiveStep('plan')
    navigate('/triparc/7pillars')
  }

  const goToCurate = () => {
    setActiveStep('curate')
    navigate('/curate')
  }

  const visibleBucketlist = bucketlistCards.filter((card) => {
    if (!query.trim()) return true
    const search = query.trim().toLowerCase()
    return card.title.toLowerCase().includes(search) || card.label.toLowerCase().includes(search) || card.reason.toLowerCase().includes(search)
  })

  const isBengaluruRecommendation = useCallback((rec: Recommendation) => {
    const keywords = ['bengaluru', 'bangalore']
    const haystack = `${rec.name || ''} ${rec.address || ''} ${rec.destination || ''}`.toLowerCase()
    return keywords.some((keyword) => haystack.includes(keyword))
  }, [])

  const hasCoordinates = useCallback((rec: Recommendation) => rec.lat != null && rec.lng != null, [])

  const nearbyRecommendations = useMemo(
    () => recommendations.filter((rec) => Boolean(rec.isNearby) && hasCoordinates(rec)),
    [hasCoordinates, recommendations],
  )

  const bengaluruExploreRecommendations = useMemo(
    () => recommendations.filter((rec) => !rec.isNearby && hasCoordinates(rec)),
    [hasCoordinates, recommendations],
  )

  const unifiedRecommendationDeck = useMemo(() => {
    const firstTwoNearby = nearbyRecommendations.slice(0, 2)
    const seen = new Set(firstTwoNearby.map((rec) => `${rec.id}`.toLowerCase()))
    const rest = bengaluruExploreRecommendations.filter((rec) => {
      const key = `${rec.id}`.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return [...firstTwoNearby, ...rest].filter(hasCoordinates)
  }, [bengaluruExploreRecommendations, hasCoordinates, nearbyRecommendations])

  const itemsByDay = useMemo(() => {
    const grouped = new Map<number, DraftItem[]>()
    for (const item of items) {
      const day = Number(item.dayNumber || 1)
      const list = grouped.get(day) || []
      list.push(item)
      grouped.set(day, list)
    }
    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, dayItems]) => [
        day,
        [...dayItems].sort((left, right) => {
          const leftTime = parseDisplayTimeToMinutes(left.time)
          const rightTime = parseDisplayTimeToMinutes(right.time)
          return leftTime - rightTime
        }),
      ] as [number, DraftItem[]])
  }, [items])

  const totalDraftDays = Math.max(1, itemsByDay.length)
  const visibleDayCount = Math.max(totalDraftDays, selectedTripDays)
  const visibleItems = useMemo(() => {
    const found = itemsByDay.find(([day]) => day === activeDayTab)
    return found ? found[1] : []
  }, [activeDayTab, itemsByDay])

  const optimizedVisibleItems = useMemo(() => {
    return [...visibleItems].sort((left, right) => {
      const leftTime = parseDisplayTimeToMinutes(left.time)
      const rightTime = parseDisplayTimeToMinutes(right.time)
      if (leftTime !== rightTime) return leftTime - rightTime
      return (left.title || '').localeCompare(right.title || '')
    })
  }, [visibleItems])

  const reorderByLiveTiming = () => {
    if (!draftTimingAnalysis.length && !optimizedDraftItems.length) return
    if (optimizedDraftItems.length) {
      const nextItems = optimizedDraftItems.map((item, index) => ({
        id: item.id || `optimized-${index}`,
        time: item.time,
        title: item.title,
        category: item.category,
        duration: item.duration,
        description: item.description,
        status: (item.status as TimelineStatus) || 'upcoming',
        durationMinutes: item.durationMinutes,
        baseDurationMinutes: item.durationMinutes,
        dayNumber: item.dayNumber,
        requiresNextDay: item.requiresNextDay,
      }))
      setItems(nextItems)
      setOverflowCount(nextItems.filter((entry) => entry.requiresNextDay).length)
    } else {
      const nextItems: DraftItem[] = []
      const usedIds = new Set<string>()

      for (const row of draftTimingAnalysis) {
        const match = items.find((item) => !usedIds.has(item.id) && (item.title || '').trim().toLowerCase() === row.place.trim().toLowerCase())
        if (match) {
          nextItems.push(match)
          usedIds.add(match.id)
        }
      }

      const remainingItems = items.filter((item) => !usedIds.has(item.id))
      nextItems.push(...remainingItems)

      setItems(nextItems)
      setOverflowCount(0)
    }
    setStatusMessage('Draft itinerary reordered using live timing analysis.')
  }

  useEffect(() => {
    if (activeDayTab > visibleDayCount) setActiveDayTab(1)
  }, [activeDayTab, visibleDayCount])

  if (autoSynthesizing) {
    return (
      <div className="min-h-screen bg-[#131317] text-[#e4e1e7] flex flex-col items-center justify-center font-body p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <Loader2 className="animate-spin text-[#2563EB] mx-auto" size={48} />
          <h2 className="text-2xl font-bold tracking-tight text-white">Synthesizing Your Journey Map</h2>
          <p className="text-[#c3c6d7]">
            Aurora engine is processing your preferences to craft a balanced, custom route plan. This may take around 30-45 seconds.
          </p>
        </div>
      </div>
    )
  }

  if (synthesisError) {
    return (
      <div className="min-h-screen bg-[#131317] text-[#e4e1e7] flex flex-col items-center justify-center font-body p-6">
        <div className="max-w-md w-full text-center space-y-6 bg-white/5 border border-white/10 p-8 rounded-2xl">
          <div className="text-red-400 text-5xl">⚠️</div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Synthesis Failed</h2>
          <p className="text-[#ffb4ab]">
            {synthesisError}
          </p>
          <div className="flex gap-4 justify-center mt-6">
            <button
              onClick={() => window.location.reload()}
              className="bg-gradient-to-r from-[#2563EB] to-[#06B6D4] px-6 py-2.5 rounded-xl font-bold text-white transition active:scale-95"
            >
              Retry
            </button>
            <Link
              to="/triparc/7pillars"
              className="border border-white/15 bg-white/5 px-6 py-2.5 rounded-xl font-bold text-white transition hover:bg-white/10"
            >
              Go to Plan Page
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#131317] font-[Manrope] text-[#e4e1e7]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
        body { font-family: 'Manrope', sans-serif; background-color: #131317; color: #e4e1e7; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24; }
        .tonal-shift { transition: background-color 0.3s ease; }
        .glass { backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
        .pref-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 4px;
          background: #353439;
          border-radius: 9999px;
          outline: none;
        }
        .pref-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #2563EB;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 0 10px rgba(37, 99, 235, 0.5);
        }
        details > summary::-webkit-details-marker { display: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes stepUnderline {
          from { transform: scaleX(0); transform-origin: left; opacity: 0.75; }
          to { transform: scaleX(1); transform-origin: left; opacity: 1; }
        }
      `}</style>

      <TripArcNav />

      <main className="mx-auto max-w-[1600px] px-8 pb-28 pt-8">
        <header className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mb-2 text-5xl font-extrabold tracking-tighter text-white">{titleCase(getCityForDayNumber(activeDayTab))} Expedition</h1>
            <p className="max-w-2xl text-[#c3c6d7]">Curate your journey with hand-picked recommendations, search places, and build your perfect draft itinerary.</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-[#f7d982]">
              <span>Travel window {travelWindow.from} - {travelWindow.to} •</span>
              <select
                value={selectedTripDays}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setSelectedTripDays(val)
                  tripStore.setState((prev) => ({
                    ...prev,
                    preferences: {
                      ...prev.preferences,
                      tripDays: val
                    }
                  }))
                }}
                className="rounded-md border border-amber-300/40 bg-[#16192b] px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-[#f7d982] outline-none transition hover:border-amber-300 cursor-pointer"
              >
                {Array.from({ length: 14 }).map((_, i) => (
                  <option key={i + 1} value={i + 1} className="bg-[#16192b] text-white">
                    {i + 1} Day{i > 0 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedDestinations.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2.5 items-center">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#a1a1aa]">Curate Option:</span>
                {selectedDestinations.map((dest) => {
                  const firstDay = getFirstDayForCity(dest)
                  const isCurrentCityActive = getCityForDayNumber(activeDayTab).toLowerCase().trim() === dest.toLowerCase().trim()
                  return (
                    <button
                      key={`curate-dest-${dest}`}
                      type="button"
                      onClick={() => {
                        setActiveDayTab(firstDay)
                        tripStore.setState({ activeDay: firstDay })
                      }}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide transition-all border ${
                        isCurrentCityActive
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-500 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)] scale-105 font-bold'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {titleCase(dest)} (Day {firstDay})
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">
            <button type="button" onClick={goToPlan} className="flex flex-col items-center gap-1 transition-opacity hover:opacity-100">
              <span className={activeStep === 'plan' ? 'text-white' : 'text-[#c3c6d7] transition hover:text-white'}>Plan</span>
              <div className={`h-1 w-12 rounded-full ${activeStep === 'plan' ? 'bg-[#2563eb] shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-white/10'}`} style={activeStep === 'plan' ? { animation: '0.35s ease-out 0s 1 normal none running stepUnderline' } : undefined}></div>
            </button>
            <button type="button" onClick={goToCurate} className="flex flex-col items-center gap-1 transition-opacity hover:opacity-100">
              <span className={activeStep === 'curate' ? 'text-white' : 'text-[#c3c6d7] transition hover:text-white'}>Curate</span>
              <div className={`h-1 w-16 rounded-full ${activeStep === 'curate' ? 'bg-[#2563eb] shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-white/10'}`} style={activeStep === 'curate' ? { animation: '0.35s ease-out 0s 1 normal none running stepUnderline' } : undefined}></div>
            </button>
            <button 
              type="button" 
              onClick={pushAllToTimeline} 
              className={`flex flex-col items-center gap-1 transition-opacity ${items.length === 0 ? 'cursor-not-allowed opacity-40' : 'hover:opacity-100'}`}
            >
              <span className={`${activeStep === 'timeline' ? 'text-white' : 'text-[#c3c6d7] transition hover:text-white'} flex items-center gap-1`}>
                {(window.localStorage.getItem('triparc:timeline:unlocked:v1') !== 'true' || items.length === 0) && (
                  <span className="material-symbols-outlined text-[12px] font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
                )}
                Timeline
              </span>
              <div className={`h-1 w-16 rounded-full ${activeStep === 'timeline' ? 'bg-[#2563eb] shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-white/10'}`} style={activeStep === 'timeline' ? { animation: '0.35s ease-out 0s 1 normal none running stepUnderline' } : undefined}></div>
            </button>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-12">
          <section className="flex flex-col gap-6 lg:col-span-3">

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant">Draft Itinerary</h2>
              <span className="rounded bg-surface-container-high px-2 py-1 text-[10px] text-on-surface-variant">{totalDraftDays} DAY{totalDraftDays > 1 ? 'S' : ''}</span>
            </div>

            {overflowCount > 0 && (
              <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-100">
                  {overflowCount} place{overflowCount > 1 ? 's are' : ' is'} outside your current scheduled days ({travelWindow.from} - {travelWindow.to}). Extend your stay or cancel the last destination.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTripDays((prev) => Math.max(3, prev + 1))
                      setActiveDayTab((prev) => Math.max(prev, 2))
                      setItems((prev) => {
                        const aligned = alignItemsToWindow(prev)
                        setOverflowCount(aligned.overflow)
                        return aligned.items
                      })
                      setStatusMessage('Stay extended. Overflow places redistributed to the next day.')
                    }}
                    className="rounded-full bg-amber-400/90 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-black"
                  >
                    Extend Stay
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItems((prev) => {
                        const trimmed = prev.slice(0, -1)
                        const aligned = alignItemsToWindow(trimmed)
                        setOverflowCount(aligned.overflow)
                        return aligned.items
                      })
                      setStatusMessage('Last destination removed to fit your selected day limit.')
                    }}
                    className="rounded-full border border-amber-300/60 bg-transparent px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-100"
                  >
                    Cancel Last Destination
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {Array.from({ length: visibleDayCount }).map((_, idx) => {
                const day = idx + 1
                const active = activeDayTab === day
                const dayCity = getCityForDayNumber(day).toLowerCase().trim()
                const activeCity = getCityForDayNumber(activeDayTab).toLowerCase().trim()
                if (dayCity !== activeCity) return null
                return (
                  <button
                    key={`day-tab-${day}`}
                    type="button"
                    onClick={() => {
                      setActiveDayTab(day)
                      tripStore.setState({ activeDay: day })
                    }}
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition ${active ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant hover:text-white'}`}
                  >
                    Day {day}
                  </button>
                )
              })}
            </div>

            <div className="relative max-h-[72vh] overflow-y-auto pr-2 pl-6">
              {[activeDayTab].map((day) => (
                <div key={`day-${day}`}>
                  <div className="absolute bottom-2 top-2 left-[7px] w-0.5 bg-outline-variant/30" />
                  <div className="absolute -left-1.5 top-0 h-3 w-3 rounded-full bg-primary ring-4 ring-surface" />
                  <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold">Day {day}</h3>
                        <p className="text-xs font-semibold text-primary tracking-wide">
                          {titleCase(getCityForDayNumber(day))} ({getCityTotalDays(getCityForDayNumber(day))} Day{getCityTotalDays(getCityForDayNumber(day)) > 1 ? 's' : ''} total)
                        </p>
                      </div>
                  </div>

                  {/* Inline timing indicators: render small status icon beside each place item instead of the separate panel */}

                  <div className="space-y-4">
                    {optimizedVisibleItems.length > 0 && optimizedVisibleItems.map((item, index) => {
                      const timingIndex = draftTimingAnalysis.findIndex(r => r.place.trim().toLowerCase() === item.title.trim().toLowerCase())
                      const timing = timingIndex >= 0 ? draftTimingAnalysis[timingIndex] : null
                      const timingLabel = timing ? (timing.status === 'optimal' ? 'optimal' : 'not optimal') : null
                      const timingHint = timing
                        ? timing.status === 'optimal'
                          ? 'Best place to visit now'
                          : `Best time: ${timing.recommended_time}`
                        : null
                      const timingGlow = timing
                        ? timing.status === 'optimal'
                          ? 'border-emerald-500/25 bg-emerald-500/5 shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_18px_36px_-28px_rgba(16,185,129,0.42)]'
                          : 'border-amber-500/20 bg-amber-500/5 shadow-[0_0_0_1px_rgba(245,158,11,0.18),0_18px_36px_-28px_rgba(245,158,11,0.36)]'
                        : ''

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => setDraggedId(item.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (draggedId) reorder(draggedId, item.id)
                            setDraggedId(null)
                          }}
                          className={`group relative rounded-xl border p-4 transition-all duration-300 ${item.status === 'current' ? 'border-primary/40 bg-surface-container shadow-[0_20px_40px_-28px_rgba(242,202,80,0.45)]' : 'border-transparent bg-surface-container hover:border-primary/20'} ${timingGlow}`}
                        >
                          <div className="flex gap-4">
                            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-surface-container-highest">
                              <img alt={item.title} className="h-full w-full object-cover" src={index === 0 ? 'https://lh3.googleusercontent.com/aida-public/AB6AXuCrq9sXtnKuTKPBEKIZ2g_4Zj-BT8jihA7_rVWckE7-VEm8L_Xj6_2QCDl32YJtMGucGGC7-J6I3F__xd1YhLoC6sDo-FIkHDfLdf8GWAFG4QP1C2q_Rvc7Zwcy1M65lkRUYdMKPob-Lum2I7hMMer8tV0XOtsGGnrh4etud5q4Zr7CPMdDT3f7c5NdUEksjgD9KNoFt_qYAo2OHfyVpfjsNJZdorGErtwIdG4tEmr9Qgp8L8OQPl2AqBU0mtDPNiKWc-1dGMNHekM' : 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPVEv5EWryBUaRNuzU-Fx1Z29ZSDrDNM0qD307oXTMhu5uvWzoHp7dpzs80lvAh7tHf8HJS5bqb-tvbVsH03eUFhPPlBP6xGvMcms7ePXRCESAeavU37cdgn_4wLbNIi3o1LrYBdjBf83ERQrAg1CmHFiKFYIxLARlpTJtBHhAGZC5ZBiLi55ZoGCJ2RgXXptDwhhckQGZsWhtHRGRkhGBGhvGHdPcfy8UN-Et7Ybvt4_cRfm6NaOsjIgqBa-m0HjrC48thbKtlTE'} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{item.time}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-white">{item.title}</p>
                                {timing && timingLabel && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-opacity opacity-0 group-hover:opacity-100 ${timing.status === 'optimal' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'}`}
                                    title={timing.suggestion}
                                  >
                                    {timingLabel}
                                  </span>
                                )}
                              </div>
                              {timingHint && (
                                <p className={`mt-1 text-[10px] uppercase tracking-widest opacity-0 transition-opacity group-hover:opacity-100 ${timing?.status === 'optimal' ? 'text-emerald-300' : 'text-amber-200'}`}>
                                  {timingHint}
                                </p>
                              )}
                              {item.requiresNextDay && (
                                <p className="mt-1 text-[10px] uppercase tracking-widest text-amber-300">Needs next day extension</p>
                              )}
                            </div>
                          </div>
                          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <select
                              value={item.dayNumber || 1}
                              onChange={(e) => {
                                const targetDay = Number(e.target.value)
                                setItems((prev) => {
                                  const updated = prev.map((it) =>
                                    it.id === item.id ? { ...it, dayNumber: targetDay } : it
                                  )
                                  const aligned = alignItemsToWindow(updated)
                                  setOverflowCount(aligned.overflow)
                                  return aligned.items
                                })
                                setStatusMessage(`Moved ${item.title} to Day ${targetDay}.`)
                              }}
                              className="rounded-md border border-white/10 bg-[#16192b] px-1.5 py-1 text-[10px] font-bold text-amber-200/80 outline-none transition hover:border-amber-300 cursor-pointer"
                            >
                              {Array.from({ length: visibleDayCount }).map((_, i) => (
                                <option key={i + 1} value={i + 1} className="bg-[#16192b] text-white">
                                  Day {i + 1}
                                </option>
                              ))}
                            </select>
                            <button type="button" onClick={() => removeItem(item.id)} className="rounded-full bg-surface-container-high p-1.5 text-on-surface-variant transition-colors hover:bg-error/20 hover:text-error">
                              <span className="material-symbols-outlined text-base">close</span>
                            </button>
                          </div>

                        </div>
                      )
                    })}

                    {optimizedVisibleItems.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/15 bg-surface-container p-4 text-sm text-on-surface-variant">
                        No draft items yet. Add places from your recommendations or bucketlist to build the itinerary.
                      </div>
                    )}
                  </div>
                </div>
              ))}

            </div>
          </section>

          <section className="flex flex-col gap-8 lg:col-span-6">
            <div className="rounded-3xl bg-surface-container p-6 shadow-2xl">
              <div className="relative mb-8">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      const text = query.trim()
                      if (!text) return
                      if (searchResults.length) {
                        // add first suggested result
                        void addItemFromSearch(searchResults[0].name)
                      } else {
                        // no suggestions: attempt to add raw query
                        void addItemFromSearch(text)
                      }
                    }
                  }}
                  className="w-full rounded-full border-none bg-surface-container-lowest py-4 pl-12 pr-6 text-on-surface transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/30"
                  placeholder="Search places, food, experiences..."
                  type="text"
                />
                {query.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-[110%] z-30 max-h-96 overflow-y-auto rounded-2xl border border-white/10 bg-[#1c1c1e] p-2 shadow-2xl">
                    {searching ? (
                      <p className="px-4 py-3 text-sm text-white/60">Searching nearby places...</p>
                    ) : searchResults.length ? (
                      <>
                        <div className="sticky top-0 border-b border-white/5 bg-[#1c1c1e] px-4 py-2">
                          <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Found {searchResults.length} result{searchResults.length > 1 ? 's' : ''}</p>
                        </div>
                        {searchResults.map((result, idx) => {
                          const isNearest = idx === 0 && searchResults.length > 1;
                          const distance = latestAnchorPlace?.lat != null && latestAnchorPlace?.lng != null && result.lat != null && result.lng != null 
                            ? calculateDistance(latestAnchorPlace.lat, latestAnchorPlace.lng, result.lat, result.lng).toFixed(1)
                            : null;
                          return (
                            <button
                              key={`${result.label}-${idx}`}
                              type="button"
                              onClick={() => addItemFromSearch(result.name)}
                              className="flex w-full items-start justify-between rounded-xl px-4 py-3 text-left transition-colors hover:bg-white/5"
                            >
                              <span className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="block text-sm font-semibold text-white">{result.name}</span>
                                  {isNearest && searchResults.length > 1 && (
                                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-300">Nearest</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-white/50">
                                  <span>{result.vicinity || 'Nearby destination'}</span>
                                  {distance && <span>• {distance} km away</span>}
                                </div>
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/20">Add</span>
                            </button>
                          );
                        })}
                      </>
                      
                    ) : (
                      <div className="px-4 py-3">
                        <p className="mb-3 text-sm text-white/60">No matches found for “{query.trim()}”.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void addItemFromSearch(query.trim())}
                            className="rounded-full bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            Add “{query.trim()}” to itinerary
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setQuery('')
                              setSearchResults([])
                            }}
                            className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mb-8">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant">From Your Bucketlist</h2>
                  <Link className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary transition-opacity hover:opacity-80" to="/bucketlist">
                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                  </Link>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {visibleBucketlist.map((card) => (
                    <article key={card.title} className="group w-[320px] min-w-[320px] overflow-hidden rounded-2xl bg-surface-container-low transition-colors hover:bg-surface-container-high">
                      <div className="relative h-32">
                        <img alt={card.title} className="h-full w-full object-cover" src={card.image} />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                          <span className="rounded-full border border-white/10 bg-white px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-black shadow-sm">{card.label}</span>
                        </div>
                        <div className="absolute right-2 top-2">
                          <button type="button" className="rounded-full border border-white/20 bg-white/10 p-1.5 text-primary backdrop-blur-md transition-all hover:bg-primary/20">
                            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>save</span>
                          </button>
                        </div>
                        <button type="button" className="absolute bottom-3 left-3 flex items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-red-500/40 hover:text-white">
                          <span className="material-symbols-outlined text-base transition-transform group-hover:scale-110">favorite</span>
                        </button>
                      </div>
                      <div className="p-4">
                        <h4 className="mb-1 text-base font-bold text-white">{card.title}</h4>
                        <p className="mb-4 text-[10px] uppercase tracking-widest text-on-surface-variant">{card.meta}</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => addNearestBranchOfRecommendation(card.title)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-container py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-primary-fixed-dim">
                            <span className="material-symbols-outlined text-sm">add</span> Nearest Branch
                          </button>
                          <button 
                            type="button" 
                            onClick={() => {
                              window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.title + ' ' + city)}`, '_blank')
                            }}
                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500"
                          >
                            <LuCircleArrowOutUpRight className="text-base" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!visibleBucketlist.length && (
                    <article className="min-w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                      {bucketlistCards.length
                        ? 'No bucketlist places match your current search.'
                        : 'No places in your Bucketlist yet. Add places in Bucketlist and they will appear here.'}
                    </article>
                  )}
                </div>
              </div>

              <div className="space-y-6 border-t border-outline-variant/10 pt-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant">Near Your Route + Explore {city}</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchRecommendations()}
                      disabled={loadingRecommendations}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Refresh
                    </button>
                    <span className="material-symbols-outlined text-primary text-xl">auto_awesome</span>
                  </div>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {loadingRecommendations ? (
                    <div className="flex min-w-full items-center justify-center py-12">
                      <p className="text-sm text-on-surface-variant">Loading personalized recommendations...</p>
                    </div>
                  ) : unifiedRecommendationDeck.length > 0 ? (
                    unifiedRecommendationDeck.map((rec, index) => (
                      <article key={rec.id} className="group w-[320px] min-w-[320px] overflow-hidden rounded-2xl bg-surface-container-low transition-colors hover:bg-surface-container-high">
                        <div className="relative h-32">
                          {rec.image ? (
                            <img alt={rec.name} className="h-full w-full object-cover" src={rec.image} />
                          ) : (
                            <div className="h-full w-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center">
                              <span className="material-symbols-outlined text-5xl text-primary/30">place</span>
                            </div>
                          )}
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                            {index < 2 && rec.isNearby && (
                              <span className="rounded-full border border-white/10 bg-primary px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">Near Your Route</span>
                            )}
                            <span className="rounded-full border border-white/10 bg-white px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-black shadow-sm">{rec.category}</span>
                            {rec.destination && (
                              <span className="rounded-full border border-white/10 bg-blue-600 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">{rec.destination.split(',')[0].trim()}</span>
                            )}
                            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">{rec.crowdLevel} crowd</span>
                          </div>
                          <button type="button" className="absolute bottom-3 left-3 flex items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-red-500/40 hover:text-white">
                            <span className="material-symbols-outlined text-base transition-transform group-hover:scale-110">favorite</span>
                          </button>
                        </div>
                        <div className="p-4">
                          <h4 className="mb-1 text-base font-bold text-white">{rec.name}</h4>

                          {rec.archetypeMatch && rec.archetypeMatch.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-1">
                              {rec.archetypeMatch.map((arch) => (
                                <span key={arch} className="rounded-full bg-primary/20 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary">
                                  {arch}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="mb-4 text-[10px] uppercase tracking-widest text-on-surface-variant/70">
                            {rec.estimatedMinutes > 60 ? `${Math.round(rec.estimatedMinutes / 60)} hrs` : `${rec.estimatedMinutes} min`} • Best: {rec.bestTime}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              title="Add the nearest branch of this place to your itinerary"
                              onClick={() => {
                                addNearestBranchOfRecommendation(
                                  rec.name,
                                  typeof rec.estimatedMinutes === 'number' ? rec.estimatedMinutes : parseMinutes(rec.estimatedMinutes),
                                  rec.category,
                                  rec.priceLevel,
                                  rec.image,
                                  rec.lat,
                                  rec.lng
                                )
                              }}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-container py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-primary-fixed-dim"
                            >
                              <span className="material-symbols-outlined text-sm">add</span> Nearest Branch
                            </button>
                            <button 
                              type="button" 
                              onClick={() => {
                                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rec.name + (rec.address ? ' ' + rec.address : ''))}`, '_blank')
                              }}
                              className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500"
                            >
                              <LuCircleArrowOutUpRight className="text-base" />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="flex min-w-full flex-col items-center justify-center py-12 text-center">
                      <span className="material-symbols-outlined mb-2 text-4xl text-on-surface-variant/40">location_off</span>
                      <p className="text-sm text-on-surface-variant">No recommendations available for {selectedDestinations.join(', ') || city}. Refresh to fetch places.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-6 lg:col-span-3">
            

            <div className="rounded-3xl border border-primary/10 bg-gradient-to-br from-primary-container/20 to-secondary-container/20 p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary">lightbulb</span>
                <h2 className="text-sm font-bold uppercase tracking-widest text-white">Aurora Insights</h2>
              </div>
              <div className="space-y-4">
                {auroraInsights.map((insight) => (
                  <div key={insight.label} className="flex gap-3">
                    <span className={`material-symbols-outlined mt-1 text-sm ${insight.accent}`}>{insight.icon}</span>
                    <p className="text-xs leading-relaxed text-white/90">
                      <span className={`font-bold ${insight.accent}`}>{insight.title}</span>{' '}
                      {insight.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </section>
        </div>
      </main>

      <footer className="fixed bottom-0 z-50 flex w-full items-center justify-between border-t border-[#B4C5FF]/5 bg-[#0E0E12]/80 px-12 py-6 text-[11px] uppercase tracking-widest text-[#C3C6D7] shadow-2xl shadow-blue-900/20 backdrop-blur-2xl">
        <div className="flex items-center gap-8">
          <span className="text-lg font-black tracking-tighter text-[#B4C5FF]">&nbsp;</span>
          <div className="hidden gap-6 md:flex">
            <span className="opacity-40">&nbsp;</span>
            <span className="opacity-40">&nbsp;</span>
            <span className="opacity-40">&nbsp;</span>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <p className="hidden opacity-40 lg:block">{statusMessage || 'Ready to push all curated destinations to your timeline.'}</p>
          <button
            type="button"
            onClick={pushAllToTimeline}
            disabled={finalizing || items.length === 0}
            className="scale-105 rounded-full bg-primary-container px-8 py-3 font-black tracking-widest text-on-primary-container shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-95 hover:bg-primary-fixed hover:text-on-primary-fixed disabled:cursor-not-allowed disabled:opacity-70"
          >
            {finalizing ? 'Pushing To Timeline...' : 'Push All To Timeline'}
          </button>
        </div>
      </footer>
    </div>
  )
}
