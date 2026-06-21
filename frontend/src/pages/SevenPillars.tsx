import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import TripArcNav from '../components/TripArcNav'
import {
  fetchSevenPillarsProfile,
  generateJourneyMap,
  searchDestinationPlaces,
  saveSevenPillarsProfile,
  type SevenPillarsPayload,
} from '../lib/sevenPillarsApi'

type DestinationNode = {
  id: string
  location: string
  travelFrom: string
  travelTo: string
}

type DestinationSuggestion = {
  label: string
  name: string
  vicinity?: string
  lat?: number
  lng?: number
}

const DRAFT_STORAGE_KEY = 'triparc:seven-pillars:draft:v1'
const JOURNEY_DRAFT_STORAGE_KEY = 'triparc:journey:draft:v1'

const compositionOptions = ['solo traveler', 'couple', 'family with kids', 'friends group', 'senior citizens']
const archetypeOptions = [
  'cultural explorer',
  'budget backpacker',
  'spiritual seeker',
  'chill and relax',
  'medical excursion',
  'instagram explorer',
]
const dietaryOptions = ['vegetarian', 'vegan', 'jain', 'halal', 'kosher']

const interestCards = [
  { key: 'photography', label: 'Photography', image: 'https://picsum.photos/seed/triparc-photo/600/400' },
  { key: 'architecture', label: 'Architecture', image: 'https://picsum.photos/seed/triparc-arch/600/400' },
  { key: 'food and cooking', label: 'Food & Cooking', image: 'https://picsum.photos/seed/triparc-food/600/400' },
  { key: 'history and archaeology', label: 'History & Archaeology', image: 'https://picsum.photos/seed/triparc-history/600/400' },
  { key: 'arts and crafts', label: 'Arts & Crafts', image: 'https://picsum.photos/seed/triparc-arts/600/400' },
  { key: 'yoga and wellness', label: 'Yoga & Wellness', image: 'https://picsum.photos/seed/triparc-yoga/600/400' },
  { key: 'shopping and markets', label: 'Shopping & Markets', image: 'https://picsum.photos/seed/triparc-market/600/400' },
  { key: 'wildlife and nature', label: 'Wildlife & Nature', image: 'https://picsum.photos/seed/triparc-nature/600/400' },
  { key: 'luxury and indulgence', label: 'Luxury & Indulgence', image: 'https://picsum.photos/seed/triparc-luxury/600/400' },
  { key: 'adventure and thrill', label: 'Adventure & Thrill', image: 'https://picsum.photos/seed/triparc-adventure/600/400' },
]

const budgetTiers = [
  { key: 'shoestring', label: 'Shoestring', amount: 'INR 5,000-10,000' },
  { key: 'budget', label: 'Budget', amount: 'INR 10,000-25,000' },
  { key: 'comfortable', label: 'Comfortable', amount: 'INR 25,000-50,000' },
  { key: 'luxury', label: 'Luxury', amount: 'INR 50,000+' },
]

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

function computeTripDays(destinations: SevenPillarsPayload['destinations']): number {
  const dateValues: number[] = []
  for (const dest of destinations) {
    const from = new Date(dest.travelFrom)
    const to = new Date(dest.travelTo)
    if (!Number.isNaN(from.getTime())) dateValues.push(from.getTime())
    if (!Number.isNaN(to.getTime())) dateValues.push(to.getTime())
  }
  if (!dateValues.length) return 1
  const min = Math.min(...dateValues)
  const max = Math.max(...dateValues)
  const diffDays = Math.floor((max - min) / (24 * 60 * 60 * 1000)) + 1
  return Math.max(1, diffDays)
}

function createNode(index = 1): DestinationNode {
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

export default function SevenPillarsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [destinations, setDestinations] = useState<DestinationNode[]>([createNode(1)])
  const [dayStart, setDayStart] = useState('08:00')
  const [dayEnd, setDayEnd] = useState('21:00')
  const [budgetTier, setBudgetTier] = useState('comfortable')
  const [budgetAmount, setBudgetAmount] = useState(42500)
  const [archetypes, setArchetypes] = useState<string[]>([])
  const [composition, setComposition] = useState('couple')
  const [dietaryPrefs, setDietaryPrefs] = useState<string[]>([])
  const [allergyInput, setAllergyInput] = useState('')
  const [allergyTags, setAllergyTags] = useState<string[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [allergySyncing, setAllergySyncing] = useState(false)
  const [status, setStatus] = useState('')
  const [activeStep, setActiveStep] = useState<'plan' | 'curate' | 'timeline'>('plan')
  const [suggestionsById, setSuggestionsById] = useState<Record<string, DestinationSuggestion[]>>({})
  const [activeSuggestId, setActiveSuggestId] = useState<string | null>(null)
  const searchTimersRef = useRef<Record<string, number>>({})
  const allergySaveTimerRef = useRef<number | null>(null)
  const allergyHydratedRef = useRef(false)
  const prefillAppliedRef = useRef(false)

  const destinationCity = useMemo(() => {
    const first = destinations.find((item) => item.location.trim())
    if (!first) return 'Bengaluru'
    const chunk = first.location.split(',')[0]?.trim()
    return chunk || 'Bengaluru'
  }, [destinations])

  const dayCycleHours = useMemo(() => {
    const [startHour, startMinute] = dayStart.split(':').map((v) => Number(v || 0))
    const [endHour, endMinute] = dayEnd.split(':').map((v) => Number(v || 0))
    const start = startHour * 60 + startMinute
    const end = endHour * 60 + endMinute
    const diff = end >= start ? end - start : 24 * 60 - start + end
    return Math.max(0, Math.round((diff / 60) * 10) / 10)
  }, [dayStart, dayEnd])

  useEffect(() => {
    if (budgetAmount <= 50000) return
    setArchetypes((prev) => {
      if (!prev.includes(BUDGET_BACKPACKER)) return prev
      setStatus('Budget Backpacker is unavailable for investment scope above INR 50,000.')
      return prev.filter((item) => item !== BUDGET_BACKPACKER)
    })
  }, [budgetAmount])

  const buildPayloadFromState = (): SevenPillarsPayload => ({
    engineVersion: '2.0',
    destinations: destinations
      .filter((item) => item.location.trim())
      .map((item) => ({
        location: item.location.trim(),
        travelFrom: item.travelFrom,
        travelTo: item.travelTo,
      })),
    dayStart,
    dayEnd,
    budgetTier,
    budgetAmount,
    archetypes: sanitizeArchetypesForBudget(archetypes, budgetAmount),
    composition,
    dietary: {
      preferences: dietaryPrefs,
      allergies: allergyTags.join(', '),
    },
    interests,
  })

  const applyPayloadToState = (payload: Partial<SevenPillarsPayload>) => {
    const nextDay = getNextDayISO()
    const nextDestinations = Array.isArray(payload.destinations)
      ? payload.destinations
          .map((item, idx) => {
            // Location 1 (idx 0) always uses today's date
            const isFirstDestination = idx === 0
            return {
              id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
              location: String(item.location || ''),
              travelFrom: isFirstDestination ? getTodayISO() : String(item.travelFrom || nextDay),
              travelTo: isFirstDestination ? getTodayISO() : String(item.travelTo || nextDay),
            }
          })
          .filter((item) => item.location)
      : []

    if (nextDestinations.length) setDestinations(nextDestinations)
    if (typeof payload.dayStart === 'string') setDayStart(payload.dayStart)
    if (typeof payload.dayEnd === 'string') setDayEnd(payload.dayEnd)
    if (typeof payload.budgetTier === 'string') setBudgetTier(payload.budgetTier)
    if (typeof payload.budgetAmount === 'number' && Number.isFinite(payload.budgetAmount)) {
      setBudgetAmount(payload.budgetAmount)
    }
    if (Array.isArray(payload.archetypes)) {
      setArchetypes(sanitizeArchetypesForBudget(payload.archetypes, typeof payload.budgetAmount === 'number' ? payload.budgetAmount : budgetAmount))
    }
    if (typeof payload.composition === 'string') setComposition(payload.composition)
    if (payload.dietary && Array.isArray(payload.dietary.preferences)) setDietaryPrefs(payload.dietary.preferences)
    if (payload.dietary && typeof payload.dietary.allergies === 'string') setAllergyTags(parseAllergyTokens(payload.dietary.allergies))
    if (Array.isArray(payload.interests)) setInterests(payload.interests)
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const rawDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY)
        if (rawDraft) {
          const parsed = JSON.parse(rawDraft) as Partial<SevenPillarsPayload>
          applyPayloadToState(parsed)
        }
      } catch {
        // Ignore local draft parsing errors.
      }

      try {
        const response = await fetchSevenPillarsProfile()
        if (cancelled || !response.data) {
          setLoading(false)
          return
        }
        const data = response.data
        const network = data.destination_network || {}
        const cycle = data.active_day_cycle || {}
        const invest = data.investment_scope || {}
        const diet = data.dietary_preferences || {}

        const savedDestinations = Array.isArray(network.destinations)
          ? network.destinations
              .map((item: any, idx: number) => {
                // Location 1 (idx 0) always uses today's date
                const isFirstDestination = idx === 0
                const defaultDate = isFirstDestination ? getTodayISO() : getNextDayISO()
                return {
                  id: `${Date.now()}-${idx}`,
                  location: String(item.location || ''),
                  travelFrom: isFirstDestination ? getTodayISO() : String(item.travelFrom || defaultDate),
                  travelTo: isFirstDestination ? getTodayISO() : String(item.travelTo || defaultDate),
                }
              })
              .filter((item: DestinationNode) => item.location)
          : []

        if (savedDestinations.length) setDestinations(savedDestinations)
        if (cycle.start) setDayStart(String(cycle.start))
        if (cycle.end) setDayEnd(String(cycle.end))
        if (invest.tier) setBudgetTier(String(invest.tier))
        if (invest.amount) setBudgetAmount(Number(invest.amount))
        if (Array.isArray(data.expedition_archetypes)) setArchetypes(data.expedition_archetypes)
        if (typeof data.group_composition === 'string') setComposition(data.group_composition)
        if (Array.isArray(diet.preferences)) setDietaryPrefs(diet.preferences)
        if (typeof diet.allergies === 'string') setAllergyTags(parseAllergyTokens(diet.allergies))
        if (Array.isArray(data.special_interests)) setInterests(data.special_interests)

        // Keep local cache in sync with server profile for reliable refresh behavior.
        const serverPayload: SevenPillarsPayload = {
          engineVersion: String(data.engine_version || '2.0'),
          destinations: savedDestinations.map((item: DestinationNode) => ({
            location: item.location,
            travelFrom: item.travelFrom,
            travelTo: item.travelTo,
          })),
          dayStart: String(cycle.start || '08:00'),
          dayEnd: String(cycle.end || '21:00'),
          budgetTier: String(invest.tier || 'comfortable'),
          budgetAmount: Number(invest.amount || 42500),
          archetypes: Array.isArray(data.expedition_archetypes) ? data.expedition_archetypes : [],
          composition: typeof data.group_composition === 'string' ? data.group_composition : 'couple',
          dietary: {
            preferences: Array.isArray(diet.preferences) ? diet.preferences : [],
            allergies: typeof diet.allergies === 'string' ? diet.allergies : '',
          },
          interests: Array.isArray(data.special_interests) ? data.special_interests : [],
        }
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(serverPayload))
      } catch (error: any) {
        setStatus(error?.message || 'Could not load your previous 7 pillars profile.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      for (const key of Object.keys(searchTimersRef.current)) {
        window.clearTimeout(searchTimersRef.current[key])
      }
      if (allergySaveTimerRef.current) {
        window.clearTimeout(allergySaveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!allergyHydratedRef.current) {
      allergyHydratedRef.current = true
      return
    }

    const payload = buildPayloadFromState()

    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore local storage failures.
    }

    if (allergySaveTimerRef.current) {
      window.clearTimeout(allergySaveTimerRef.current)
    }

    allergySaveTimerRef.current = window.setTimeout(async () => {
      try {
        setAllergySyncing(true)
        await saveSevenPillarsProfile(payload)
      } catch {
        setStatus('Could not auto-save allergies to the database. Use Save Draft to retry.')
      } finally {
        setAllergySyncing(false)
      }
    }, 450)
  }, [allergyTags, loading])

  useEffect(() => {
    if (loading || prefillAppliedRef.current) return

    const params = new URLSearchParams(location.search)
    const destination = (params.get('destination') || '').trim()
    if (!destination) return

    prefillAppliedRef.current = true
    setDestinations((prev) => {
      if (!prev.length) {
        return [{ ...createNode(1), location: destination }]
      }

      const alreadyExists = prev.some((item) => item.location.trim().toLowerCase() === destination.toLowerCase())
      if (alreadyExists) return prev

      if (!prev[0].location.trim()) {
        return prev.map((item, idx) => (idx === 0 ? { ...item, location: destination } : item))
      }

      return [{ ...createNode(prev.length + 1), location: destination }, ...prev]
    })
    setStatus('Destination prefilled from Landing search.')
  }, [loading, location.search])

  const handleDestinationChange = (id: string, key: keyof DestinationNode, value: string) => {
    setDestinations((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)))

    if (key !== 'location') return
    const text = value.trim()
    if (searchTimersRef.current[id]) {
      window.clearTimeout(searchTimersRef.current[id])
    }

    if (text.length < 2) {
      setSuggestionsById((prev) => ({ ...prev, [id]: [] }))
      return
    }

    const contextCity = destinations.find((item) => item.id !== id && item.location.trim())?.location.split(',')[0]?.trim()
    searchTimersRef.current[id] = window.setTimeout(async () => {
      try {
        const suggestions = await searchDestinationPlaces(text, contextCity, 6)
        setSuggestionsById((prev) => ({ ...prev, [id]: suggestions }))
        setActiveSuggestId(id)
      } catch {
        setSuggestionsById((prev) => ({ ...prev, [id]: [] }))
      }
    }, 220)
  }

  const selectSuggestion = (id: string, suggestion: DestinationSuggestion) => {
    setDestinations((prev) => prev.map((item) => (item.id === id ? { ...item, location: suggestion.label } : item)))
    setSuggestionsById((prev) => ({ ...prev, [id]: [] }))
    setActiveSuggestId(null)
  }

  const addDestination = () => {
    setDestinations((prev) => [...prev, createNode(prev.length + 1)])
  }

  const removeDestination = (id: string) => {
    setDestinations((prev) => prev.filter((item) => item.id !== id))
  }

  const toggleArchetype = (value: string) => {
    if (value === BUDGET_BACKPACKER && budgetAmount > 50000) {
      setStatus('Budget Backpacker cannot be selected when investment scope is above INR 50,000.')
      return
    }
    setArchetypes((prev) => {
      if (prev.includes(value)) return prev.filter((item) => item !== value)
      if (prev.length >= 3) return prev
      return [...prev, value]
    })
  }

  const toggleDietary = (value: string) => {
    setDietaryPrefs((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]))
  }

  const addAllergyFromInput = () => {
    const next = parseAllergyTokens(allergyInput)
    if (!next.length) {
      setAllergyInput('')
      return
    }
    setAllergyTags((prev) => {
      const merged = parseAllergyTokens([...prev, ...next].join(', '))
      return merged
    })
    setAllergyInput('')
  }

  const removeAllergyTag = (tag: string) => {
    setAllergyTags((prev) => prev.filter((item) => item !== tag))
  }

  const goToPlan = () => {
    setActiveStep('plan')
    navigate('/triparc/7pillars')
  }

  const goToCurate = () => {
    setActiveStep('curate')
    navigate('/curate')
  }

  const goToTimeline = () => {
    setActiveStep('timeline')
    navigate('/timeline')
  }

  const toggleInterest = (value: string) => {
    setInterests((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]))
  }

  const synthesize = async () => {
    setSaving(true)
    setStatus('')

    const payload: SevenPillarsPayload = buildPayloadFromState()

    if (!payload.destinations.length) {
      setStatus('Please add at least one destination.')
      setSaving(false)
      return
    }

    try {
      await saveSevenPillarsProfile(payload)

      const itinerary = await generateJourneyMap({
        city: destinationCity,
        plan: {
          locationPref: {
            crowded: budgetTier === 'luxury' ? 'medium' : 'low',
            walkKm: composition === 'senior citizens' ? 2 : 5,
          },
          budget: budgetTier,
          budgetAmount,
          dayStart,
          dayEnd,
          travelStyle: composition,
          food: dietaryPrefs,
          interests,
        },
        chosen: {
          anchors: payload.destinations.map((item) => item.location),
        },
      })

      const tripDays = computeTripDays(payload.destinations)
      const curatedItems = (itinerary.timeline || [])
        .filter((item: any) => {
          const title = String(item.title || item.name || '').trim().toLowerCase()
          const location = String(item.location || item.vicinity || '').trim().toLowerCase()
          const city = destinationCity.trim().toLowerCase()
          const category = String(item.category || '').trim().toLowerCase()
          const isPlaceholder = title === city || location === city
          return !(isPlaceholder && (category === 'planned' || category === 'general' || !category))
        })
        .map((item: any, index: number) => ({
          id: item.id || item.xid || `timeline-${index}`,
          xid: item.xid,
          title: item.title || item.name || 'Planned stop',
          location: item.location || item.vicinity || destinationCity,
          timeSlot: item.timeSlot || item.time || `${String(10 + index * 2).padStart(2, '0')}:00 - ${String(11 + index * 2).padStart(2, '0')}:30`,
          durationMinutes: Number(item.durationMinutes || item.duration_minutes || 60),
          category: item.category || 'Planned',
          status: item.status || 'planned',
          note: item.note || item.description,
          dayNumber: item.dayNumber || item.day_number || 1,
          crowdLevel: item.crowdLevel || item.crowd_level,
        }))

      try {
        window.localStorage.setItem(JOURNEY_DRAFT_STORAGE_KEY, JSON.stringify({
          city: destinationCity,
          items: curatedItems,
          travelWindow: { from: dayStart, to: dayEnd },
          preferences: {
            interests,
            archetypes: sanitizeArchetypesForBudget(archetypes, budgetAmount),
            composition,
            dietaryPreferences: dietaryPrefs,
            allergies: allergyTags,
            budgetTier,
            budgetAmount,
            destinations: payload.destinations.map((item) => item.location),
            tripDays,
          },
          tripDays,
          plan: {
            locationPref: { crowded: budgetTier === 'luxury' ? 'medium' : 'low', walkKm: composition === 'senior citizens' ? 2 : 5 },
            budget: budgetTier,
            budgetAmount,
            dayStart,
            dayEnd,
            travelStyle: composition,
            food: dietaryPrefs,
            interests,
          },
          chosen: { anchors: payload.destinations.map((item) => item.location) },
        }))
      } catch {
        // Ignore localStorage failures.
      }

      navigate('/curate', {
        state: {
          city: destinationCity,
          items: curatedItems,
          travelWindow: { from: dayStart, to: dayEnd },
          plan: {
            locationPref: { crowded: budgetTier === 'luxury' ? 'medium' : 'low', walkKm: composition === 'senior citizens' ? 2 : 5 },
            budget: budgetTier,
            budgetAmount,
            dayStart,
            dayEnd,
            travelStyle: composition,
            food: dietaryPrefs,
            interests,
          },
          chosen: { anchors: payload.destinations.map((item) => item.location) },
          overflow: itinerary.overflow || [],
          analysis: itinerary.analysis,
          // Enhanced preferences for recommendations
          preferences: {
            interests,
            archetypes: sanitizeArchetypesForBudget(archetypes, budgetAmount),
            composition,
            dietaryPreferences: dietaryPrefs,
            allergies: allergyTags,
            budgetTier,
            budgetAmount,
            destinations: payload.destinations.map((item) => item.location),
            tripDays,
          },
          tripDays,
        },
      })
    } catch (error: any) {
      setStatus(error?.message || 'Could not synthesize your journey map. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = async () => {
    setSavingDraft(true)
    setStatus('')
    const payload: SevenPillarsPayload = buildPayloadFromState()

    // Persist locally first so refresh keeps state even when backend is unavailable.
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore local storage failures and continue with remote save.
    }

    try {
      await saveSevenPillarsProfile(payload)
      setStatus('Draft saved successfully.')
    } catch (error: any) {
      setStatus(error?.message || 'Could not save draft.')
    } finally {
      setSavingDraft(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#131317] text-[#e4e1e7] font-body">
      <style>{`
        @keyframes stepUnderline {
          from { transform: scaleX(0); transform-origin: left; opacity: 0.75; }
          to { transform: scaleX(1); transform-origin: left; opacity: 1; }
        }
      `}</style>
      <TripArcNav />
      <main className="relative mx-auto w-full max-w-6xl px-6 pb-40 pt-10">
        <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[640px] w-full -translate-x-1/2 bg-[radial-gradient(circle_at_50%_40%,rgba(37,99,235,0.16),transparent_70%)]" />

        <header className="mb-12">
          <div className="flex flex-col items-end justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.26em] text-[#60a5fa]">Engine v2.0</span>
              <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight text-white md:text-6xl">THE 7 PILLARS OF JOURNEY PLANNING</h1>
              <p className="mt-4 max-w-2xl text-base text-[#c3c6d7] md:text-lg">
                Synthesizing your preferences through Aurora to craft a balanced expedition from destination graph to dietary detail.
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#f7d982]">City: {destinationCity} • Travel window {dayStart} - {dayEnd}</p>
            </div>
            <div className="flex items-center gap-4 pb-2">
              <button
                type="button"
                onClick={goToPlan}
                className="flex flex-col items-center gap-1 opacity-90 transition-opacity hover:opacity-100"
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest ${activeStep === 'plan' ? 'text-primary' : 'text-[#c3c6d7]'}`}>Plan</span>
                <div
                  className={`h-1 w-12 rounded-full ${activeStep === 'plan' ? 'bg-primary-container shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-white/10'}`}
                  style={activeStep === 'plan' ? { animation: 'stepUnderline .35s ease-out' } : undefined}
                />
              </button>
              <button
                type="button"
                onClick={goToCurate}
                className="flex flex-col items-center gap-1 opacity-80 transition-opacity hover:opacity-100"
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest ${activeStep === 'curate' ? 'text-primary' : 'text-[#c3c6d7]'}`}>Curate</span>
                <div
                  className={`h-1 w-16 rounded-full ${activeStep === 'curate' ? 'bg-primary-container shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-white/10'}`}
                  style={activeStep === 'curate' ? { animation: 'stepUnderline .35s ease-out' } : undefined}
                />
              </button>
              <button
                type="button"
                onClick={goToTimeline}
                className="flex flex-col items-center gap-1 opacity-80 transition-opacity hover:opacity-100"
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest ${activeStep === 'timeline' ? 'text-primary' : 'text-[#c3c6d7]'}`}>Timeline</span>
                <div
                  className={`h-1 w-12 rounded-full ${activeStep === 'timeline' ? 'bg-primary-container shadow-[0_0_8px_rgba(37,99,235,0.6)]' : 'bg-white/10'}`}
                  style={activeStep === 'timeline' ? { animation: 'stepUnderline .35s ease-out' } : undefined}
                />
              </button>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-white/80">Loading your saved profile...</div>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="space-y-10 md:col-span-8">
              <section className="space-y-6 rounded-3xl border border-white/10 bg-[#1f1f23]/70 p-6 md:p-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                    <h2 className="text-2xl font-bold text-white">Destination Network</h2>
                  </div>
                  <button
                    type="button"
                    onClick={addDestination}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#2a292e] px-4 py-2 text-sm font-bold text-[#b4c5ff] hover:border-blue-400/50"
                  >
                    <Plus size={16} />
                    Add Destination
                  </button>
                </div>

                <div className="space-y-4">
                  {destinations.map((node, idx) => (
                    <div
                      key={node.id}
                      className="grid grid-cols-1 items-center gap-4 rounded-2xl border border-white/5 bg-[#1b1b1f] p-4 md:grid-cols-12"
                    >
                      <div className="relative md:col-span-5">
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#8d90a0]">Location {String(idx + 1).padStart(2, '0')}</label>
                        <input
                          className="w-full rounded-lg border border-white/10 bg-[#131317] px-3 py-2 text-white outline-none focus:border-blue-400"
                          value={node.location}
                          onFocus={() => setActiveSuggestId(node.id)}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setActiveSuggestId((current) => (current === node.id ? null : current))
                            }, 120)
                          }}
                          onChange={(e) => handleDestinationChange(node.id, 'location', e.target.value)}
                          placeholder="e.g. Tokyo, Japan"
                        />
                        {activeSuggestId === node.id && (suggestionsById[node.id]?.length ?? 0) > 0 ? (
                          <div className="absolute z-30 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-white/10 bg-[#0f1014] p-1 shadow-2xl">
                            {(suggestionsById[node.id] || []).map((item, itemIndex) => (
                              <button
                                key={`${item.label}-${itemIndex}`}
                                type="button"
                                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#e4e1e7] hover:bg-white/10"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  selectSuggestion(node.id, item)
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="md:col-span-3">
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#8d90a0]">From</label>
                        <input
                          type="date"
                          className={`w-full rounded-lg border border-white/10 bg-[#131317] px-3 py-2 text-white outline-none focus:border-blue-400 ${idx === 0 ? 'cursor-not-allowed opacity-60' : ''}`}
                          value={node.travelFrom}
                          onChange={(e) => handleDestinationChange(node.id, 'travelFrom', e.target.value)}
                          disabled={idx === 0}
                        />
                        {idx === 0 && <p className="mt-1 text-xs text-[#60a5fa]">Locked to today</p>}
                      </div>
                      <div className="md:col-span-3">
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#8d90a0]">To</label>
                        <input
                          type="date"
                          className={`w-full rounded-lg border border-white/10 bg-[#131317] px-3 py-2 text-white outline-none focus:border-blue-400 ${idx === 0 ? 'cursor-not-allowed opacity-60' : ''}`}
                          value={node.travelTo}
                          onChange={(e) => handleDestinationChange(node.id, 'travelTo', e.target.value)}
                          disabled={idx === 0}
                        />
                        {idx === 0 && <p className="mt-1 text-xs text-[#60a5fa]">Locked to today</p>}
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        <button type="button" onClick={() => removeDestination(node.id)} className="text-[#8d90a0] hover:text-[#ffb4ab]" aria-label="Delete destination">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-6 rounded-3xl border border-white/10 bg-[#1f1f23]/70 p-6 md:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
                  <h2 className="text-2xl font-bold text-white">Active Day Cycle</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="rounded-xl border border-white/10 bg-[#131317] p-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8d90a0]">Start</span>
                    <input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className="mt-2 w-full bg-transparent text-sm text-white outline-none" />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-[#131317] p-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8d90a0]">End</span>
                    <input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className="mt-2 w-full bg-transparent text-sm text-white outline-none" />
                  </label>
                </div>
                <p className="text-sm text-[#c3c6d7]">
                  Optimization engine will prioritize experiences within this {dayCycleHours}-hour active window.
                </p>
              </section>

              <section className="space-y-6 rounded-3xl border border-white/10 bg-[#1f1f23]/70 p-6 md:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span>
                  <h2 className="text-2xl font-bold text-white">Investment Scope</h2>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {budgetTiers.map((tier) => {
                    const active = budgetTier === tier.key
                    return (
                      <button
                        key={tier.key}
                        type="button"
                        onClick={() => {
                          setBudgetTier(tier.key)
                          setBudgetAmount(tierPresetByKey[tier.key] ?? budgetAmount)
                        }}
                        className={`rounded-xl p-4 text-left transition ${active ? 'border-2 border-blue-400 bg-blue-500/20' : 'border border-white/10 bg-[#131317] hover:border-blue-300/40'}`}
                      >
                        <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#8d90a0]">{tier.label}</span>
                        <span className="mt-1 block text-sm font-bold text-white">{tier.amount}</span>
                      </button>
                    )
                  })}
                </div>

                <div>
                  <h3 className="text-3xl font-black text-white">INR {budgetAmount.toLocaleString('en-IN')}</h3>
                  <p className="text-sm text-[#c3c6d7]">Total Trip Expenditure</p>
                </div>
                <input
                  className="aurora-range w-full"
                  type="range"
                  min={5000}
                  max={100000}
                  step={100}
                  value={budgetAmount}
                  onInput={(e) => {
                    const amount = Number((e.target as HTMLInputElement).value)
                    setBudgetAmount(amount)
                    setBudgetTier(inferTierByAmount(amount))
                  }}
                />
              </section>

              <section className="space-y-6 rounded-3xl border border-white/10 bg-[#1f1f23]/70 p-6 md:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">4</span>
                    <h2 className="text-2xl font-bold text-white">Expedition Archetype</h2>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#8d90a0]">Select up to 3</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {archetypeOptions.map((item) => {
                    const active = archetypes.includes(item)
                    const blocked = item === BUDGET_BACKPACKER && budgetAmount > 50000
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleArchetype(item)}
                        disabled={blocked}
                        title={blocked ? 'Unavailable for investment scope above INR 50,000.' : undefined}
                        className={`rounded-2xl border p-4 text-center text-xs font-bold uppercase tracking-[0.12em] transition ${active ? 'border-blue-400 bg-blue-500/20 text-white' : 'border-white/10 bg-[#131317] text-[#c3c6d7] hover:border-blue-300/40'} ${blocked ? 'cursor-not-allowed opacity-45 hover:border-white/10' : ''}`}
                      >
                        {titleCase(item)}
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>

            <div className="space-y-6 md:col-span-4">
              <section className="rounded-3xl border border-white/10 bg-[#1f1f23]/70 p-6">
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">5</span>
                  <h3 className="text-lg font-bold text-white">Composition</h3>
                </div>
                <div className="space-y-3">
                  {compositionOptions.map((item) => {
                    const active = composition === item
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setComposition(item)}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${active ? 'border-blue-400 bg-blue-500/20 text-white' : 'border-white/10 bg-[#131317] text-[#c3c6d7] hover:border-blue-300/40'}`}
                      >
                        {titleCase(item)}
                      </button>
                    )
                  })}
                </div>
              </section>

              {composition === 'friends group' ? (
                <section className="mt-4 rounded-2xl border border-white/10 bg-[#141418]/60 p-4">
                  <h4 className="mb-2 text-sm font-bold text-white">Group Coordination</h4>
                  <p className="mb-3 text-xs text-[#8d90a0]">Create or join a travel group to share live locations with friends.</p>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/groups/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Trip Group' }) })
                            const data = await res.json()
                            if (res.ok && data?.group_id) {
                              window.localStorage.setItem('triparc:group_id', data.group_id)
                              window.localStorage.setItem('triparc:group_code', data.group_code)
                              
                              // Creator auto-joins the group so they show up in members list
                              const userId = window.localStorage.getItem('triparc:user_id') || undefined
                              const joinRes = await fetch('/api/groups/join', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ group_code: data.group_code, display_name: 'You', user_id: userId })
                              })
                              const joinData = await joinRes.json()
                              if (joinRes.ok && joinData?.member?.user_id) {
                                window.localStorage.setItem('triparc:user_id', joinData.member.user_id)
                              }
                              
                              alert(`Group created: ${data.group_code}`)
                            } else {
                              alert(data?.detail || 'Failed to create group')
                            }
                          } catch (err) {
                            console.error(err)
                            alert('Failed to create group')
                          }
                        }}
                        className="rounded-full bg-gradient-to-br from-[#adc6ff] to-[#4b8eff] px-4 py-2 text-xs font-bold text-[#00285c]"
                      >
                        Create Group
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const saved = window.localStorage.getItem('triparc:group_code')
                          if (saved) {
                            navigator.clipboard?.writeText(saved)
                            alert(`Copied group code: ${saved}`)
                          } else {
                            alert('No group created yet')
                          }
                        }}
                        className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-white"
                      >
                        Copy Code
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input id="join-display-name" placeholder="Display Name (optional)" className="flex-1 rounded-xl border border-white/10 bg-[#131317] px-3 py-2 text-sm text-white outline-none" />
                      <input id="join-code" placeholder="Enter group code" className="flex-1 rounded-xl border border-white/10 bg-[#131317] px-3 py-2 text-sm text-white outline-none" />
                      <button
                        type="button"
                        onClick={async () => {
                          const nameInput = (document.getElementById('join-display-name') as HTMLInputElement | null)
                          const input = (document.getElementById('join-code') as HTMLInputElement | null)
                          const code = input?.value?.trim()
                          const name = nameInput?.value?.trim() || 'You'
                          if (!code) return alert('Enter a group code')
                          try {
                            const userId = window.localStorage.getItem('triparc:user_id') || undefined
                            const res = await fetch('/api/groups/join', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ group_code: code, display_name: name, user_id: userId })
                            })
                            const data = await res.json()
                            if (res.ok && data?.group_id) {
                              window.localStorage.setItem('triparc:group_id', data.group_id)
                              window.localStorage.setItem('triparc:group_code', code)
                              if (data.member?.user_id) {
                                window.localStorage.setItem('triparc:user_id', data.member.user_id)
                              }
                              alert('Joined group')
                              navigate('/lostandfound')
                            } else {
                              alert(data?.detail || 'Failed to join group')
                            }
                          } catch (err) {
                            console.error(err)
                            alert('Failed to join group')
                          }
                        }}
                        className="rounded-full bg-[#2563EB] px-4 py-2 text-xs font-bold text-white"
                      >
                        Join
                      </button>
                    </div>

                    <p className="text-xs text-[#8d90a0]">Once members join, their names will appear in the Lost & Found group members list.</p>
                  </div>
                </section>
              ) : null}

              <section className="rounded-3xl border border-white/10 bg-[#1f1f23]/70 p-6">
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">6</span>
                  <h3 className="text-lg font-bold text-white">Gastronomy</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dietaryOptions.map((item) => {
                    const active = dietaryPrefs.includes(item)
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleDietary(item)}
                        className={`rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${active ? 'bg-blue-600 text-white' : 'bg-[#131317] text-[#c3c6d7] hover:bg-blue-600/25 hover:text-white'}`}
                      >
                        {item}
                      </button>
                    )
                  })}
                </div>

                <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#8d90a0]">Allergies</label>
                <input
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#131317] px-3 py-3 text-sm text-white outline-none placeholder:text-[#8d90a0] focus:border-blue-400"
                  placeholder="Type allergy and press Enter"
                  value={allergyInput}
                  onChange={(e) => setAllergyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    addAllergyFromInput()
                  }}
                />
                {allergyTags.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {allergyTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => removeAllergyTag(tag)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-blue-500"
                        title="Remove allergy"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-[#8d90a0]">
                  {allergySyncing ? 'Saving allergies...' : 'Press Enter to create an allergy box. Allergy boxes are auto-saved.'}
                </p>
              </section>
            </div>
          </div>
        )}

        <section className="mt-10 rounded-3xl border border-white/10 bg-[#1f1f23]/70 p-6 md:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">7</span>
            <h3 className="text-lg font-bold text-white">Special Interests</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {interestCards.map((card) => {
              const active = interests.includes(card.key)
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => toggleInterest(card.key)}
                  className={`group relative h-28 overflow-hidden rounded-xl border text-left transition ${active ? 'border-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.25)]' : 'border-white/10 hover:border-blue-300/40'}`}
                >
                  <img src={card.image} alt={card.label} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent p-3">
                    <span className="absolute bottom-3 left-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white">{card.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <div className="mt-14 text-center">
          <button
            type="button"
            disabled={savingDraft || loading}
            onClick={saveDraft}
            className="mb-4 inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {savingDraft ? <Loader2 className="animate-spin" size={16} /> : null}
            Save Draft
          </button>
          <br />
          <button
            type="button"
            disabled={saving || loading}
            onClick={synthesize}
            className="inline-flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] px-10 py-4 text-lg font-bold text-white shadow-2xl shadow-blue-600/20 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : null}
            SYNTHESIZE JOURNEY MAP
          </button>
          <p className="mt-4 text-sm text-[#c3c6d7]">Aurora engine may require around 45 seconds to build a full route plan.</p>
          {status ? <p className="mt-3 text-sm text-[#ffb4ab]">{status}</p> : null}
        </div>
      </main>
    </div>
  )
}
