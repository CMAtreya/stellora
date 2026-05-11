import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LuCircleArrowOutUpRight } from "react-icons/lu"
import { analyzeDraftItinerary, searchDestinationPlaces, getRecommendations } from '../lib/sevenPillarsApi'
import { supabase } from '../lib/supabaseClient'
import TripArcNav from '../components/TripArcNav'

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
}

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

function pickBucketlistImage(name: string, city: string, photoUrl?: string) {
  if (photoUrl && photoUrl.trim()) return photoUrl
  return `/api/static-map?query=${encodeURIComponent(`${name} ${city}`)}&width=600&height=400&zoom=14`
}

function clampIndex(index: number, max: number) {
  return Math.max(0, Math.min(index, max))
}

function getColorForPercentage(percentage: number): { bg: string; border: string } {
  if (percentage < 40) return { bg: 'bg-emerald-500', border: 'border-emerald-500' }
  if (percentage < 70) return { bg: 'bg-amber-500', border: 'border-amber-500' }
  return { bg: 'bg-red-500', border: 'border-red-500' }
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

function parseWindowTimeToMinutes(value?: string): number {
  const v = (value || '').trim()
  if (!v) return 10 * 60
  const parts = v.split(':')
  const hh = Number(parts[0] || 0)
  const mm = Number(parts[1] || 0)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 10 * 60
  return Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm))
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

function getCompositionScheduleProfile(composition: string) {
  const value = composition.toLowerCase()
  if (value.includes('solo')) return { durationFactor: 0.9, transitionMinutes: 10 }
  if (value.includes('friends')) return { durationFactor: 0.95, transitionMinutes: 12 }
  if (value.includes('senior')) return { durationFactor: 1.2, transitionMinutes: 25 }
  if (value.includes('family')) return { durationFactor: 1.1, transitionMinutes: 20 }
  return { durationFactor: 1, transitionMinutes: 15 }
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

export default function CuratePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState | null) || {}
  const persistedDraft = useMemo(() => readJourneyDraft(), [])
  const city = state.city || persistedDraft?.city || 'Jaipur'
  const [items, setItems] = useState<DraftItem[]>(() => {
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
  const [selectedTripDays, setSelectedTripDays] = useState<number>(() => Math.max(1, Number(state.tripDays || state.preferences?.tripDays || 1)))
  const [activeDayTab, setActiveDayTab] = useState<number>(1)
  const [draftTimingAnalysis, setDraftTimingAnalysis] = useState<DraftTimingItem[]>([])
  const [optimizedDraftItems, setOptimizedDraftItems] = useState<OptimizedDraftItem[]>([])
  const [draftAnalysisLoading, setDraftAnalysisLoading] = useState(false)
  const [expandedTimingRowKey, setExpandedTimingRowKey] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<'plan' | 'curate' | 'timeline'>('curate')

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
  const travelWindow = useMemo(
    () => ({
      from: state.travelWindow?.from || persistedDraft?.travelWindow.from || '10:00',
      to: state.travelWindow?.to || persistedDraft?.travelWindow.to || '20:00',
    }),
    [persistedDraft?.travelWindow.from, persistedDraft?.travelWindow.to, state.travelWindow?.from, state.travelWindow?.to],
  )
  const composition = String(preferences.composition || state.plan?.travelStyle || persistedDraft?.preferences?.composition || 'couple')

  useEffect(() => {
    writeJourneyDraft({
      city,
      items: items.map((item, index) => ({
        ...item,
        order: typeof item.order === 'number' ? item.order : index,
        dayNumber: item.dayNumber || 1,
      })),
      travelWindow,
      preferences,
      tripDays: selectedTripDays,
      plan: state.plan || persistedDraft?.plan,
      chosen: state.chosen || persistedDraft?.chosen,
    })
  }, [city, items, persistedDraft?.chosen, persistedDraft?.plan, preferences, selectedTripDays, state.chosen, state.plan, travelWindow, travelWindow.from, travelWindow.to])

  const alignItemsToWindow = useCallback(
    (source: DraftItem[]) => {
      if (!source.length) return { items: source, overflow: 0 }

      const start = parseWindowTimeToMinutes(travelWindow.from)
      const endRaw = parseWindowTimeToMinutes(travelWindow.to)
      const end = endRaw > start ? endRaw : start + 12 * 60
      const profile = getCompositionScheduleProfile(composition)

      let cursor = start
      // Keep at least 2 scheduling days so overflow from Day 1 is automatically placed on Day 2.
      const maxDays = Math.max(2, selectedTripDays)
      let day = 1
      let overflow = 0

      const nextItems = source.map((item, index) => {
        const baseDuration = item.baseDurationMinutes || parseDurationMinutes(item)
        const duration = Math.max(15, Math.round(baseDuration * profile.durationFactor))

        const placeInCurrentDay = () => {
          const latestStart = Math.max(start, end - duration)
          const startAt = Math.min(cursor, latestStart)
          const fits = startAt + duration <= end
          if (!fits) return null
          cursor = Math.min(end, startAt + duration + profile.transitionMinutes)
          return {
            ...item,
            baseDurationMinutes: baseDuration,
            durationMinutes: duration,
            duration: duration >= 60 ? `${Math.round(duration / 60)} hr` : `${duration} min`,
            time: formatMinutesAs12Hour(startAt),
            dayNumber: day,
            requiresNextDay: false,
            status: (item.status as TimelineStatus) || (index === 0 ? 'completed' : index === 1 ? 'current' : 'upcoming'),
          }
        }

        let placed = placeInCurrentDay()
        if (!placed && day < maxDays) {
          day += 1
          cursor = start
          placed = placeInCurrentDay()
        }

        if (!placed) {
          overflow += 1
          return {
            ...item,
            baseDurationMinutes: baseDuration,
            durationMinutes: duration,
            duration: duration >= 60 ? `${Math.round(duration / 60)} hr` : `${duration} min`,
            time: 'Outside active day cycle',
            dayNumber: day,
            requiresNextDay: true,
            status: 'upcoming' as TimelineStatus,
          }
        }

        return placed
      })

      return { items: nextItems, overflow }
    },
    [composition, selectedTripDays, travelWindow.from, travelWindow.to],
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
    if (!city) return
    setLoadingRecommendations(true)
    try {
      const exclude = Array.from(
        new Set([
          ...(opts?.excludeNames || []),
          ...items.map(item => item.title)
        ].map(n => n.trim().toLowerCase()).filter(Boolean))
      )
      const result = await getRecommendations({
        city,
        destinations: selectedDestinations,
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
        const destinationBuckets = await Promise.all(selectedDestinations.map((destination) => searchDestinationPlaces('top sights', destination, 6)))
        const merged = destinationBuckets.flatMap((bucket, bucketIndex) => mapFallbackRecommendations(bucket, selectedDestinations[bucketIndex] || city))
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
        const destinationBuckets = await Promise.all(selectedDestinations.map((destination) => searchDestinationPlaces('top sights', destination, 6)))
        const merged = destinationBuckets.flatMap((bucket, bucketIndex) => mapFallbackRecommendations(bucket, selectedDestinations[bucketIndex] || city))
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
  }, [city, items, latestAnchorPlace, mapFallbackRecommendations, preferences.archetypes, preferences.budgetAmount, preferences.budgetTier, preferences.composition, preferences.dietaryPreferences, preferences.interests, selectedDestinations, travelWindow.from, travelWindow.to])


  useEffect(() => {
    fetchRecommendations()
  }, [fetchRecommendations])

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

        if (!cancelled) setBucketlistCards(cards)
      } catch {
        if (!cancelled) setBucketlistCards([])
      }
    }

    loadBucketlistCards()
    return () => {
      cancelled = true
    }
  }, [city])

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
        const results = await searchDestinationPlaces(text, city, 6)
        if (!cancelled) setSearchResults(results)
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
  }, [city, query])

  const totalStops = items.length
  
  // Get walking tolerance from localStorage (default: 15 km/day)
  const walkingTolerance = useMemo(() => {
    const stored = localStorage.getItem('stellora_walking_tolerance')
    return stored ? Number(stored) : 15
  }, [])
  
  // Estimate walking distance: ~1.5km per stop + 1.5km base for city exploration
  const estimatedWalkingDistance = 1.5 + totalStops * 1.5
  
  // Walking load: percentage of tolerance used
  const walkingLoad = clampIndex(Math.round((estimatedWalkingDistance / walkingTolerance) * 100), 100)
  const activityDensity = clampIndex(56 + totalStops * 6, 96)
  const restBalance = clampIndex(82 - totalStops * 9, 92)

  const activePlan = useMemo(
    () => ({
      locationPref: {
        crowded: 'medium' as const,
        walkKm: composition.toLowerCase().includes('solo')
          ? 6
          : composition.toLowerCase().includes('friends')
            ? 5
            : composition.toLowerCase().includes('senior')
              ? 2
              : composition.toLowerCase().includes('family')
                ? 3
                : 4,
      },
      budget: 'balanced',
      budgetAmount: 25000,
      dayStart: travelWindow.from,
      dayEnd: travelWindow.to,
      travelStyle: composition,
      food: [],
      interests: ['heritage', 'food'],
    }),
    [composition, travelWindow.from, travelWindow.to],
  )

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
          if (!cancelled) setDraftTimingAnalysis(result.output || [])
          if (!cancelled) setOptimizedDraftItems(result.optimizedItems || [])
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
        },
      ]
      const aligned = alignItemsToWindow(next)
      setOverflowCount(aligned.overflow)
      return aligned.items
    })
    setStatusMessage(`Added ${title} to the draft itinerary. (${durationMinutes} minutes)`)
  }

  const addItemFromSearch = async (placeName: string) => {
    setStatusMessage(`Adding ${placeName}...`)
    try {
      // Fetch place details to get accurate duration
      const { details } = await (await fetch(`/api/places/details?query=${encodeURIComponent(placeName)}&city=${encodeURIComponent(city)}`)).json()
      addItemFromSuggestion(details.name, details.estimatedDurationMinutes, details.category)
      setQuery('')
      setSearchResults([])
    } catch (error) {
      // Fallback: add with default duration
      console.error('Could not fetch place details:', error)
      addItemFromSuggestion(placeName, 60, 'Suggested')
      setQuery('')
      setSearchResults([])
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
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              title: 'AI Replaced Premium Stop',
              category: 'Optimized',
              description: 'Route-optimized replacement with lower crowd pressure.',
            }
          : item,
      ),
    )
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

  const itemsByDay = useMemo(() => {
    const grouped = new Map<number, DraftItem[]>()
    for (const item of items) {
      const day = Number(item.dayNumber || 1)
      const list = grouped.get(day) || []
      list.push(item)
      grouped.set(day, list)
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])
  }, [items])

  const totalDraftDays = Math.max(1, itemsByDay.length)
  const visibleDayCount = Math.max(totalDraftDays, selectedTripDays)
  const visibleItems = useMemo(() => {
    const found = itemsByDay.find(([day]) => day === activeDayTab)
    return found ? found[1] : []
  }, [activeDayTab, itemsByDay])

  const optimizedVisibleItems = useMemo(() => {
    if (!draftTimingAnalysis.length || !visibleItems.length) return visibleItems
    const rankByPlace = new Map(
      draftTimingAnalysis.map((row, index) => [row.place.trim().toLowerCase(), index]),
    )
    return [...visibleItems].sort((left, right) => {
      const leftRank = rankByPlace.get((left.title || '').trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER
      const rightRank = rankByPlace.get((right.title || '').trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER
      return leftRank - rightRank
    })
  }, [draftTimingAnalysis, visibleItems])

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

  return (
    <div className="min-h-screen bg-[#131317] font-[Manrope] text-[#e4e1e7]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
        body { font-family: 'Manrope', sans-serif; background-color: #131317; color: #e4e1e7; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24; }
        .tonal-shift { transition: background-color 0.3s ease; }
        .glass { backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes stepUnderline {
          from { transform: scaleX(0); transform-origin: left; opacity: 0.75; }
          to { transform: scaleX(1); transform-origin: left; opacity: 1; }
        }
      `}</style>

      <TripArcNav />

      <main className="mx-auto max-w-[1600px] px-8 pb-28 pt-8">
        <header className="mb-12">
          <div className="flex flex-col items-end justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="mb-2 text-5xl font-extrabold tracking-tighter text-on-surface">Curate Your Journey</h1>
              <p className="max-w-xl text-on-surface-variant">Refine your trip with smarter choices, personal picks, and local insights from the celestial navigator.</p>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#f7d982]">City: {city} • Travel window {travelWindow.from} - {travelWindow.to}</p>
            </div>
            <div className="flex items-center gap-4 pb-2">
              <button
                type="button"
                onClick={goToPlan}
                className="flex flex-col items-center gap-1 opacity-50 transition-opacity hover:opacity-100"
              >
                <span className="text-[10px] font-bold uppercase tracking-widest">Plan</span>
                <div
                  className={`h-1 w-12 rounded-full ${activeStep === 'plan' ? 'bg-primary-container shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-surface-container-highest'}`}
                  style={activeStep === 'plan' ? { animation: 'stepUnderline .35s ease-out' } : undefined}
                />
              </button>
              <button
                type="button"
                onClick={goToCurate}
                className="flex flex-col items-center gap-1 opacity-80 transition-opacity hover:opacity-100"
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest ${activeStep === 'curate' ? 'text-primary' : 'text-on-surface-variant'}`}>Curate</span>
                <div
                  className={`h-1 w-16 rounded-full ${activeStep === 'curate' ? 'bg-primary-container shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-surface-container-highest'}`}
                  style={activeStep === 'curate' ? { animation: 'stepUnderline .35s ease-out' } : undefined}
                />
              </button>
              <button
                type="button"
                onClick={pushAllToTimeline}
                className="flex flex-col items-center gap-1 opacity-60 transition-opacity hover:opacity-100"
              >
                <span className="text-[10px] font-bold uppercase tracking-widest">Timeline</span>
                <div
                  className={`h-1 w-12 rounded-full ${activeStep === 'timeline' ? 'bg-primary-container shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-surface-container-highest'}`}
                  style={activeStep === 'timeline' ? { animation: 'stepUnderline .35s ease-out' } : undefined}
                />
              </button>
            </div>
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
                return (
                  <button
                    key={`day-tab-${day}`}
                    type="button"
                    onClick={() => setActiveDayTab(day)}
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
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold">Day {day}</h3>
                    </div>
                  </div>

                  {draftTimingAnalysis.length > 0 && (
                    <div className="mb-4 max-h-[36vh] overflow-y-auto rounded-xl border border-primary/20 bg-primary/5 p-4 scrollbar-hide">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Live timing analysis</p>
                        <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">Reordered by best visiting times</p>
                      </div>
                      <div className="space-y-2">
                        {draftTimingAnalysis.map((row, index) => {
                          const rowKey = `${row.place}-${row.recommended_time}-${row.user_time || 'unset'}-${row.duration}-${index}`
                          const isExpanded = expandedTimingRowKey === rowKey
                          return (
                            <div key={rowKey} className="rounded-lg border border-white/10 bg-surface-container px-3 py-2 text-[11px] text-on-surface-variant">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-white">
                                <span className="font-semibold text-white">{row.place}</span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedTimingRowKey((prev) => (prev === rowKey ? null : rowKey))}
                                  aria-expanded={isExpanded}
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-opacity hover:opacity-90 ${row.status === 'optimal' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'}`}
                                >
                                  {row.status}
                                </button>
                              </div>
                              {isExpanded && (
                                <>
                                  <p className="mt-1">Duration: {row.duration} min • Recommended: {row.recommended_time} • Your time: {row.user_time || 'not set'}</p>
                                  <p className="mt-1 text-white/70">{row.suggestion}</p>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {optimizedVisibleItems.length ? optimizedVisibleItems.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggedId(item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedId) reorder(draggedId, item.id)
                      setDraggedId(null)
                    }}
                    className={`group relative rounded-xl border p-4 transition-all duration-300 ${item.status === 'current' ? 'border-primary/40 bg-surface-container shadow-[0_20px_40px_-28px_rgba(242,202,80,0.45)]' : 'border-transparent bg-surface-container hover:border-primary/20'}`}
                  >
                    <div className="flex gap-4">
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-surface-container-highest">
                        <img alt={item.title} className="h-full w-full object-cover" src={index === 0 ? 'https://lh3.googleusercontent.com/aida-public/AB6AXuCrq9sXtnKuTKPBEKIZ2g_4Zj-BT8jihA7_rVWckE7-VEm8L_Xj6_2QCDl32YJtMGucGGC7-J6I3F__xd1YhLoC6sDo-FIkHDfLdf8GWAFG4QP1C2q_Rvc7Zwcy1M65lkRUYdMKPob-Lum2I7hMMer8tV0XOtsGGnrh4etud5q4Zr7CPMdDT3f7c5NdUEksjgD9KNoFt_qYAo2OHfyVpfjsNJZdorGErtwIdG4tEmr9Qgp8L8OQPl2AqBU0mtDPNiKWc-1dGMNHekM' : 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPVEv5EWryBUaRNuzU-Fx1Z29ZSDrDNM0qD307oXTMhu5uvWzoHp7dpzs80lvAh7tHf8HJS5bqb-tvbVsH03eUFhPPlBP6xGvMcms7ePXRCESAeavU37cdgn_4wLbNIi3o1LrYBdjBf83ERQrAg1CmHFiKFYIxLARlpTJtBHhAGZC5ZBiLi55ZoGCJ2RgXXptDwhhckQGZsWhtHRGRkhGBGhvGHdPcfy8UN-Et7Ybvt4_cRfm6NaOsjIgqBa-m0HjrC48thbKtlTE'} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{item.time}</p>
                        <p className="text-sm font-bold text-white">{item.title}</p>
                        {item.requiresNextDay && (
                          <p className="mt-1 text-[10px] uppercase tracking-widest text-amber-300">Needs next day extension</p>
                        )}
                      </div>
                    </div>
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button type="button" onClick={() => editTime()} className="rounded-full bg-surface-container-high p-1.5 text-on-surface-variant transition-colors hover:bg-primary/20 hover:text-primary">
                        <span className="material-symbols-outlined text-base">sync</span>
                      </button>
                      <button type="button" onClick={() => removeItem(item.id)} className="rounded-full bg-surface-container-high p-1.5 text-on-surface-variant transition-colors hover:bg-error/20 hover:text-error">
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    </div>

                  </div>
                    )) : (
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
                  <div className="absolute left-0 right-0 top-[110%] z-30 rounded-2xl border border-white/10 bg-[#1c1c1e] p-2 shadow-2xl">
                    {searching ? (
                      <p className="px-4 py-3 text-sm text-white/60">Searching nearby places...</p>
                    ) : searchResults.length ? (
                      searchResults.map((result) => (
                        <button
                          key={result.label}
                          type="button"
                          onClick={() => addItemFromSearch(result.name)}
                          className="flex w-full items-start justify-between rounded-xl px-4 py-3 text-left transition-colors hover:bg-white/5"
                        >
                          <span>
                            <span className="block text-sm font-semibold text-white">{result.name}</span>
                            <span className="text-xs text-white/50">{result.vicinity || 'Nearby destination'}</span>
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/70">Add</span>
                        </button>
                      ))
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
                          <button type="button" onClick={() => addItemFromSuggestion(card.title)} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-container py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-primary-fixed-dim">
                            <span className="material-symbols-outlined text-sm">add</span> Add to Plan
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
                {recommendations.filter(r => r.isNearby).length > 0 && (
                  <div className="mb-8">
                    <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant">Near Your Route</h2>
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                      {recommendations.filter(r => r.isNearby).map((rec) => (
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
                              <span className="rounded-full border border-white/10 bg-white px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-black shadow-sm">{rec.category}</span>
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
                                onClick={() => {
                                  addItemFromSuggestion(rec.name, typeof rec.estimatedMinutes === 'number' ? rec.estimatedMinutes : parseMinutes(rec.estimatedMinutes), rec.category, rec.lat, rec.lng, rec.image, rec.priceLevel)
                                }}
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-container py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-primary-fixed-dim"
                              >
                                <span className="material-symbols-outlined text-sm">add</span> Add to Plan
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
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant">Explore More in {city}</h2>
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
                  ) : recommendations.filter(r => !r.isNearby).length > 0 ? (
                    recommendations.filter(r => !r.isNearby).map((rec) => (
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
                            <span className="rounded-full border border-white/10 bg-white px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-black shadow-sm">{rec.category}</span>

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
                              onClick={() => {
                                addItemFromSuggestion(rec.name, typeof rec.estimatedMinutes === 'number' ? rec.estimatedMinutes : parseMinutes(rec.estimatedMinutes), rec.category, rec.lat, rec.lng, rec.image, rec.priceLevel)
                              }}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-container py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-primary-fixed-dim"
                            >
                              <span className="material-symbols-outlined text-sm">add</span> Add to Plan
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
                      <p className="text-sm text-on-surface-variant">No recommendations available. Add your preferences to get personalized suggestions.</p>
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
                <div className="flex gap-3">
                  <span className="material-symbols-outlined mt-1 text-sm text-primary">done_all</span>
                  <p className="text-xs leading-relaxed text-white/90">Better to visit <span className="font-bold text-primary">Amber Palace</span> after 4 PM for the golden hour illumination.</p>
                </div>
                <div className="flex gap-3">
                  <span className="material-symbols-outlined mt-1 text-sm text-error">warning</span>
                  <p className="text-xs leading-relaxed text-white/90">Crowd expected to rise soon at the <span className="font-bold text-error">Spice Trail</span>. Best to head there now.</p>
                </div>
                <div className="flex gap-3">
                  <span className="material-symbols-outlined mt-1 text-sm text-secondary">auto_awesome</span>
                  <p className="text-xs leading-relaxed text-white/90">No backtracking detected. Your current route fits between lunch and evening slots perfectly.</p>
                </div>
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
            disabled={finalizing}
            className="scale-105 rounded-full bg-primary-container px-8 py-3 font-black tracking-widest text-on-primary-container shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-95 hover:bg-primary-fixed hover:text-on-primary-fixed disabled:cursor-not-allowed disabled:opacity-70"
          >
            {finalizing ? 'Pushing To Timeline...' : 'Push All To Timeline'}
          </button>
        </div>
      </footer>
    </div>
  )
}
