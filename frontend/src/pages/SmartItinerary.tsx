import { useEffect, useMemo, useRef, useState } from 'react'
import TripArcNav from '../components/TripArcNav'
import LeafletMap from '../components/LeafletMap'

type SmartTimelineCard = {
  time: string
  energy: string
  energyClass: string
  title: string
  description: string
  active: boolean
  lat?: number
  lng?: number
}

type TimelineItem = {
  time?: string
  title?: string
  name?: string
  location?: string
  durationMinutes?: number
  lat?: number
  lng?: number
}

type NearbyRecommendation = {
  name: string
  category?: string
  address?: string
  why?: string
  lat?: number
  lng?: number
  isNearby?: boolean
}

const JOURNEY_DRAFT_STORAGE_KEY = 'triparc:journey:draft:v1'

function readJourneyDraft(): { city?: string; items?: TimelineItem[] } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(JOURNEY_DRAFT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
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

function sortTimelineItemsByTime(items: TimelineItem[]) {
  return [...items].sort((a, b) => {
    const aTime = parseTimeToMinutes(a?.time)
    const bTime = parseTimeToMinutes(b?.time)
    if (aTime !== bTime) return aTime - bTime
    return String(a?.title || a?.name || '').localeCompare(String(b?.title || b?.name || ''))
  })
}

function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radiusKm = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatRecommendationCategory(category?: string) {
  const normalized = String(category || 'Attraction').toLowerCase()
  if (normalized.includes('food')) return 'Food'
  if (normalized.includes('museum')) return 'Museum'
  if (normalized.includes('heritage')) return 'Heritage'
  if (normalized.includes('nature')) return 'Nature'
  if (normalized.includes('amusement')) return 'Amusement'
  if (normalized.includes('culture')) return 'Cultural'
  return 'Attraction'
}

function GoldenPavilionArtwork() {
  return (
    <svg viewBox="0 0 480 360" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="skyA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9cc9e4" />
          <stop offset="55%" stopColor="#d9e5d8" />
          <stop offset="100%" stopColor="#8bc0cb" />
        </linearGradient>
        <linearGradient id="goldA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe08a" />
          <stop offset="100%" stopColor="#c48a1d" />
        </linearGradient>
      </defs>
      <rect width="480" height="360" fill="url(#skyA)" />
      <path d="M0 220 Q40 205 75 214 T160 218 T240 214 T330 220 T420 214 T480 220 V360 H0 Z" fill="#8fb7a5" opacity="0.45" />
      <path d="M0 245 Q55 232 115 240 T230 246 T345 242 T480 248 V360 H0 Z" fill="#96c4c8" opacity="0.6" />
      <ellipse cx="242" cy="302" rx="150" ry="34" fill="#5e9aa0" opacity="0.25" />
      <rect x="119" y="94" width="256" height="156" rx="10" fill="#1b1a16" opacity="0.2" />
      <rect x="136" y="106" width="224" height="18" rx="4" fill="#2d2418" />
      <path d="M128 124 H352 L372 150 H108 Z" fill="url(#goldA)" />
      <path d="M150 148 H330 V190 H150 Z" fill="#deaf39" />
      <path d="M142 188 H338 V203 H142 Z" fill="#9b6f16" />
      <path d="M154 203 H326 V222 H154 Z" fill="#e8bf48" />
      <path d="M172 125 H308 L296 144 H184 Z" fill="#f4cf67" />
      <path d="M148 145 H332" stroke="#7d5915" strokeWidth="6" strokeLinecap="round" />
      <path d="M160 171 H320" stroke="#7d5915" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
      <path d="M164 214 H316" stroke="#6d4b13" strokeWidth="4" strokeLinecap="round" opacity="0.85" />
      <rect x="140" y="222" width="28" height="42" fill="#31251b" />
      <rect x="189" y="222" width="28" height="42" fill="#31251b" />
      <rect x="263" y="222" width="28" height="42" fill="#31251b" />
      <rect x="312" y="222" width="28" height="42" fill="#31251b" />
      <rect x="126" y="264" width="228" height="20" fill="#604420" opacity="0.9" />
      <rect x="118" y="284" width="244" height="10" fill="#8dc3c9" opacity="0.45" />
      <path d="M118 294 C165 287 194 286 240 286 C286 286 320 288 362 294 C323 308 282 315 240 315 C198 315 156 309 118 294 Z" fill="#bfe6e0" opacity="0.72" />
      <path d="M124 300 C166 296 196 295 240 295 C284 295 316 297 356 300 C317 307 280 312 240 312 C200 312 164 308 124 300 Z" fill="#6aa1a5" opacity="0.7" />
      <path d="M137 303 C175 300 206 299 240 299 C274 299 305 301 343 303" stroke="#eaf5f3" strokeWidth="3" opacity="0.6" />
      <circle cx="79" cy="66" r="14" fill="#ffffff" opacity="0.7" />
      <circle cx="90" cy="58" r="22" fill="#ffffff" opacity="0.12" />
      <circle cx="378" cy="60" r="12" fill="#ffffff" opacity="0.55" />
      <circle cx="394" cy="72" r="18" fill="#ffffff" opacity="0.1" />
    </svg>
  )
}

function HiddenTempleArtwork() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="templeSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#20354a" />
          <stop offset="100%" stopColor="#0f1418" />
        </linearGradient>
        <linearGradient id="templeGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe39d" />
          <stop offset="100%" stopColor="#c48a1d" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="14" fill="url(#templeSky)" />
      <path d="M0 78 Q20 70 40 74 T80 75 T120 78 V120 H0 Z" fill="#254b48" opacity="0.7" />
      <path d="M8 82 Q32 74 60 76 Q88 78 112 82 V120 H8 Z" fill="#1b3637" opacity="0.85" />
      <rect x="25" y="36" width="70" height="36" rx="4" fill="#23201b" opacity="0.9" />
      <path d="M18 40 H102 L96 51 H24 Z" fill="url(#templeGold)" />
      <rect x="30" y="51" width="60" height="10" fill="#f0c74e" />
      <rect x="28" y="60" width="64" height="8" fill="#8a6115" />
      <rect x="36" y="68" width="8" height="18" fill="#3a2c1b" />
      <rect x="50" y="68" width="8" height="18" fill="#3a2c1b" />
      <rect x="64" y="68" width="8" height="18" fill="#3a2c1b" />
      <rect x="78" y="68" width="8" height="18" fill="#3a2c1b" />
      <circle cx="91" cy="25" r="4" fill="#ffc24a" />
      <circle cx="99" cy="28" r="1.8" fill="#d5f0ff" opacity="0.8" />
    </svg>
  )
}

function MatchaArtwork() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="matchaGlow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#e8f4b5" />
          <stop offset="100%" stopColor="#5f7b2f" />
        </radialGradient>
      </defs>
      <rect width="120" height="120" rx="16" fill="#0e140f" />
      <circle cx="60" cy="62" r="33" fill="#23321b" />
      <circle cx="60" cy="60" r="22" fill="url(#matchaGlow)" />
      <path d="M37 64 Q60 46 83 64 Q78 83 60 86 Q42 83 37 64 Z" fill="#b7cc67" opacity="0.7" />
      <ellipse cx="60" cy="67" rx="21" ry="6" fill="#f4f0da" opacity="0.95" />
      <path d="M35 88 Q60 95 85 88 L78 103 Q60 110 42 103 Z" fill="#c9d1b1" />
      <path d="M42 91 Q60 96 78 91" stroke="#78903a" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <circle cx="56" cy="56" r="4" fill="#ffffff" opacity="0.4" />
    </svg>
  )
}

function AvatarArtwork() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="avatarSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9ad0e2" />
          <stop offset="100%" stopColor="#dee8ed" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="60" fill="#0f1723" />
      <circle cx="60" cy="60" r="58" fill="url(#avatarSky)" />
      <path d="M12 75 Q30 56 49 61 T88 60 T108 68 V120 H12 Z" fill="#4b6c4e" />
      <path d="M22 71 Q43 49 64 53 T100 51" stroke="#f8d07a" strokeWidth="8" strokeLinecap="round" />
      <path d="M26 80 H94" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.65" />
      <circle cx="54" cy="56" r="15" fill="#f4c7a1" />
      <path d="M43 84 Q54 74 68 84 V102 H43 Z" fill="#233446" />
      <circle cx="54" cy="56" r="20" fill="#1a232f" opacity="0.3" />
      <path d="M42 47 Q54 34 68 46 Q73 57 70 66 Q61 60 53 60 Q45 60 39 65 Q37 56 42 47 Z" fill="#3a2d23" />
    </svg>
  )
}

export default function SmartItineraryPage() {
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState('Waiting for GPS')
  const [nearbyRecommendation, setNearbyRecommendation] = useState<NearbyRecommendation | null>(null)
  const [recommendationLoading, setRecommendationLoading] = useState(false)
  const [focusedStopIndex, setFocusedStopIndex] = useState<number | null>(null)
  const [presentPlace, setPresentPlace] = useState<null | {
    name?: string
    placeId?: string
    rating?: number | null
    user_ratings_total?: number | null
    description?: string
    photoUrl?: string
  }>(null)
  const [presentPlaceLoading, setPresentPlaceLoading] = useState(false)

  const draft = readJourneyDraft()
  const cityLabel = draft?.city || 'Kyoto'
  const dateLabel = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' }).format(new Date())
  const [presentPlaceAdded, setPresentPlaceAdded] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('Location not supported')
      return
    }

    setLocationStatus('Requesting GPS')
    let watchId: number | null = null
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
          setLocationStatus('Current location shown')
        },
        (err) => {
          console.warn('geolocate error', err)
          setLocationStatus('Location permission needed')
        },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      ) as unknown as number
    } catch (err) {
      setLocationStatus('Location permission needed')
    }

    return () => {
      try {
        if (watchId != null && navigator.geolocation.clearWatch) navigator.geolocation.clearWatch(watchId)
      } catch (e) {}
    }
  }, [])

  useEffect(() => {
    if (!currentLocation) return
    let cancelled = false

    const fetchNearbyRecommendation = async () => {
      setRecommendationLoading(true)
      try {
        const response = await fetch('/api/nearby-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latestAnchorPlace: {
              name: 'Your current location',
              category: 'general',
              lat: currentLocation.lat,
              lng: currentLocation.lng,
            },
          }),
        })

        if (!response.ok) {
          throw new Error(`Nearby recommendations failed: ${response.status}`)
        }

        const data = await response.json() as { recommendations?: NearbyRecommendation[] }
        const candidates = Array.isArray(data.recommendations) ? data.recommendations.filter((item) => item?.name) : []

        if (cancelled) return

        if (!candidates.length) {
          setNearbyRecommendation(null)
          return
        }

        const closest = candidates
          .map((item) => ({
            ...item,
            distanceKm:
              typeof item.lat === 'number' && typeof item.lng === 'number'
                ? calculateDistanceKm(currentLocation.lat, currentLocation.lng, item.lat, item.lng)
                : Number.POSITIVE_INFINITY,
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm)[0]

        setNearbyRecommendation(closest)
      } catch {
        if (!cancelled) setNearbyRecommendation(null)
      } finally {
        if (!cancelled) setRecommendationLoading(false)
      }
    }

    fetchNearbyRecommendation()

    return () => {
      cancelled = true
    }
  }, [currentLocation])

  // Periodically refetch present-place details (and summary) while user moves
  useEffect(() => {
    const REFRESH_INTERVAL_MS = 15000 // 15s
    if (!currentLocation) return
    let cancelled = false
    let refreshing = false

    const fetchPresentPlace = async () => {
      if (refreshing) return
      refreshing = true
      setPresentPlaceLoading(true)
      try {
        const res = await fetch(`/api/place-details?lat=${currentLocation.lat}&lng=${currentLocation.lng}`)
        if (!res.ok) throw new Error('no place')
        const data = await res.json()
        if (!cancelled) setPresentPlace(data)

        // Try to fetch GPT/OTM augmented summary if available
        try {
          const sumRes = await fetch('/place-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: data.name || '', city: cityLabel }),
          })
          if (sumRes.ok) {
            const sumJson = await sumRes.json()
            if (!cancelled && sumJson?.summary) {
              setPresentPlace((prev) => ({ ...(prev || {}), description: sumJson.summary }))
            }
          }
        } catch (e) {
          // ignore summary failures
        }
      } catch (err) {
        if (!cancelled) setPresentPlace(null)
      } finally {
        refreshing = false
        if (!cancelled) setPresentPlaceLoading(false)
      }
    }

    // initial fetch immediately
    fetchPresentPlace()
    const id = window.setInterval(fetchPresentPlace, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [currentLocation, cityLabel])

  useEffect(() => {
    if (!currentLocation) return
    let cancelled = false
    const fetchPresentPlace = async () => {
      setPresentPlaceLoading(true)
      try {
        const res = await fetch(`/api/place-details?lat=${currentLocation.lat}&lng=${currentLocation.lng}`)
        if (!res.ok) throw new Error('no place')
        const data = await res.json()
        if (!cancelled) setPresentPlace(data)
      } catch (err) {
        if (!cancelled) setPresentPlace(null)
      } finally {
        if (!cancelled) setPresentPlaceLoading(false)
      }
    }
    fetchPresentPlace()
    return () => { cancelled = true }
  }, [currentLocation])

  const fallbackTimelineItems: SmartTimelineCard[] = [
    {
      time: '08:00 AM',
      energy: 'Energy High',
      energyClass: 'text-energy-high',
      title: 'Arashiyama Grove',
      description: 'Early walk through the bamboo paths before the crowds arrive.',
      active: false,
      lat: 35.0095,
      lng: 135.6670,
    },
    {
      time: '11:30 AM',
      energy: 'Energy Medium',
      energyClass: 'text-energy-med',
      title: 'Golden Pavilion',
      description: 'Exploring the Kinkaku-ji zen temple and the surrounding mirror pond.',
      active: true,
      lat: 35.0394,
      lng: 135.7292,
    },
    {
      time: '01:30 PM',
      energy: 'Energy Medium',
      energyClass: 'text-energy-med',
      title: 'Omen Noodles',
      description: 'Traditional udon set with seasonal Kyoto vegetables.',
      active: false,
      lat: 35.0035,
      lng: 135.7788,
    },
    {
      time: '04:00 PM',
      energy: 'Energy Low',
      energyClass: 'text-energy-low',
      title: 'Nishiki Market',
      description: "Browsing local crafts and tasting 'Kyoto's Kitchen' specialties.",
      active: false,
      lat: 35.0045,
      lng: 135.7647,
    },
  ]

  const timelineItems = useMemo(() => {
    const draftItems = Array.isArray(draft?.items) ? draft.items : []

    if (!draftItems.length) {
      return fallbackTimelineItems
    }

    return sortTimelineItemsByTime(draftItems).map((item, index) => {
      const time = item.time || 'All Day'
      const minutes = parseTimeToMinutes(time)
      const energy = Number.isFinite(minutes) && minutes < 720
        ? 'Energy High'
        : Number.isFinite(minutes) && minutes < 1020
          ? 'Energy Medium'
          : 'Energy Low'
      const energyClass = energy === 'Energy High'
        ? 'text-energy-high'
        : energy === 'Energy Medium'
          ? 'text-energy-med'
          : 'text-energy-low'
      const title = item.title || item.name || item.location || `Stop ${index + 1}`
      const description = [item.location, item.durationMinutes ? `${item.durationMinutes} min stop` : ''].filter(Boolean).join(' • ') || 'Planned stop for today'

      return {
        time,
        energy,
        energyClass,
        title,
        description,
        active: index === 0,
        lat: item.lat,
        lng: item.lng,
      }
    }) as SmartTimelineCard[]
  }, [])
  
  const activeMapStop = timelineItems.find((item) => item.active) || timelineItems[0]
  const focusedMapStop = focusedStopIndex != null ? timelineItems[focusedStopIndex] : null
  const mapCenter = focusedMapStop?.lat != null && focusedMapStop?.lng != null
    ? [focusedMapStop.lat, focusedMapStop.lng] as [number, number]
    : currentLocation
    ? [currentLocation.lat, currentLocation.lng] as [number, number]
    : activeMapStop?.lat != null && activeMapStop?.lng != null
      ? [activeMapStop.lat, activeMapStop.lng] as [number, number]
    : [35.0116, 135.7681] as [number, number]
  const mapMarkers = timelineItems
    .filter((item) => item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number, title: item.title }))
  const mapRoute = mapMarkers.map((marker) => [marker.lat, marker.lng] as [number, number])
  const recommendationDistance = currentLocation && nearbyRecommendation?.lat != null && nearbyRecommendation?.lng != null
    ? calculateDistanceKm(currentLocation.lat, currentLocation.lng, nearbyRecommendation.lat, nearbyRecommendation.lng)
    : null
  const recommendationTitle = nearbyRecommendation?.name || 'Nearby stop'
  const recommendationCategory = formatRecommendationCategory(nearbyRecommendation?.category)
  const recommendationWhy = nearbyRecommendation?.why || 'No places found within 1 km of your current position yet.'
  const recommendationSubtitle = recommendationDistance != null
    ? `${Math.max(0, Math.round(recommendationDistance * 10) / 10).toFixed(1)} km away • ${recommendationCategory}`
    : nearbyRecommendation?.address || `${recommendationCategory} within 1 km`
  const estimatedWalkMinutes = recommendationDistance != null
    ? Math.max(1, Math.round((recommendationDistance / 4.5) * 60))
    : null

  const recentPulses = [
    { title: 'Route Optimized', meta: '10:45 AM - Crowd alert', tone: 'bg-aurora-accent' },
    { title: 'Nishiki Market Update', meta: '2m ago - Early closure reported', tone: 'bg-energy-low' },
  ]

  const fastFacts = [
    { label: 'Pricing', value: '¥600 ($4.00)' },
    { label: 'Stay Time', value: '45-60 Mins' },
  ]

  const itineraryRailItems = [
    {
      time: '09:00 AM',
      energy: 'Energy High',
      energyClass: 'text-energy-high',
      title: 'Farzi Cafe',
      description: '54 min stop',
      active: true,
      scheduleLabel: 'Well within time',
      scheduleClass: 'text-emerald-300',
    },
    {
      time: '10:04 AM',
      energy: 'Energy High',
      energyClass: 'text-energy-high',
      title: 'Ganapathi & Gayatri Temple',
      description: '81 min stop',
      active: false,
      scheduleLabel: 'On time',
      scheduleClass: 'text-emerald-300',
    },
    {
      time: '11:35 AM',
      energy: 'Energy High',
      energyClass: 'text-energy-high',
      title: 'Konark Kanteerava',
      description: '54 min stop',
      active: false,
      scheduleLabel: 'Well within time',
      scheduleClass: 'text-emerald-300',
    },
    {
      time: '12:39 PM',
      energy: 'Energy Medium',
      energyClass: 'text-energy-med',
      title: 'Venkatappa Art Gallery',
      description: '108 min stop',
      active: false,
      scheduleLabel: 'On time',
      scheduleClass: 'text-emerald-300',
    },
    {
      time: '02:37 PM',
      energy: 'Energy Medium',
      energyClass: 'text-energy-med',
      title: 'Cubbon Park',
      description: '81 min stop',
      active: false,
      scheduleLabel: 'Well within time',
      scheduleClass: 'text-emerald-300',
    },
  ]

  return (
    <div className="relative min-h-screen bg-[#0B0B0F] font-body text-on-surface antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(38,38,42,0.5),transparent_34%),radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.12),transparent_22%),radial-gradient(circle_at_92%_0%,rgba(255,255,255,0.04),transparent_18%)]" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
        .glass-edge-soft { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05); }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .material-symbols-outlined[data-icon="star"],
        .material-symbols-outlined[data-icon="location_on"] { font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .no-line-rule { border: none !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2C2C2E; border-radius: 10px; }
        .aurora-gradient-text { background: linear-gradient(to right, #2563EB, #06B6D4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .aurora-glow { box-shadow: 0 0 20px rgba(37, 99, 235, 0.2); }
        .route-line { filter: drop-shadow(0 0 6px rgba(37, 99, 235, 0.4)); }
        .route-line-cyan { filter: drop-shadow(0 0 6px rgba(6, 182, 212, 0.6)); }
        .map-pin-hover:hover .map-label { opacity: 1; transform: translateY(-4px); }
        .apple-map-dot { box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1); }
      `}</style>

      <TripArcNav />

      <main className="mx-auto min-h-screen max-w-[1520px] px-6 pb-12 pt-24">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <section className="h-[calc(100vh-10rem)] overflow-y-auto pr-2 md:col-span-3">
            <header className="mb-8">
              <h2 className="mb-1 font-headline text-2xl font-bold tracking-tight text-white">Itinerary</h2>
              <p className="text-sm font-medium text-on-surface-variant">{`${cityLabel}, Japan • ${dateLabel}`}</p>
            </header>

            <div className="relative space-y-8 pl-4">
              <div className="absolute bottom-2 left-[7px] top-2 w-0.5 bg-aurora-border" />
              {itineraryRailItems.map((item) => (
                <div key={item.time} className="relative scroll-mt-24">
                  <div className={`absolute -left-[13px] top-1.5 h-3 w-3 rounded-full border-2 border-aurora-bg shadow-sm ${item.active ? 'border-white bg-aurora-accent shadow-lg shadow-emerald-400/20' : 'border-aurora-bg bg-aurora-border'}`} />
                  <div className={`mb-1.5 text-[11px] font-bold tracking-widest uppercase ${item.active ? 'text-aurora-accent' : 'text-on-surface-variant'}`}>{item.time}</div>
                  <div className={item.active ? 'scale-[1.01] rounded-[1.4rem] bg-gradient-to-br from-[#2563EB] to-[#06B6D4] p-px shadow-[0_16px_34px_rgba(37,99,235,0.16)]' : 'rounded-[1.4rem] border border-[#2c2c2e] bg-[#1C1C1E] p-[18px] shadow-[0_10px_22px_rgba(0,0,0,0.2)] transition-all hover:border-[#2563EB]/40 hover:shadow-[0_10px_28px_rgba(37,99,235,0.08)]'}>
                    <div className="h-full rounded-[1.4rem] bg-[#1C1C1E] p-[18px]">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className={`mb-1.5 block text-[10px] font-bold tracking-widest uppercase ${item.energyClass}`}>{item.energy}</span>
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#b4c5ff]">{item.scheduleLabel}</span>
                      </div>
                      <h3 className="mb-0.5 text-base font-bold text-white">{item.title}</h3>
                      <p className="text-xs leading-relaxed text-on-surface-variant">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-6 md:col-span-6">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-[#2c2c2e] bg-[#1C1C1E] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="absolute right-0 top-0 -mr-16 -mt-16 h-32 w-32 rounded-full bg-aurora-accent/5 blur-3xl" />
              <div className="flex items-start gap-4">
                <div className="rounded-full border border-[#2c2c2e] bg-[#16161a] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                  <span className="material-symbols-outlined text-aurora-accent">bolt</span>
                </div>
                <div className="flex-grow">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{recommendationLoading ? 'Finding nearby places' : '15 Mins Ahead'}</span>
                    <span className="rounded-full bg-[#22c55e]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#22c55e]">On Schedule</span>
                  </div>
                  <p className="mb-3 text-sm leading-snug text-on-surface-variant">
                    Since you&apos;re ahead, let&apos;s visit this <span className="aurora-gradient-text font-semibold">hidden temple nearby</span>. It&apos;s a 4-minute walk and rarely crowded at this hour.
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-aurora-border pt-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-[#2c2c2e] bg-[#0b0b0f]">
                        <img alt="Hidden Temple preview" className="h-full w-full object-cover opacity-80" src={presentPlace?.photoUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDNfaonM15MZYQfVCY0izOnAMnMMjYa0PyzICDXxvPIW4wS1QEa49K21-1KcHeyXK4rB468Vsibsiv6xtGPywTWY3LDrLMbq8Q6bLOHT5gGq-wpQcwR2w_8x1c5mOUFdEp4_SvDwpV05zzekbb1d9VISB90FTAJ-x8OXfu4fhEi56FwsvGRfoH1S2eMP361-jYwUqAk51wx2dytj-Z7g73oOJ32PTtX9yxMeNmy94uyG9C2QnnFk3fp-ZKMHuNljWAefhZLlgv1kc0'} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Ryoan-ji Sub-temple</p>
                        <p className="text-[10px] uppercase tracking-tighter text-on-surface-variant">4-min walk • Zen garden</p>
                      </div>
                    </div>
                    <button type="button" className="rounded-lg border border-[#2563eb]/30 bg-[#2563eb]/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#2563eb] transition-all hover:bg-[#2563eb]/20">Add to Route</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-[#2c2c2e] bg-[#1b1b1f] p-6 shadow-[0_18px_44px_rgba(0,0,0,0.24)]">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b4c5ff]">Today's Route Map</p>
                  <h4 className="mt-1 text-lg font-bold text-white">Stops on today's itinerary</h4>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#c3c6d7]">
                  {mapRoute.length ? `${mapRoute.length} stops` : '—'}
                </div>
              </div>

              <div className="relative h-[360px] overflow-hidden rounded-[2rem] border border-[#2c2c2e] bg-[#050505]">
                <div className="absolute inset-0 z-0">
                  <LeafletMap
                    center={mapCenter}
                    zoom={13}
                    focusPoint={focusedMapStop?.lat != null && focusedMapStop?.lng != null ? [focusedMapStop.lat, focusedMapStop.lng] as [number, number] : null}
                    focusZoom={16}
                    startMarker={mapRoute.length ? { lat: mapRoute[0][0], lng: mapRoute[0][1], title: timelineItems[0]?.title || 'Start' } : undefined}
                    currentLocation={currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng, title: 'You are here', accuracy: undefined } : undefined}
                    markers={mapMarkers}
                    route={mapRoute}
                  />
                </div>
                <div className="pointer-events-none absolute left-1/2 top-[38%] z-[5] -translate-x-1/2 -translate-y-1/2">
                  <div className="rounded-md border border-[#06b6d4]/30 bg-[#06b6d4]/10 px-2 py-0.5 backdrop-blur-md">
                    <span className="text-[9px] font-bold uppercase tracking-tight text-[#06b6d4]">
                      {estimatedWalkMinutes != null
                        ? `${estimatedWalkMinutes} min walk to ${recommendationCategory.toLowerCase()}`
                        : `Nearby ${recommendationCategory.toLowerCase()}`}
                    </span>
                  </div>
                </div>
                <div className="absolute inset-x-6 bottom-6 z-[5] flex items-center justify-between rounded-2xl border border-white/5 bg-[#0B0B0F]/60 p-4 backdrop-blur-xl">
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-2">
                      {timelineItems.map((item, index) => (
                        <button
                          key={`${item.title}-${index}`}
                          type="button"
                          onClick={() => {
                            setFocusedStopIndex(index)
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1C1C1E] text-[10px] font-bold transition-transform hover:scale-110 ${focusedStopIndex === index ? 'ring-2 ring-[#06b6d4]/40' : ''} ${index === 0 ? 'bg-[#2563eb]' : index === 1 ? 'bg-[#06b6d4]' : 'bg-[#2c2c2e]'}`}
                          aria-label={`Focus stop ${index + 1}: ${item.title}`}
                          title={item.title}
                        >
                          {index + 1}
                        </button>
                      ))}
                    </div>
                      <span className="text-xs font-medium text-white/80">{timelineItems.length} Stops</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-energy-high" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Walking Optimized</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 md:col-span-3">
            <div className="overflow-hidden rounded-[1.75rem] border border-[#2c2c2e] bg-[#1C1C1E] shadow-sm">
              <img
                alt={presentPlace?.name || 'Golden Pavilion'}
                className="h-44 w-full object-cover opacity-80"
                src={presentPlace?.photoUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZ_OGnshCPCC7SOrD9gg-E7DFjS-b_HvD4lTfphgy0U0voOt1VRXGrjLSuieTN7ByqaUg7PLhgwRGPnEc6F5YQ-rjkgmmt72-e2Bk6UA1-XYm3DSrrTkxI-e4OPl85E2by7bziUhLiBHPQ9pjLKZ23uc7wtxEcZL0-PsTjCR5MP6sI8AfsjNecFvF_X4cG1wr5HuqMmprqW_UlyS7JI_TWvZDPUmUmeps1s-SN0mWEWM9t1aOJFANicvK6E_jrkm7OycYVe9q3hIs'}
              />
              <div className="p-5">
                <h2 className="mb-2 font-headline text-xl font-bold tracking-tight text-white">{presentPlace?.name || 'Golden Pavilion'}</h2>
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex text-energy-med">
                    {Array.from({ length: 5 }).map((_, index) => {
                      const ratingVal = presentPlace?.rating ?? 4.0
                      const filled = Math.round((ratingVal || 0)) >= index + 1
                      return <span key={index} className="material-symbols-outlined text-sm" style={{ fontVariationSettings: `"FILL" ${filled ? 1 : 0}` }}>star</span>
                    })}
                  </div>
                  <span className="text-xs font-medium text-on-surface-variant">({presentPlace?.rating ? (presentPlace.rating.toFixed(1)) : '—'} / {presentPlace?.user_ratings_total ? (presentPlace.user_ratings_total >= 1000 ? `${Math.round(presentPlace.user_ratings_total / 100) / 10}k` : presentPlace.user_ratings_total) : '—'} reviews)</span>
                </div>
                <p className="text-sm leading-relaxed text-on-surface-variant">{presentPlace?.description || 'A Zen temple whose top two floors are completely covered in gold leaf. Reflects the extravagant Kitayama culture.'}</p>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!presentPlace || !currentLocation) return
                      try {
                        const raw = window.localStorage.getItem(JOURNEY_DRAFT_STORAGE_KEY)
                        let obj = raw ? JSON.parse(raw) : { city: cityLabel, items: [] }
                        if (!obj.items) obj.items = []
                        obj.items.push({ name: presentPlace.name || 'Nearby place', location: presentPlace.description || '', lat: currentLocation.lat, lng: currentLocation.lng, durationMinutes: 45 })
                        window.localStorage.setItem(JOURNEY_DRAFT_STORAGE_KEY, JSON.stringify(obj))
                        setPresentPlaceAdded(true)
                        window.setTimeout(() => setPresentPlaceAdded(false), 2500)
                      } catch (e) {
                        console.warn('persist failed', e)
                      }
                    }}
                    className="rounded-full border border-[#2563eb]/30 bg-[#2563eb] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white transition-all hover:opacity-90"
                  >
                    Add to Route
                  </button>
                  {presentPlaceAdded ? <span className="text-sm font-bold text-emerald-300">Added</span> : null}
                </div>
              </div>
            </div>

            <div className="space-y-4 px-2">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Recent Pulse</h3>
              <div className="space-y-4">
                {recentPulses.map((pulse) => (
                  <div key={pulse.title} className="flex items-start gap-3">
                    <div className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${pulse.tone}`} />
                    <div className="space-y-0.5">
                      <p className="text-[13px] font-bold leading-tight text-white">{pulse.title}</p>
                      <p className="text-[11px] text-on-surface-variant">{pulse.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {fastFacts.map((fact) => (
                <div key={fact.label} className="rounded-2xl border border-aurora-border bg-aurora-card p-4 shadow-sm">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{fact.label}</span>
                  <p className="text-sm font-bold text-white">{fact.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-aurora-border bg-aurora-card p-6">
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-white">Nearby Signature Tea</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-xl bg-aurora-bg">
                      <MatchaArtwork />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Gold-Leaf Matcha</p>
                    <p className="text-xs text-on-surface-variant">At the garden tea house</p>
                  </div>
                </div>
              </div>
            </div>

            <button type="button" className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#06b6d4] py-4 font-bold text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)] transition-all hover:opacity-90">
              Get Walking Directions
              <span className="material-symbols-outlined text-sm">near_me</span>
            </button>
          </section>
        </div>
      </main>

      <nav className="fixed bottom-8 left-1/2 z-50 flex min-w-[320px] -translate-x-1/2 items-center gap-8 rounded-full border border-aurora-border bg-aurora-card/80 px-6 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl md:hidden">
        <button type="button" className="flex flex-col items-center justify-center p-3 text-on-surface-variant transition-all hover:text-white">
          <span className="material-symbols-outlined">home</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-widest">Home</span>
        </button>
        <button type="button" className="flex scale-110 flex-col items-center justify-center rounded-full bg-aurora-accent p-3 text-white shadow-lg shadow-aurora-accent/40">
          <span className="material-symbols-outlined">map</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-widest">Map</span>
        </button>
        <button type="button" className="flex flex-col items-center justify-center p-3 text-on-surface-variant transition-all hover:text-white">
          <span className="material-symbols-outlined">auto_stories</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-widest">Stories</span>
        </button>
      </nav>
    </div>
  )
}