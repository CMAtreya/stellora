import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TripArcNav from '../components/TripArcNav'
import LeafletMap from '../components/LeafletMap'
import { getPlaceDetails } from '../lib/sevenPillarsApi'

type TimelineRow = {
  kind: 'past' | 'current' | 'upcoming' | 'transition' | 'block'
  time?: string
  title?: string
  subtitle?: string
  done?: boolean
  icon?: string
  text?: string
  badge?: string
  image?: string
  lat?: number
  lng?: number
  priceLevel?: number
  category?: string
  sourceIndex?: number
  block?: string
  placeId?: string
  photoReference?: string
  segmentKey?: string
  endIndex?: number
  fromLabel?: string
  toLabel?: string
  segmentDistanceKm?: number
  segmentMinutes?: number
  transportMode?: TransportMode
  recommendedTransportMode?: TransportMode
}

type TimelineItem = {
  id?: string
  time?: string
  title?: string
  name?: string
  location?: string
  durationMinutes?: number
  image?: string
  photoUrl?: string
  category?: string
  priceLevel?: number
  lat?: number
  lng?: number
  placeId?: string
  photoReference?: string
}

type LocationMatchMode = 'exact' | '5m' | '20m'
type TransportMode = 'walk' | 'taxi' | 'public' | 'cycle'

type TransitionInfo = {
  segmentKey?: string
  endIndex?: number
  fromLabel?: string
  toLabel?: string
  segmentDistanceKm?: number
  segmentMinutes?: number
  transportMode?: TransportMode
  recommendedTransportMode?: TransportMode
}

const JOURNEY_DRAFT_STORAGE_KEY = 'triparc:journey:draft:v1'
const ROUTE_SAVINGS_STORAGE_KEY = 'triparc:timeline:route-savings:v1'

type RouteSavings = {
  optimizedDistanceKm: number
  baselineDistanceKm: number
  distanceSavedKm: number
  costSaved: number
  nearestStopId?: string | null
  nearestStopTitle?: string
}

function readJourneyDraft(): any | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(JOURNEY_DRAFT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function readRouteSavings(): RouteSavings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ROUTE_SAVINGS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data?: RouteSavings }
    return parsed?.data || null
  } catch {
    return null
  }
}

function readSelectedStartLocation(): { lat: number; lng: number; label?: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const keyPrefix = 'triparc:timeline:start-location:'
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(keyPrefix)) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as { lat?: number; lng?: number; label?: string }
      if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        return { lat: parsed.lat, lng: parsed.lng, label: parsed.label }
      }
    }
    return null
  } catch {
    return null
  }
}

function getDefaultPlaceImage(title?: string, subtitle?: string) {
  const query = encodeURIComponent([title, subtitle].filter(Boolean).join(' '))
  return `/api/place-photo?query=${query}`
}

function getPhotoReferenceFromUrl(url?: string) {
  if (!url) return ''
  const match = url.match(/[?&]ref=([^&]+)/i)
  if (!match?.[1]) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function getGooglePlaceImage(
  title?: string,
  subtitle?: string,
  city?: string,
  lat?: number,
  lng?: number,
  placeId?: string,
  photoReference?: string,
) {
  const query = encodeURIComponent([title, subtitle, city].filter(Boolean).join(' '))
  if (photoReference?.trim()) {
    return `/api/place-photo?ref=${encodeURIComponent(photoReference.trim())}`
  }
  if (placeId?.trim()) {
    return `/api/place-photo?place_id=${encodeURIComponent(placeId.trim())}&query=${query}`
  }
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
  if (hasCoords) {
    return `/api/place-photo?query=${query}&lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
  }
  return `/api/place-photo?query=${query}`
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    0.5 - Math.cos(dLat)/2 + 
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    (1 - Math.cos(dLon))/2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function getTransportEstimate(distanceKm: number) {
  const speedByMode: Record<TransportMode, number> = {
    walk: 4.5,
    cycle: 12,
    public: 18,
    taxi: 25,
  }

  const estimatedMinutesByMode = Object.entries(speedByMode).reduce<Record<TransportMode, number>>((acc, [mode, speed]) => {
    const key = mode as TransportMode
    acc[key] = Math.max(1, Math.round((distanceKm / speed) * 60))
    return acc
  }, { walk: 1, taxi: 1, public: 1, cycle: 1 })

  const recommendedTransportMode: TransportMode = distanceKm < 1 ? 'walk' : 'taxi'
  return {
    recommendedTransportMode,
    estimatedMinutesByMode,
  }
}

function getTransportLabel(mode: TransportMode) {
  if (mode === 'walk') return 'Walk'
  if (mode === 'taxi') return 'Taxi'
  if (mode === 'public') return 'Public'
  return 'Cycle'
}

function getSegmentKey(fromIndex: number | 'start', toIndex: number) {
  return `${fromIndex}-${toIndex}`
}

function findClosestTimelineRow(rows: TimelineRow[], location: { lat: number; lng: number }, thresholdKm = 0.05): TimelineRow | null {
  let closestRow: TimelineRow | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  rows.forEach((row) => {
    if (row.kind === 'transition' || row.kind === 'block') return
    if (row.lat == null || row.lng == null) return
    const distance = getDistance(location.lat, location.lng, row.lat, row.lng)
    if (distance < closestDistance) {
      closestDistance = distance
      closestRow = row
    }
  })

  return closestRow && closestDistance <= thresholdKm ? closestRow : null
}

function getLocationThresholdKm(mode: LocationMatchMode) {
  if (mode === 'exact') return 0
  if (mode === '5m') return 0.005
  return 0.02
}

function parseTimeToMinutes(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY
  const firstPart = value.split(/[—-]/)[0].trim()
  const match = firstPart.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (!match) return Number.POSITIVE_INFINITY
  let hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  const meridiem = match[3]?.toUpperCase()
  if (meridiem === 'AM' && hours === 12) hours = 0
  if (meridiem === 'PM' && hours !== 12) hours += 12
  return hours * 60 + minutes
}

function parseDisplayTimeToClockValue(value?: string) {
  if (!value) return '09:00'
  const firstPart = value.split(/[—-]/)[0].trim()
  const match = firstPart.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (!match) return '09:00'
  let hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  const meridiem = match[3]?.toUpperCase()
  if (meridiem === 'AM' && hours === 12) hours = 0
  if (meridiem === 'PM' && hours !== 12) hours += 12
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatClockValueToDisplayTime(clockValue: string) {
  const [hoursText, minutesText] = clockValue.split(':')
  let hours = Number(hoursText)
  const minutes = Number(minutesText || 0)
  const meridiem = hours >= 12 ? 'PM' : 'AM'
  if (hours === 0) hours = 12
  else if (hours > 12) hours -= 12
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${meridiem}`
}

function formatMinutesToDisplayTime(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h24 = Math.floor(normalized / 60)
  const mm = String(normalized % 60).padStart(2, '0')
  return formatClockValueToDisplayTime(`${String(h24).padStart(2, '0')}:${mm}`)
}

function shiftTimelineTimeValue(value?: string, shiftMinutes = 0) {
  if (!value || !shiftMinutes) return value || ''
  const separator = value.includes('—') ? '—' : value.includes('-') ? '-' : ''
  const parts = separator ? value.split(separator).map((part) => part.trim()).filter(Boolean) : [value.trim()]

  const shiftPart = (part: string) => {
    const minutes = parseTimeToMinutes(part)
    if (!Number.isFinite(minutes)) return part
    return formatMinutesToDisplayTime(minutes + shiftMinutes)
  }

  if (parts.length >= 2) {
    return `${shiftPart(parts[0])} — ${shiftPart(parts[1])}`
  }

  return shiftPart(parts[0])
}

function parseTimeRangeStart(value?: string) {
  const minutes = parseTimeToMinutes(value)
  return Number.isFinite(minutes) ? minutes : null
}

function parseTimeRangeEnd(value?: string) {
  if (!value) return null
  const separator = value.includes('—') ? '—' : value.includes('-') ? '-' : ''
  if (!separator) return null
  const parts = value.split(separator).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const end = parseTimeToMinutes(parts[1])
  return Number.isFinite(end) ? end : null
}

function getCurrentClockMinutes() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function sortTimelineItemsByTime(items: any[]) {
  return [...items].sort((a, b) => {
    const aTime = parseTimeToMinutes(a?.time)
    const bTime = parseTimeToMinutes(b?.time)
    if (aTime !== bTime) return aTime - bTime
    return String(a?.title || a?.name || '').localeCompare(String(b?.title || b?.name || ''))
  })
}

function getTimeBlockLabel(value?: string) {
  const minutes = parseTimeToMinutes(value)
  if (!Number.isFinite(minutes)) return 'All Day'
  if (minutes < 720) return 'Morning'
  if (minutes < 1020) return 'Afternoon'
  if (minutes < 1260) return 'Evening'
  return 'Night'
}

async function fetchLiveRoute(start: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`
  const response = await fetch(url)
  if (!response.ok) return null
  const data = await response.json()
  const route = data?.routes?.[0]
  if (!route?.geometry?.coordinates?.length) return null
  return {
    distanceKm: Number(route.distance || 0) / 1000,
    geometry: route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number]),
  }
}

async function fetchRouteDistance(start: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${dest.lng},${dest.lat}?overview=false`
  const response = await fetch(url)
  if (!response.ok) return null
  const data = await response.json()
  const route = data?.routes?.[0]
  if (!route) return null
  return Number(route.distance || 0) / 1000
}

export default function PreferencesPage() {
  const navigate = useNavigate()
  const persistedDraft = useMemo(() => readJourneyDraft(), [])
  const selectedStartLocation = useMemo(() => readSelectedStartLocation(), [])
  const city = persistedDraft?.city || 'Kyoto'
  const [editEnabled, setEditEnabled] = useState(false)
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [liveLocation, setLiveLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [activeRouteIndex, setActiveRouteIndex] = useState(0)
  const [liveRoutePoints, setLiveRoutePoints] = useState<Array<[number, number]>>([])
  const [liveRouteDistanceKm, setLiveRouteDistanceKm] = useState<number | null>(null)
  const [syncSuggestion, setSyncSuggestion] = useState('')
  const [syncShiftMinutes, setSyncShiftMinutes] = useState<number | null>(null)
  const [syncTargetTime, setSyncTargetTime] = useState<number | null>(null)
  const [locationMatchMode, setLocationMatchMode] = useState<LocationMatchMode>('20m')
  const [clockMinutes, setClockMinutes] = useState<number>(() => getCurrentClockMinutes())
  const [locationError, setLocationError] = useState('')
  const [draftItems, setDraftItems] = useState<TimelineItem[]>(persistedDraft?.items || [])
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null)
  const [editingTimeValue, setEditingTimeValue] = useState('')
  const [editingTimeTemplate, setEditingTimeTemplate] = useState('')

  const [timelineRows, setTimelineRows] = useState<TimelineRow[]>([])
  const [previewRowId, setPreviewRowId] = useState<string | null>(null)
  const [rowImages, setRowImages] = useState<Record<string, string>>({})
  const [rowDetailsMap, setRowDetailsMap] = useState<Record<string, { crowdLevel?: string; rating?: number; reviews?: number }>>({})
  type CostHint = number | { amount: number; currency: string }
  const [rowCostMap, setRowCostMap] = useState<Record<string, CostHint>>({})
  const [coveredDistanceKm, setCoveredDistanceKm] = useState<number | null>(null)
  const [segmentTransportModes, setSegmentTransportModes] = useState<Record<string, TransportMode>>({})

  const orderedItems = useMemo(() => {
    const baseItems = draftItems.length > 0 ? draftItems : (persistedDraft?.items || [])
    return editEnabled ? baseItems : sortTimelineItemsByTime(baseItems)
  }, [draftItems, editEnabled, persistedDraft?.items])

  const activeRouteItem = useMemo(() => orderedItems[activeRouteIndex] || orderedItems[0] || null, [activeRouteIndex, orderedItems])
  const currentTimelineRow = useMemo(() => timelineRows.find((row) => row.kind === 'current' && row.sourceIndex != null) || null, [timelineRows])
  const currentDayNumber = useMemo(() => {
    const day = Number((orderedItems[activeRouteIndex] as any)?.dayNumber || (orderedItems[0] as any)?.dayNumber || 1)
    return Number.isFinite(day) && day > 0 ? day : 1
  }, [activeRouteIndex, orderedItems])
  const totalTripDays = useMemo(() => {
    const maxDay = orderedItems.reduce((max: number, item: any) => {
      const day = Number(item?.dayNumber || 1)
      return Number.isFinite(day) ? Math.max(max, day) : max
    }, 1)
    return Math.max(1, maxDay)
  }, [orderedItems])
  const liveDateLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
    [],
  )
  const energyScore = useMemo(() => {
    if (!orderedItems.length) return 0
    const doneCount = timelineRows.filter((row) => row.kind === 'past').length
    return Math.min(100, Math.max(10, Math.round(((orderedItems.length - doneCount) / orderedItems.length) * 100)))
  }, [orderedItems.length, timelineRows])
  const budgetDisplay = useMemo(() => {
    const budget = Number(persistedDraft?.preferences?.budgetAmount || 0)
    if (!Number.isFinite(budget) || budget <= 0) return 'Not set'
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(budget)
  }, [persistedDraft?.preferences?.budgetAmount])

  const budgetAmount = useMemo(() => {
    const prefBudget = Number(persistedDraft?.preferences?.budgetAmount || 0)
    const planBudget = Number((persistedDraft as any)?.plan?.budgetAmount || 0)
    if (Number.isFinite(prefBudget) && prefBudget > 0) return prefBudget
    if (Number.isFinite(planBudget) && planBudget > 0) return planBudget
    return 0
  }, [persistedDraft])

  const estimatedTripCost = useMemo(() => {
    return Object.values(rowCostMap).reduce((sum: number, cost: CostHint) => {
      if (typeof cost === 'number') return sum + Number(cost)
      if (cost && typeof cost === 'object' && typeof cost.amount === 'number') return sum + Number(cost.amount)
      return sum
    }, 0)
  }, [rowCostMap])

  const coveredTripCost = useMemo(() => {
    return timelineRows.reduce((sum: number, row) => {
      if (row.kind !== 'past' && row.kind !== 'current') return sum
      const key = row.title || ''
      const cost = key ? rowCostMap[key] : undefined
      if (typeof cost === 'number') return sum + Number(cost)
      if (cost && typeof cost === 'object' && typeof cost.amount === 'number') return sum + Number(cost.amount)
      return sum
    }, 0)
  }, [rowCostMap, timelineRows])

  const budgetUtilization = useMemo(() => {
    if (!budgetAmount || budgetAmount <= 0) return 0
    return Math.min(100, Math.max(0, Math.round((coveredTripCost / budgetAmount) * 100)))
  }, [budgetAmount, coveredTripCost])

  const syncLabel = useMemo(() => {
    if (!syncEnabled) return 'Paused'
    if (syncShiftMinutes == null) return 'On Track'
    return syncShiftMinutes > 0 ? `${syncShiftMinutes}m Behind` : `${Math.abs(syncShiftMinutes)}m Ahead`
  }, [syncEnabled, syncShiftMinutes])

  const syncProgress = useMemo(() => {
    if (!syncEnabled) return 15
    if (syncShiftMinutes == null) return 85
    const distance = Math.min(60, Math.abs(syncShiftMinutes))
    return Math.max(15, 100 - Math.round((distance / 60) * 100))
  }, [syncEnabled, syncShiftMinutes])

  const profileWalkKm = useMemo(() => {
    const fromPreferences = Number(persistedDraft?.preferences?.locationPref?.walkKm)
    const fromPlan = Number(persistedDraft?.plan?.locationPref?.walkKm)
    if (Number.isFinite(fromPreferences) && fromPreferences > 0) return fromPreferences
    if (Number.isFinite(fromPlan) && fromPlan > 0) return fromPlan
    return 6
  }, [persistedDraft?.plan?.locationPref?.walkKm, persistedDraft?.preferences?.locationPref?.walkKm])

  const totalProfileWalkingKm = useMemo(() => {
    return Number((profileWalkKm * Math.max(1, totalTripDays)).toFixed(1))
  }, [profileWalkKm, totalTripDays])

  const liveInsightDistanceKm = useMemo(() => {
    const origin = liveLocation || selectedStartLocation
    if (!origin) return null

    const target = liveLocation
      ? activeRouteItem
      : orderedItems[0] || null

    if (!target || target.lat == null || target.lng == null) return null
    return getDistance(origin.lat, origin.lng, target.lat, target.lng)
  }, [activeRouteItem, liveLocation, orderedItems, selectedStartLocation])

  const walkingDistanceProgress = useMemo(() => {
    if (liveInsightDistanceKm == null || totalProfileWalkingKm <= 0) return 0
    return Math.min(100, Math.max(0, Math.round((liveInsightDistanceKm / totalProfileWalkingKm) * 100)))
  }, [liveInsightDistanceKm, totalProfileWalkingKm])

  useEffect(() => {
    const coveredSegments = timelineRows.filter((row) => row.kind === 'transition' && typeof row.endIndex === 'number' && row.endIndex <= activeRouteIndex)
    if (!coveredSegments.length) {
      setCoveredDistanceKm(null)
      return
    }

    const total = coveredSegments.reduce((sum, row) => sum + Number(row.segmentDistanceKm || 0), 0)
    setCoveredDistanceKm(Number(total.toFixed(1)))
  }, [activeRouteIndex, timelineRows])

  const mapCenter = useMemo(() => {
    if (liveLocation) return [liveLocation.lat, liveLocation.lng] as [number, number]
    if (activeRouteItem?.lat != null && activeRouteItem?.lng != null) return [activeRouteItem.lat, activeRouteItem.lng] as [number, number]
    return [12.9716, 77.5946] as [number, number]
  }, [activeRouteItem?.lat, activeRouteItem?.lng, liveLocation])

  const openFullPageMap = () => {
    navigate('/full-map', {
      state: {
        items: orderedItems,
        destination: city,
        mapMarkers: activeRouteItem?.lat != null && activeRouteItem?.lng != null
          ? [{ lat: activeRouteItem.lat, lng: activeRouteItem.lng, title: activeRouteItem.title || 'Destination' }]
          : [],
        routePoints: liveRoutePoints,
        startLocation: liveLocation ? { lat: liveLocation.lat, lng: liveLocation.lng, label: 'You are here' } : undefined,
      },
    })
  }

  const openSmartItinerary = () => {
    navigate('/smart-itinerary')
  }

  const resolveRowImage = (row?: TimelineRow | null, preferGoogle = false) => {
    if (!row) return getGooglePlaceImage('Place', city, city)
    const rowPhotoRef = row.photoReference || getPhotoReferenceFromUrl(row.image)
    const googleImage = getGooglePlaceImage(row.title, row.subtitle, city, row.lat, row.lng, row.placeId, rowPhotoRef)
    if (preferGoogle) return googleImage
    return row.image || (row.title ? rowImages[row.title] : undefined) || getDefaultPlaceImage(row.title, row.subtitle)
  }

  // Detect user's preferred currency from locale or fallback to JPY
  const { userCurrency, jpyToLocalRate } = useMemo(() => {
    const locale = (typeof navigator !== 'undefined' && (navigator.language || (navigator as any).languages?.[0])) || 'ja-JP'
    const region = (locale && locale.includes('-')) ? locale.split('-')[1].toUpperCase() : undefined

    const regionToCurrency: Record<string, string> = {
      US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', JP: 'JPY', IN: 'INR', CN: 'CNY', KR: 'KRW', SG: 'SGD', HK: 'HKD', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', SE: 'SEK'
    }

    const exchangeFromJpy: Record<string, number> = {
      JPY: 1,
      USD: 0.0064,
      EUR: 0.0059,
      GBP: 0.0048,
      INR: 0.58,
      CNY: 0.045,
      KRW: 9.5,
      AUD: 0.0098,
      CAD: 0.0086,
      SGD: 0.0086,
      HKD: 0.050,
      NZD: 0.010,
      SEK: 0.063,
    }

    const currency = region ? regionToCurrency[region] || 'JPY' : 'JPY'
    const rate = exchangeFromJpy[currency] ?? 1
    return { userCurrency: currency, jpyToLocalRate: rate }
  }, [])

  const [geoCountryCode, setGeoCountryCode] = useState<string | null>(null)
  const [geoCurrency, setGeoCurrency] = useState<string | null>(null)
  const [geoRate, setGeoRate] = useState<number | null>(null)

  async function fetchCountryCodeFromCoords(lat: number, lng: number) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&format=json&zoom=3&addressdetails=1`
      const res = await fetch(url, { headers: { 'User-Agent': 'Stellora-App' } })
      if (!res.ok) return null
      const data = await res.json()
      const cc = data?.address?.country_code?.toUpperCase() || null
      return cc
    } catch {
      return null
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!liveLocation) return
      const cc = await fetchCountryCodeFromCoords(liveLocation.lat, liveLocation.lng)
      if (cancelled) return
      if (!cc) {
        setGeoCountryCode(null)
        setGeoCurrency(null)
        setGeoRate(null)
        return
      }
      setGeoCountryCode(cc)
      const regionToCurrency: Record<string, string> = {
        US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', JP: 'JPY', IN: 'INR', CN: 'CNY', KR: 'KRW', SG: 'SGD', HK: 'HKD', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', SE: 'SEK'
      }
      const exchangeFromJpy: Record<string, number> = {
        JPY: 1,
        USD: 0.0064,
        EUR: 0.0059,
        GBP: 0.0048,
        INR: 0.58,
        CNY: 0.045,
        KRW: 9.5,
        AUD: 0.0098,
        CAD: 0.0086,
        SGD: 0.0086,
        HKD: 0.050,
        NZD: 0.010,
        SEK: 0.063,
      }
      const cur = regionToCurrency[cc] || 'JPY'
      setGeoCurrency(cur)
      setGeoRate(exchangeFromJpy[cur] ?? 1)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [liveLocation])

  const requestLiveLocation = () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocationError('Geolocation is not available in this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLiveLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationError('')
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Location permission denied. Enable location access and try again.')
          return
        }
        setLocationError('Unable to get your location right now. Please retry.')
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    )
  }

  useEffect(() => {
    if (!liveLocation) {
      setPreviewRowId(null)
      return
    }

    const closestRow = findClosestTimelineRow(timelineRows, liveLocation, getLocationThresholdKm(locationMatchMode))
    if (!closestRow) {
      setPreviewRowId(null)
      return
    }

    setPreviewRowId(`${closestRow.sourceIndex ?? timelineRows.indexOf(closestRow)}`)
  }, [liveLocation, locationMatchMode, timelineRows])

  useEffect(() => {
    let cancelled = false
    const rowsToHydrate = timelineRows.filter((row) => row.kind !== 'transition' && row.kind !== 'block' && row.title && !row.image && !rowImages[row.title])
    if (!rowsToHydrate.length) return undefined

    const run = async () => {
      const next: Record<string, string> = {}
      const detailsNext: Record<string, { crowdLevel?: string; rating?: number; reviews?: number }> = {}
      const costNext: Record<string, CostHint> = {}
      for (const row of rowsToHydrate) {
        try {
          const { details } = await getPlaceDetails(row.title || '', row.subtitle || city)
          const image = details?.image?.trim()
          if (image) next[row.title || ''] = image
          // capture crowd and rating hints if available
          const crowd = (details as any)?.crowdLevel || (details as any)?.crowd_level || undefined
          const rating = Number((details as any)?.rating || NaN)
          const reviews = Number((details as any)?.reviews || NaN)
          detailsNext[row.title || ''] = {
            crowdLevel: crowd,
            rating: Number.isFinite(rating) ? rating : undefined,
            reviews: Number.isFinite(reviews) ? reviews : undefined,
          }
          // Estimate cost in JPY for display. Prefer explicit priceLevel if present.
          const key = row.title || ''
          const hasPriceLevel = typeof row.priceLevel === 'number' && row.priceLevel > 0
          if ((details as any)?.priceHint && (details as any)?.priceHint.amount) {
            const ph = (details as any).priceHint
            // store exact hint as reported (amount + currency)
            costNext[key] = { amount: Number(ph.amount), currency: String(ph.currency || 'JPY') }
          } else if (hasPriceLevel) {
            const mapPriceLevelToYen = (pl: number) => {
              // rough mapping for display purposes
              if (pl <= 0) return 0
              if (pl === 1) return 600
              if (pl === 2) return 1200
              if (pl === 3) return 3000
              return 6000
            }
            costNext[key] = mapPriceLevelToYen(row.priceLevel as number)
          } else {
            // Heuristic based on details and category
            let base = 1200
            const cat = ((details as any)?.category || row.category || '').toLowerCase()
            if (cat.includes('fine') || cat.includes('fine dining') || cat.includes('luxury')) base = 3500
            else if (cat.includes('restaurant') || cat.includes('bistro') || cat.includes('dining')) base = 1200
            else if (cat.includes('cafe') || cat.includes('tea') || cat.includes('coffee')) base = 700
            else if (cat.includes('museum') || cat.includes('gallery') || cat.includes('heritage')) base = 800

            const ratingNum = Number((details as any)?.rating || 0)
            let multiplier = 1
            if (ratingNum >= 4.5) multiplier = 1.6
            else if (ratingNum >= 4.0) multiplier = 1.25
            else if (ratingNum >= 3.5) multiplier = 1.05
            else multiplier = 0.85

            const reviewsNum = Number((details as any)?.reviews || 0)
            if (reviewsNum > 500) multiplier *= 1.12

            const estimate = Math.max(100, Math.round(base * multiplier))
            costNext[key] = estimate
          }
        } catch {
          // Ignore lookup failures and fall back to the shared place-photo service.
          if (row.title) costNext[row.title] = 1200
        }
      }
      if (!cancelled && Object.keys(next).length) {
        setRowImages((prev) => ({ ...prev, ...next }))
      }
      if (!cancelled && Object.keys(detailsNext).length) {
        setRowDetailsMap((prev) => ({ ...prev, ...detailsNext }))
      }
      if (!cancelled && Object.keys(costNext).length) {
        setRowCostMap((prev) => ({ ...prev, ...costNext }))
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [city, rowImages, timelineRows])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!liveLocation || !activeRouteItem || activeRouteItem.lat == null || activeRouteItem.lng == null) {
        setLiveRoutePoints([])
        setLiveRouteDistanceKm(null)
        return
      }

      try {
        const route = await fetchLiveRoute(liveLocation, { lat: activeRouteItem.lat, lng: activeRouteItem.lng })
        if (cancelled) return
        if (route) {
          setLiveRoutePoints(route.geometry)
          setLiveRouteDistanceKm(route.distanceKm)
        } else {
          setLiveRoutePoints([])
          setLiveRouteDistanceKm(null)
        }
      } catch (error) {
        if (cancelled) return
        console.warn('Failed to fetch live route.', error)
        setLiveRoutePoints([])
        setLiveRouteDistanceKm(null)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [activeRouteItem, liveLocation])

  useEffect(() => {
    const items = orderedItems;
    if (items.length === 0) return;

    const getActiveIndex = () => {
      if (!items.length) return 0

      if (liveLocation) {
        let nearestIdx = -1
        let nearestDistance = Number.POSITIVE_INFINITY
        items.forEach((item: any, index: number) => {
          if (item.lat == null || item.lng == null) return
          const distance = getDistance(liveLocation.lat, liveLocation.lng, item.lat, item.lng)
          if (distance < nearestDistance) {
            nearestDistance = distance
            nearestIdx = index
          }
        })
        if (nearestIdx >= 0) return nearestIdx
      }

      const exactTimeMatches: number[] = []
      items.forEach((item: any, index: number) => {
        const start = parseTimeRangeStart(item.time)
        const end = parseTimeRangeEnd(item.time)
        if (start == null) return
        if (end == null) {
          if (Math.abs(start - clockMinutes) <= 30) exactTimeMatches.push(index)
          return
        }
        const wrappedEnd = end < start ? end + 24 * 60 : end
        const now = clockMinutes < start ? clockMinutes + 24 * 60 : clockMinutes
        if (now >= start && now <= wrappedEnd) exactTimeMatches.push(index)
      })

      if (exactTimeMatches.length) return exactTimeMatches[0]

      let nearestTimeIdx = 0
      let nearestTimeGap = Number.POSITIVE_INFINITY
      items.forEach((item: any, index: number) => {
        const start = parseTimeRangeStart(item.time)
        if (start == null) return
        const gap = Math.abs(start - clockMinutes)
        if (gap < nearestTimeGap) {
          nearestTimeGap = gap
          nearestTimeIdx = index
        }
      })
      return nearestTimeIdx
    }

    const buildRows = (closestIdx: number) => {
      setActiveRouteIndex(closestIdx)
      const rows: TimelineRow[] = [];
      const segmentDefaults: Record<string, TransportMode> = {}
      let previousBlock = ''
      const routeOrigin = selectedStartLocation || liveLocation
      items.forEach((item: any, index: number) => {
        const currentBlock = getTimeBlockLabel(item.time)
        if (currentBlock !== previousBlock) {
          rows.push({
            kind: 'block',
            text: currentBlock,
            block: currentBlock,
          })
          previousBlock = currentBlock
        }
        const prevPoint = index === 0 ? routeOrigin : items[index - 1]
        const hasPrevCoords = prevPoint && prevPoint.lat != null && prevPoint.lng != null
        const hasCurrentCoords = item.lat != null && item.lng != null
        if (hasPrevCoords && hasCurrentCoords) {
          const distanceKm = getDistance(Number(prevPoint.lat), Number(prevPoint.lng), Number(item.lat), Number(item.lng))
          const transport = getTransportEstimate(distanceKm)
          const segmentKey = getSegmentKey(index === 0 ? 'start' : index - 1, index)
          segmentDefaults[segmentKey] = segmentTransportModes[segmentKey] || transport.recommendedTransportMode
          const selectedMode = segmentDefaults[segmentKey]
          const segmentMinutes = transport.estimatedMinutesByMode[selectedMode]

          rows.push({
            kind: 'transition',
            icon: selectedMode === 'walk' ? 'directions_walk' : selectedMode === 'taxi' ? 'local_taxi' : selectedMode === 'public' ? 'directions_bus' : 'directions_bike',
            text: `${getTransportLabel(selectedMode)} • ${segmentMinutes} min • ${distanceKm.toFixed(1)} km`,
            segmentKey,
            endIndex: index,
            fromLabel: index === 0 ? (routeOrigin ? 'Start location' : 'Start') : (items[index - 1].title || items[index - 1].name || 'Previous stop'),
            toLabel: item.title || item.name || 'Next stop',
            segmentDistanceKm: Number(distanceKm.toFixed(1)),
            segmentMinutes,
            transportMode: selectedMode,
            recommendedTransportMode: transport.recommendedTransportMode,
          })
        }
        
        let kind: 'past' | 'current' | 'upcoming' = 'upcoming';
        if (index < closestIdx) kind = 'past';
        else if (index === closestIdx) kind = 'current';

        rows.push({
          kind,
          time: item.time || (item.durationMinutes ? `${item.durationMinutes} min` : 'Anytime'),
          title: item.title || item.name || 'Planned Stop',
          subtitle: item.location || city,
          done: kind === 'past',
          image: item.image || item.photoUrl,
          lat: item.lat,
          lng: item.lng,
          category: item.category,
          priceLevel: item.priceLevel,
          sourceIndex: index,
          block: currentBlock,
          placeId: item.placeId,
          photoReference: item.photoReference || getPhotoReferenceFromUrl(item.photoUrl || item.image),
        });
      });
      setSegmentTransportModes((prev) => ({ ...prev, ...segmentDefaults }))
      setTimelineRows(rows);
    };

    buildRows(getActiveIndex())
  }, [orderedItems, city, syncEnabled, liveLocation, clockMinutes])

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  function handleDragStart(sourceIndex: number) {
    setDraggedIndex(sourceIndex)
  }

  function handleDrop(targetIndex: number) {
    if (draggedIndex === null) return
    if (draggedIndex === targetIndex) { setDraggedIndex(null); return }
    setDraftItems((prev) => {
      const items = [...prev]
      const [moved] = items.splice(draggedIndex, 1)
      items.splice(targetIndex, 0, moved)
      return items
    })
    setDraggedIndex(null)
  }

  function renderTimeControls(row: TimelineRow, index: number) {
    if (!editEnabled || row.kind === 'transition' || row.sourceIndex === undefined) return null

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-full border border-white/10 bg-[#1f1f23] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white transition hover:bg-white/10"
          onClick={() => openTimeEditor(row.sourceIndex!, row.time)}
        >
          Change Time
        </button>
        {editingTimeIndex === row.sourceIndex && (
          <div className="flex items-center gap-2 rounded-full border border-[#434655]/20 bg-[#111115] px-3 py-1.5">
            <input
              autoFocus
              type="time"
              step={300}
              value={editingTimeValue}
              onChange={(event) => setEditingTimeValue(event.target.value)}
              className="min-w-[140px] bg-transparent text-[11px] text-white outline-none [color-scheme:dark]"
            />
            <button
              type="button"
              className="rounded-full bg-[#2563EB] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white"
              onClick={() => saveTimeChange(row.sourceIndex!)}
            >
              Save
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#c8c6c8]"
              onClick={cancelTimeEdit}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    )
  }

  function getCrowdLabel(row: TimelineRow) {
    // Prefer authoritative crowd level from place details if available
    const key = row.title || ''
    const details = rowDetailsMap[key]
    if (details?.crowdLevel) {
      const normalized = String(details.crowdLevel).toLowerCase()
      if (normalized.includes('high') || normalized.includes('peak') || normalized.includes('very')) return 'Crowd alert: High'
      if (normalized.includes('rising') || normalized.includes('increasing') || normalized.includes('moderate')) return 'Crowd alert: Rising'
      if (normalized.includes('busy') || normalized.includes('crowded')) return 'Crowd alert: Busy'
      if (normalized.includes('low') || normalized.includes('light') || normalized.includes('quiet')) return 'Crowd alert: Light'
    }

    // Use rating/reviews as a popularity hint combined with time-of-day
    const hour = Number((row.time || '').match(/\d{1,2}/)?.[0] || new Date().getHours())
    const rating = details?.rating || 0
    const reviews = details?.reviews || 0

    // High popularity places with many reviews are more likely busy during peak hours
    if ((rating >= 4.5 && reviews > 500) || reviews > 2000) {
      if (hour >= 9 && hour <= 21) return 'Crowd alert: High'
      return 'Crowd alert: Busy'
    }
    if (reviews > 200 || (rating >= 4.2 && reviews > 50)) {
      if (hour >= 11 && hour <= 15) return 'Crowd alert: Rising'
      if (hour >= 17 && hour <= 20) return 'Crowd alert: Busy'
    }

    // Default time-of-day heuristic
    if (hour >= 11 && hour <= 15) return 'Crowd alert: Rising'
    if (hour >= 17 && hour <= 20) return 'Crowd alert: Busy'
    return 'Crowd alert: Light'
  }

  function getDistanceLabel(row: TimelineRow) {
    if (row.kind === 'current' && liveRouteDistanceKm != null) return `${liveRouteDistanceKm.toFixed(1)} km route`
    if (liveLocation && row.lat != null && row.lng != null) return `${getDistance(liveLocation.lat, liveLocation.lng, row.lat, row.lng).toFixed(1)} km away`
    return row.kind === 'current' ? 'Active route' : 'Route unavailable'
  }

  function openTimeEditor(sourceIndex: number, currentTime?: string) {
    setEditingTimeIndex(sourceIndex)
    setEditingTimeTemplate(currentTime || '')
    setEditingTimeValue(parseDisplayTimeToClockValue(currentTime))
  }

  function saveTimeChange(sourceIndex: number) {
    const nextClockValue = editingTimeValue.trim() || '09:00'
    const nextStart = formatClockValueToDisplayTime(nextClockValue)
    const existingRange = editingTimeTemplate.includes('—') ? editingTimeTemplate.split('—')[1].trim() : editingTimeTemplate.includes('-') ? editingTimeTemplate.split('-')[1].trim() : ''
    const nextTime = existingRange ? `${nextStart} — ${existingRange}` : nextStart
    setDraftItems((prev) => {
      const updated = prev.map((item, index) => (index === sourceIndex ? { ...item, time: nextTime } : item))
      return sortTimelineItemsByTime(updated)
    })
    setEditingTimeIndex(null)
    setEditingTimeValue('')
    setEditingTimeTemplate('')
  }

  function cancelTimeEdit() {
    setEditingTimeIndex(null)
    setEditingTimeValue('')
    setEditingTimeTemplate('')
  }

  function applySyncAdjustment() {
    if (!syncEnabled || syncShiftMinutes === null || syncTargetTime === null) return

    setDraftItems((prev) => {
      const updated = prev.map((item) => {
        const itemStart = parseTimeRangeStart(item.time)
        if (itemStart == null || itemStart < syncTargetTime) return item
        return {
          ...item,
          time: shiftTimelineTimeValue(item.time, syncShiftMinutes),
        }
      })

      return sortTimelineItemsByTime(updated)
    })

    setSyncSuggestion('Itinerary updated to match your live location.')
    setSyncShiftMinutes(null)
    setSyncTargetTime(null)
  }

  useEffect(() => {
    if (!syncEnabled) return
    if (!liveLocation) {
      setSyncSuggestion('Waiting for live location access to compare your route against the itinerary.')
      setSyncShiftMinutes(null)
      setSyncTargetTime(null)
      return
    }

    const sorted = sortTimelineItemsByTime(draftItems)
    const nowMinutes = clockMinutes
    const upcomingIndex = sorted.findIndex((item) => {
      const itemStart = parseTimeRangeStart(item.time)
      return itemStart != null && itemStart >= nowMinutes
    })
    const targetIndex = upcomingIndex >= 0 ? upcomingIndex : 0
    const target = sorted[targetIndex]
    if (!target || target.lat == null || target.lng == null) {
      setSyncSuggestion('Live sync is active, but the current stop needs coordinates to compute a route change.')
      setSyncShiftMinutes(null)
      setSyncTargetTime(null)
      return
    }

    const distanceKm = getDistance(liveLocation.lat, liveLocation.lng, target.lat, target.lng)
    const travelMinutes = (distanceKm / 4.2) * 60
    const targetTime = parseTimeRangeStart(target.time)
    if (targetTime == null) {
      setSyncSuggestion('Live sync is active, but this stop has no schedulable time.')
      setSyncShiftMinutes(null)
      setSyncTargetTime(null)
      return
    }

    const gapMinutes = Math.round(targetTime - nowMinutes - travelMinutes)
    if (gapMinutes > 30) {
      setSyncSuggestion(`You are about ${gapMinutes} minutes ahead. Move the next stops earlier to save fuel and keep the pace.`)
      setSyncShiftMinutes(-30)
      setSyncTargetTime(targetTime)
    } else if (gapMinutes < -30) {
      setSyncSuggestion(`You are about ${Math.abs(gapMinutes)} minutes behind. Push the remaining stops later so the itinerary stays realistic.`)
      setSyncShiftMinutes(30)
      setSyncTargetTime(targetTime)
    } else {
      setSyncSuggestion('You are on schedule. Auto Sync has no changes to apply right now.')
      setSyncShiftMinutes(null)
      setSyncTargetTime(null)
    }
  }, [draftItems, liveLocation, syncEnabled, clockMinutes])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockMinutes(getCurrentClockMinutes())
    }, 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLiveLocation(null)
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLiveLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationError('')
      },
      (error) => {
        setLiveLocation(null)
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Location permission denied. Enable location access and retry.')
          return
        }
        setLocationError('Unable to get live location. Please retry.')
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  useEffect(() => {
    if (editEnabled) return
    setDraftItems((prev) => sortTimelineItemsByTime(prev))
  }, [editEnabled])
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0B0B0F] text-[#E4E1E7]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@500;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }

        .aurora-glow {
          background: radial-gradient(600px circle at 50% 0%, rgba(37, 99, 235, 0.08), transparent);
        }

        .aurora-gradient {
          background: linear-gradient(135deg, #2563EB 0%, #06B6D4 100%);
        }

        .glass-card {
          background: rgba(53, 52, 57, 0.4);
          backdrop-filter: blur(12px);
        }

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

        details > summary::-webkit-details-marker {
          display: none;
        }
      `}</style>

      <TripArcNav />

      <div className="flex min-h-screen flex-col pt-0">
        <section className="sticky top-20 z-40 w-full border-b border-white/5 bg-[#1C1C1E]/80 backdrop-blur-md" />

        <main className="aurora-glow mx-auto w-full max-w-[1600px] flex-grow p-8 pb-24 lg:p-12 lg:pb-12">
          <header className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="mb-2 font-headline text-5xl font-extrabold tracking-tighter text-white lg:text-6xl">{city} OnTrip Live</h1>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-2 rounded-full bg-[#2a292e] px-3 py-1 text-xs font-bold text-[#b4c5ff]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#22C55E]" />On Track — Day {currentDayNumber} of {totalTripDays}
                </span>
                <span className="text-sm font-medium text-[#c8c6c8]">{liveDateLabel}</span>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="min-w-[120px] rounded-2xl border border-[#434655]/10 bg-[#1b1b1f] p-4 text-center">
                <span className="mb-1 block text-xs text-[#c8c6c8]">Energy</span>
                <span className="font-headline text-2xl font-bold text-[#F59E0B]">{energyScore}%</span>
              </div>
              <div className="min-w-[120px] rounded-2xl border border-[#434655]/10 bg-[#1b1b1f] p-4 text-center">
                <span className="mb-1 block text-xs text-[#c8c6c8]">Budget</span>
                <span className="font-headline text-2xl font-bold text-white">{budgetDisplay}</span>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="space-y-8 lg:col-span-8">
              <section className="space-y-0">
                <h3 className="mb-10 flex w-full items-center justify-between font-headline text-xl font-bold text-white">
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-2xl text-[#b4c5ff]">schedule</span>Today's Timeline</div>
                  <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 rounded-full border border-[#434655]/10 bg-[#1b1b1f] px-4 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#c8c6c8]">Sync</span>
                      <label className="relative inline-flex scale-75 cursor-pointer items-center">
                        <input className="peer sr-only" type="checkbox" checked={syncEnabled} onChange={(e) => setSyncEnabled(e.target.checked)} />
                        <div className="h-5 w-9 rounded-full bg-[#353439] after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#2563EB] peer-checked:after:translate-x-4" />
                      </label>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-[#434655]/10 bg-[#1b1b1f] px-4 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#c8c6c8]">Edit</span>
                      <label className="relative inline-flex scale-75 cursor-pointer items-center">
                        <input className="peer sr-only" type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} />
                        <div className="h-5 w-9 rounded-full bg-[#353439] after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#2563EB] peer-checked:after:translate-x-4" />
                      </label>
                    </div>
                  </div>
                </h3>

                {timelineRows.map((row, index) => {
                  const rowId = `${row.sourceIndex ?? index}`
                  const isExpanded = row.kind === 'current' || previewRowId === rowId

                  if (row.kind === 'block') {
                    return (
                      <div key={`block-${index}`} className="relative border-l border-[#434655]/20 py-4 pl-10">
                        <div className="inline-flex rounded-full border border-[#434655]/20 bg-[#111115] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#b4c5ff]">
                          {row.text}
                        </div>
                      </div>
                    )
                  }

                  if (row.kind === 'transition') {
                    return (
                      <div key={`transition-${index}`} className="relative border-l border-[#434655]/20 py-6 pl-10">
                        <div className="rounded-2xl border border-[#434655]/15 bg-[#1f1f23] px-4 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 text-sm font-medium text-gray-500">
                              <span className="material-symbols-outlined text-lg">{row.icon}</span>
                              <span>{row.fromLabel || 'Start'} → {row.toLabel || 'Next stop'}</span>
                            </div>
                            <span className="rounded-full border border-[#2563EB]/25 bg-[#2563EB]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#b4c5ff]">
                              {row.recommendedTransportMode === 'walk' ? 'Recommended: Walk' : `Recommended: ${getTransportLabel(row.recommendedTransportMode || 'walk')}`}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#c3c6d7]">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-white">{row.text}</span>
                              <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[#c8c6c8]">
                                {row.segmentDistanceKm != null ? `${row.segmentDistanceKm.toFixed(1)} km` : '—'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {(['walk', 'taxi', 'public', 'cycle'] as TransportMode[]).map((mode) => {
                                const isActive = row.segmentKey ? segmentTransportModes[row.segmentKey] === mode : false
                                const isRecommended = row.recommendedTransportMode === mode
                                return (
                                  <button
                                    key={`${row.segmentKey || index}-${mode}`}
                                    type="button"
                                    onClick={() => {
                                      if (!row.segmentKey) return
                                      setSegmentTransportModes((prev) => ({ ...prev, [row.segmentKey as string]: mode }))
                                    }}
                                    className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                                      isActive
                                        ? 'border-[#b4c5ff]/40 bg-[#b4c5ff]/15 text-[#e7edff]'
                                        : isRecommended
                                          ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#bbf7d0]'
                                          : 'border-white/10 bg-white/5 text-[#c8c6c8] hover:bg-white/10'
                                    }`}
                                  >
                                    {getTransportLabel(mode)}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  if (row.kind === 'current') {
                    return (
                      <div
                        key={`current-${index}`}
                        className="relative border-l border-blue-600/50 pb-8 pl-10"
                        draggable={editEnabled}
                        onDragStart={() => (row as any).sourceIndex !== undefined && handleDragStart((row as any).sourceIndex)}
                        onDragOver={(e) => editEnabled && e.preventDefault()}
                        onDrop={() => (row as any).sourceIndex !== undefined && handleDrop((row as any).sourceIndex)}
                      >
                        <div className="aurora-gradient absolute -left-[10px] top-0 h-[21px] w-[21px] rounded-full ring-4 ring-[#0B0B0F]" />
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-bold uppercase tracking-widest text-[#b4c5ff]">{row.time}</span>
                            <h4 className="mt-1 text-2xl font-bold text-white">{row.title}</h4>
                            <p className="mt-1 text-sm text-[#c8c6c8]">{row.subtitle}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="rounded-lg bg-blue-500/10 px-4 py-1.5 text-xs font-bold uppercase text-[#b4c5ff]">Active Now</div>
                            {row.done && <span className="material-symbols-outlined text-2xl text-[#22C55E]">check_circle</span>}
                            {renderTimeControls(row, index)}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="glass-card mt-5 rounded-[2.5rem] border border-[#b4c5ff]/20 p-8 shadow-2xl">
                            <div className="mb-6 flex items-start justify-between">
                              <div>
                                <span className="text-xs font-bold uppercase tracking-widest text-[#b4c5ff]">{row.time}</span>
                                <h4 className="mt-1 text-3xl font-bold text-white">{row.title}</h4>
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="material-symbols-outlined text-sm text-[#c8c6c8]">location_on</span>
                                  <span className="text-sm text-[#c8c6c8]">{row.subtitle}</span>
                                </div>
                              </div>
                              <div className="rounded-lg bg-blue-500/10 px-4 py-1.5 text-xs font-bold uppercase text-[#b4c5ff]">Active Now</div>
                            </div>
                            <div className="relative mb-6 h-64 w-full overflow-hidden rounded-3xl">
                              <img
                                alt={row.title || 'Place'}
                                className="h-full w-full object-cover"
                                src={resolveRowImage(row, true)}
                              />
                            </div>
                            <div className="flex items-center justify-between text-base">
                              <div className="flex items-center gap-3 text-[#c8c6c8]"><span className="material-symbols-outlined">directions_walk</span><span className="font-medium">{getDistanceLabel(row)}</span></div>
                              {(() => {
                                const key = row.title || ''
                                const cost = key ? rowCostMap[key] : undefined
                                if (cost != null) {
                                  // If cost is an object with explicit currency, show it directly
                                  if (typeof cost === 'object' && (cost as any).amount != null) {
                                    const c = cost as { amount: number; currency: string }
                                    return (
                                      <div className="flex items-center gap-3 text-[#c8c6c8]">
                                        <span className="material-symbols-outlined">payments</span>
                                        <div className="flex items-baseline gap-2">
                                          <span className="font-medium">{new Intl.NumberFormat(undefined, { style: 'currency', currency: c.currency, maximumFractionDigits: 0 }).format(Math.round(c.amount))}</span>
                                          <span className="text-xs text-[#9aa0b4]">{c.currency}</span>
                                        </div>
                                      </div>
                                    )
                                  }

                                  // Otherwise assume numeric value is JPY and convert to detected currency
                                  const numeric = Number(cost)
                                  const finalCurrency = geoCurrency || userCurrency
                                  const finalRate = (geoRate ?? jpyToLocalRate) || 1
                                  const converted = Math.round(numeric * finalRate)
                                  return (
                                    <div className="flex items-center gap-3 text-[#c8c6c8]">
                                      <span className="material-symbols-outlined">payments</span>
                                      <div className="flex items-baseline gap-2">
                                        <span className="font-medium">{new Intl.NumberFormat(undefined, { style: 'currency', currency: finalCurrency, maximumFractionDigits: 0 }).format(converted)}</span>
                                        <span className="text-xs text-[#9aa0b4]">{finalCurrency}</span>
                                      </div>
                                    </div>
                                  )
                                }

                                if (row.priceLevel !== undefined && row.priceLevel > 0) {
                                  return (
                                    <div className="flex items-center gap-3 text-[#c8c6c8]">
                                      <span className="material-symbols-outlined">payments</span>
                                      <span className="font-medium">{`Est. Price: ${'$'.repeat(row.priceLevel)}`}</span>
                                    </div>
                                  )
                                }

                                return (
                                  <div className="flex items-center gap-3 text-[#c8c6c8]">
                                    <span className="material-symbols-outlined">payments</span>
                                    <span className="font-medium">Est. ¥1,200</span>
                                  </div>
                                )
                              })()}
                              <div className="flex items-center gap-3 text-[#EF4444]"><span className="material-symbols-outlined">warning</span><span className="font-medium">{getCrowdLabel(row)}</span></div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div
                      key={`item-${index}`}
                      className="relative border-l border-[#434655]/20 pb-8 pl-10"
                      draggable={editEnabled}
                      onDragStart={() => (row as any).sourceIndex !== undefined && handleDragStart((row as any).sourceIndex)}
                      onDragOver={(e) => editEnabled && e.preventDefault()}
                      onDrop={() => (row as any).sourceIndex !== undefined && handleDrop((row as any).sourceIndex)}
                    >
                      <div className={`absolute -left-[5px] top-0 h-[11px] w-[11px] rounded-full ${row.kind === 'past' ? 'bg-[#c8c6c8]' : 'bg-[#434655]'}`} />
                      <div className="flex items-start justify-between">
                        <div className={row.kind === 'past' ? 'opacity-50' : ''}>
                          <span className="text-xs font-bold uppercase tracking-widest text-[#c8c6c8]">{row.time}</span>
                          <h4 className="mt-1 text-2xl font-bold text-white">{row.title}</h4>
                          <p className="mt-1 text-sm text-[#c8c6c8]">{row.subtitle}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {row.done && <span className="material-symbols-outlined text-2xl text-[#22C55E]">check_circle</span>}
                          {row.badge && (
                            <div className="flex items-center gap-2 rounded-full border border-[#434655]/10 bg-[#1f1f23] px-4 py-2">
                              <span className="material-symbols-outlined text-sm text-[#F59E0B]">bolt</span>
                              <span className="text-xs font-bold text-[#c8c6c8]">{row.badge}</span>
                            </div>
                          )}
                          {renderTimeControls(row, index)}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="glass-card mt-5 rounded-[2.5rem] border border-[#b4c5ff]/20 p-8 shadow-2xl">
                          <div className="mb-6 flex items-start justify-between">
                            <div>
                              <span className="text-xs font-bold uppercase tracking-widest text-[#b4c5ff]">{row.time}</span>
                              <h4 className="mt-1 text-3xl font-bold text-white">{row.title}</h4>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm text-[#c8c6c8]">location_on</span>
                                <span className="text-sm text-[#c8c6c8]">{row.subtitle}</span>
                              </div>
                            </div>
                            <div className="rounded-lg bg-blue-500/10 px-4 py-1.5 text-xs font-bold uppercase text-[#b4c5ff]">Active Now</div>
                          </div>
                          <div className="relative mb-6 h-64 w-full overflow-hidden rounded-3xl">
                            <img
                              alt={row.title || 'Place'}
                              className="h-full w-full object-cover"
                              src={resolveRowImage(row, true)}
                            />
                          </div>
                          <div className="flex items-center justify-between text-base">
                            <div className="flex items-center gap-3 text-[#c8c6c8]"><span className="material-symbols-outlined">directions_walk</span><span className="font-medium">{getDistanceLabel(row)}</span></div>
                            {row.category && (row.category.toLowerCase().includes('food') || row.category.toLowerCase().includes('restaurant')) ? (
                              <div className="flex items-center gap-3 text-[#c8c6c8]">
                                <span className="material-symbols-outlined">payments</span>
                                <span className="font-medium">
                                  {row.priceLevel !== undefined && row.priceLevel > 0 ? `Est. Price: ${'$'.repeat(row.priceLevel)}` : 'Pricing Unavailable'}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 text-[#c8c6c8]">
                                <span className="material-symbols-outlined">payments</span>
                                <span className="font-medium">Est. ¥1,200</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3 text-[#EF4444]"><span className="material-symbols-outlined">warning</span><span className="font-medium">{getCrowdLabel(row)}</span></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!orderedItems.length && (
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[#c3c6d7]">
                    No real timeline data is available yet. Generate or save a draft in Timeline first.
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-10 lg:col-span-4">
              <div className="bg-surface-container-high rounded-[2.5rem] p-8 border border-outline-variant/5 shadow-xl">
                <h4 className="text-white text-lg font-bold mb-8 font-headline">Live Insights</h4>
                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-secondary uppercase tracking-widest">Walking Distance</span>
                      <span className="text-white">
                        {coveredDistanceKm != null ? `${coveredDistanceKm.toFixed(1)} / ${totalProfileWalkingKm.toFixed(1)} km` : `0.0 / ${totalProfileWalkingKm.toFixed(1)} km`}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-surface-container-lowest rounded-full overflow-hidden">
                      <div className="h-full aurora-gradient rounded-full" style={{ width: `${totalProfileWalkingKm > 0 ? Math.min(100, Math.max(0, Math.round(((coveredDistanceKm || 0) / totalProfileWalkingKm) * 100))) : 0}%` }} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-secondary uppercase tracking-widest">Budget Utilization</span>
                      <span className="text-white">{budgetAmount > 0 ? `${budgetUtilization}%` : 'N/A'}</span>
                    </div>
                    <div className="w-full h-2 bg-surface-container-lowest rounded-full overflow-hidden">
                      <div className="h-full bg-[#22C55E] rounded-full" style={{ width: `${budgetAmount > 0 ? budgetUtilization : 0}%` }} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-secondary uppercase tracking-widest">Schedule Sync</span>
                      <span className={syncEnabled ? 'text-[#22C55E]' : 'text-secondary'}>{syncLabel}</span>
                    </div>
                    <div className="w-full h-2 bg-surface-container-lowest rounded-full overflow-hidden">
                      <div className="h-full bg-[#22C55E] rounded-full" style={{ width: `${syncProgress}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative rounded-[2.5rem] border border-[#434655]/10 bg-[#1b1b1f] p-8 shadow-2xl">
                <div className="mb-8 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="aurora-gradient flex h-12 w-12 items-center justify-center rounded-2xl">
                      <span className="material-symbols-outlined text-2xl text-white" style={{ fontVariationSettings: '"FILL" 1' }}>timer</span>
                    </div>
                    <h3 className="flex items-center font-headline text-lg font-bold text-white">Schedule Tracker<span className="material-symbols-outlined ml-1 text-sm opacity-50">expand_more</span></h3>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-1.5">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter text-blue-500">Live</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className={`glass-card rounded-[2rem] border p-6 ${syncEnabled ? 'border-[#b4c5ff]/20 bg-blue-500/5' : 'border-white/10 bg-white/5 opacity-70'}`}>
                    <div className="mb-5 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b4c5ff]">Schedule Tracker</span>
                      <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-bold ${syncEnabled ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-white/10 text-[#c8c6c8]'}`}>
                        {syncEnabled ? 'Auto Sync On' : 'Auto Sync Off'}
                      </span>
                    </div>
                    <div className="mb-6 flex items-center gap-4">
                      <div className="h-1.5 flex-grow overflow-hidden rounded-full bg-[#353439]">
                        <div className={`h-full rounded-full shadow-[0_0_15px_rgba(37,99,235,0.4)] ${syncEnabled ? 'aurora-gradient w-[85%]' : 'bg-white/20 w-[15%]'}`} />
                      </div>
                      <span className="text-xs font-bold text-[#c8c6c8]">{syncEnabled ? 'Live' : 'Paused'}</span>
                    </div>
                    {!syncEnabled ? (
                      <p className="text-sm font-medium leading-relaxed text-[#E4E1E7]/80">
                        Sync is disabled, so live updates and automatic itinerary changes are paused.
                      </p>
                    ) : (
                      <>
                        <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-[#b4c5ff]">
                          <span>Live Location</span>
                          <span>{liveLocation ? `${liveLocation.lat.toFixed(4)}, ${liveLocation.lng.toFixed(4)}` : 'Waiting for GPS'}</span>
                        </div>
                        <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-[#b4c5ff]">
                          <span>Current Time</span>
                          <span>{formatMinutesToDisplayTime(clockMinutes)}</span>
                        </div>
                        <div className="mb-3 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#b4c5ff]">
                          <span>Expand Match</span>
                          <div className="flex items-center gap-2">
                            {(['exact', '5m', '20m'] as LocationMatchMode[]).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setLocationMatchMode(mode)}
                                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                                  locationMatchMode === mode
                                    ? 'bg-[#2563EB]/20 text-[#b4c5ff] border border-[#2563EB]/40'
                                    : 'bg-white/5 text-[#c8c6c8] border border-white/10 hover:bg-white/10'
                                }`}
                              >
                                {mode === 'exact' ? 'Exact' : mode}
                              </button>
                            ))}
                          </div>
                        </div>
                        {locationError && (
                          <p className="mb-3 text-xs text-amber-200">{locationError}</p>
                        )}
                        <h4 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#b4c5ff]">Efficiency Suggestion</h4>
                        <p className="text-sm font-medium leading-relaxed text-[#E4E1E7]">{syncSuggestion || 'Move around and the tracker will compare your location with the itinerary.'}</p>
                        <div className="mt-6 flex gap-4">
                          <button
                            className="flex-1 rounded-2xl bg-[#b4c5ff] py-3 text-xs font-bold uppercase tracking-wider text-[#002a78] disabled:opacity-50"
                            disabled={syncShiftMinutes === null || syncTargetTime === null}
                            onClick={applySyncAdjustment}
                          >
                            Apply
                          </button>
                          <button
                            className="flex-1 rounded-2xl border border-white/5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:bg-white/5"
                            onClick={() => {
                              setSyncSuggestion('')
                              setSyncShiftMinutes(null)
                              setSyncTargetTime(null)
                            }}
                          >
                            Dismiss
                          </button>
                          <button
                            className="flex-1 rounded-2xl border border-[#2563EB]/30 py-3 text-xs font-bold uppercase tracking-wider text-[#b4c5ff] transition-all hover:bg-[#2563EB]/10"
                            onClick={requestLiveLocation}
                          >
                            Retry GPS
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-[2.5rem] border border-[#434655]/10 bg-[#1b1b1f] p-6 shadow-2xl">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b4c5ff]">Live Route Map</p>
                        <h4 className="mt-1 text-lg font-bold text-white">Current location to active stop</h4>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">
                        {liveRouteDistanceKm != null ? `${liveRouteDistanceKm.toFixed(1)} km` : '—'}
                      </div>
                    </div>
                    <div className="mb-4 grid gap-3 md:grid-cols-2">
                      {/* Current Location and Destination panels removed as requested */}
                    </div>
                    <div
                      className="relative h-[360px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#05070a]"
                      onClick={openFullPageMap}
                    >
                      <div className="absolute inset-0 z-0">
                        <LeafletMap
                          center={mapCenter}
                          zoom={liveLocation ? 15 : 14}
                          startMarker={liveLocation ? { lat: liveLocation.lat, lng: liveLocation.lng, title: 'You are here' } : undefined}
                          currentLocation={liveLocation ? { lat: liveLocation.lat, lng: liveLocation.lng, title: 'Your current location', accuracy: undefined } : undefined}
                          markers={activeRouteItem?.lat != null && activeRouteItem?.lng != null ? [{ lat: activeRouteItem.lat, lng: activeRouteItem.lng, title: activeRouteItem.title || 'Destination' }] : []}
                          route={liveRoutePoints}
                        />
                      </div>
                      <div
                        className="absolute inset-0 z-[5] cursor-pointer bg-gradient-to-t from-black/55 via-black/10 to-transparent pointer-events-auto"
                        onClick={(e) => {
                          e.stopPropagation()
                          openSmartItinerary()
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            openSmartItinerary()
                          }
                        }}
                        aria-label="Open Smart Itinerary"
                      />
                      {!liveLocation && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[#c3c6d7] backdrop-blur-[1px]">
                          <p>{locationError || 'Allow location access to see your current route.'}</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              requestLiveLocation()
                            }}
                            className="rounded-full border border-[#2563EB]/30 bg-[#2563EB]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#b4c5ff] transition hover:bg-[#2563EB]/20"
                          >
                            Enable GPS
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openFullPageMap()
                        }}
                        className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-black/70"
                      >
                        Open full map
                      </button>
                    </div>
                    {/* Blue line explanatory note removed */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-3xl border-t border-white/5 bg-[#0B0B0F]/80 px-4 py-3 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] backdrop-blur-lg md:hidden">
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform active:scale-90"><span className="material-symbols-outlined">explore</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Explore</span></button>
        <button className="flex flex-col items-center justify-center rounded-xl bg-blue-500/10 px-4 py-2 text-blue-500 transition-transform active:scale-90"><span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>map</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">My Trips</span></button>
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform active:scale-90" onClick={() => navigate('/bucketlist')}><span className="material-symbols-outlined">place</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Places</span></button>
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform active:scale-90"><span className="material-symbols-outlined">smart_toy</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Concierge</span></button>
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform active:scale-90"><span className="material-symbols-outlined">person</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Account</span></button>
      </nav>

      <button className="aurora-gradient fixed bottom-24 right-8 z-40 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-2xl transition-all active:scale-90 hover:scale-110 lg:hidden" onClick={() => navigate('/triparc/7pillars')}>
        <span className="material-symbols-outlined text-3xl">add</span>
      </button>
    </div>
  )
}
