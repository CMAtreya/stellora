import { useEffect, useMemo, useState } from 'react'
import TripArcNav from '../components/TripArcNav'
import LeafletMap from '../components/LeafletMap'
import { resolveApiPath } from '../lib/apiClient'
import { useOraPageContext } from '../types/oraContext'
import { globalActionRegistry } from '../agent/actionRegistry'
import { useTripStore, tripStore } from '../store/tripStore'


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
  const [presentPlaceAdded, setPresentPlaceAdded] = useState(false)

  const storeDestination = useTripStore((state) => state.destination)
  const storeItinerary = useTripStore((state) => state.itinerary)

  const draft = useMemo(() => {
    return {
      city: storeDestination,
      items: storeItinerary[0]?.items || []
    }
  }, [storeDestination, storeItinerary])

  const cityLabel = draft?.city || 'Kyoto'
  const dateLabel = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' }).format(new Date())

  const saveDraft = (newDraft: any) => {
    tripStore.setState((prev) => {
      const nextItinerary = [...prev.itinerary]
      if (nextItinerary[0]) {
        nextItinerary[0] = { ...nextItinerary[0], items: newDraft.items }
      }
      return {
        ...prev,
        destination: newDraft.city || prev.destination,
        itinerary: nextItinerary
      }
    })
  }


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
  }, [draft])

  const { setPageContext } = useOraPageContext()

  // Register and update ORA Page Context
  useEffect(() => {
    const visibleEntities = timelineItems.map((item) => ({
      type: 'activity',
      id: item.title,
      summary: `${item.title} at ${item.time} (${item.description})`,
      fullData: item, // Send comprehensive item data
    }))

    setPageContext({
      pageId: 'trip-planner',
      pageSummary: `Active itinerary for ${cityLabel} showing ${timelineItems.length} stops`,
      visibleEntities,
      availableActions: ['update_itinerary', 'add_activity', 'remove_activity', 'navigate'],
      userFacingState: {
        city: cityLabel,
        date: dateLabel,
        totalStops: timelineItems.length,
        currentLocation: currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : null,
      },
      lastUpdated: Date.now()
    })


    return () => {
      setPageContext(null)
    }
  }, [timelineItems, currentLocation, cityLabel, dateLabel, setPageContext])



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
        const response = await fetch(resolveApiPath('/api/nearby-recommendations'), {
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

  useEffect(() => {
    const REFRESH_INTERVAL_MS = 15000
    if (!currentLocation) return
    let cancelled = false
    let refreshing = false

    const fetchPresentPlace = async () => {
      if (refreshing) return
      refreshing = true
      setPresentPlaceLoading(true)
      try {
        const res = await fetch(resolveApiPath(`/api/place-details?lat=${currentLocation.lat}&lng=${currentLocation.lng}`))
        if (!res.ok) throw new Error('no place')
        const data = await res.json()
        if (!cancelled) setPresentPlace(data)
      } catch (err) {
        if (!cancelled) setPresentPlace(null)
      } finally {
        refreshing = false
        if (!cancelled) setPresentPlaceLoading(false)
      }
    }

    fetchPresentPlace()
    const id = window.setInterval(fetchPresentPlace, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [currentLocation, cityLabel])



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

  const estimatedWalkMinutes = recommendationDistance != null
    ? Math.max(1, Math.round((recommendationDistance / 4.5) * 60))
    : null

  return (
    <div className="relative min-h-screen bg-aurora-bg font-body text-on-surface antialiased dark">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
        .glass-edge-soft { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05); }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .no-line-rule { border: none !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2C2C2E; border-radius: 10px; }
        .aurora-gradient-text {
          background: linear-gradient(to right, #2563EB, #06B6D4);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .aurora-glow {
          box-shadow: 0 0 20px rgba(37, 99, 235, 0.2);
        }
        .route-line {
          filter: drop-shadow(0 0 6px rgba(37, 99, 235, 0.4));
        }
        .route-line-cyan {
          filter: drop-shadow(0 0 6px rgba(6, 182, 212, 0.6));
        }
        .map-pin-hover:hover .map-label {
          opacity: 1;
          transform: translateY(-4px);
        }
        .apple-map-dot {
          box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
        }
      `}</style>

      <TripArcNav />

      <main className="mx-auto min-h-screen max-w-7xl px-6 pb-12 pt-24">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          {/* Left Column: Timeline */}
          <section className="h-[calc(100vh-10rem)] overflow-y-auto pr-2 md:col-span-3">
            <header className="mb-8">
              <h2 className="mb-1 font-headline text-2xl font-bold tracking-tight text-white">Itinerary</h2>
              <p className="text-sm font-medium text-on-surface-variant">{`${cityLabel}, Japan • ${dateLabel}`}</p>
            </header>

            <div className="relative space-y-10 pl-4">
              <div className="absolute bottom-2 left-[7px] top-2 w-0.5 bg-aurora-border" />

              {timelineItems.map((item, index) => (
                <div key={`${item.time}-${index}`} className="relative scroll-mt-24">
                  <div
                    className={`absolute -left-[13px] top-1.5 h-3 w-3 rounded-full border-2 border-aurora-bg shadow-sm ${
                      item.active
                        ? 'border-white bg-aurora-accent shadow-lg shadow-aurora-accent/30'
                        : 'border-aurora-bg bg-aurora-border'
                    }`}
                  />
                  <div
                    className={`mb-2 text-[11px] font-bold tracking-widest uppercase ${
                      item.active ? 'text-aurora-accent' : 'text-on-surface-variant'
                    }`}
                  >
                    {item.time}
                  </div>

                  {item.active ? (
                    <div className="scale-[1.02] rounded-2xl bg-gradient-to-br from-aurora-accent to-secondary p-[1px] shadow-xl shadow-aurora-accent/10">
                      <div className="rounded-2xl bg-aurora-card p-5 h-full">
                        <span className="mb-2 block text-[10px] font-bold tracking-widest uppercase text-energy-med">
                          {item.energy}
                        </span>
                        <h3 className="mb-1 text-lg font-bold text-white">{item.title}</h3>
                        <p className="text-xs leading-relaxed text-on-surface-variant">{item.description}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-aurora-border bg-aurora-card p-5 shadow-sm transition-all hover:border-aurora-accent hover:shadow-lg hover:shadow-aurora-accent/10">
                      <span className="mb-2 block text-[10px] font-bold tracking-widest uppercase text-energy-high">
                        {item.energy}
                      </span>
                      <h3 className="mb-1 text-base font-bold text-white">{item.title}</h3>
                      <p className="text-xs leading-relaxed text-on-surface-variant">{item.description}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Center Column: Map & Live Intelligence */}
          <section className="flex flex-col gap-6 md:col-span-6">
            {/* Live Intelligence Widget */}
            <div className="aurora-glow relative overflow-hidden rounded-2xl border border-aurora-border bg-aurora-card p-6">
              <div className="absolute right-0 top-0 -mr-16 -mt-16 h-32 w-32 rounded-full bg-aurora-accent/5 blur-3xl" />
              <div className="flex items-start gap-4">
                <div className="rounded-xl border border-aurora-accent/20 bg-aurora-accent/10 p-3">
                  <span className="material-symbols-outlined text-aurora-accent">bolt</span>
                </div>
                <div className="flex-grow">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {recommendationLoading ? 'Finding nearby places' : '15 Mins Ahead'}
                    </span>
                    <span className="rounded-full bg-energy-high/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-energy-high">
                      On Schedule
                    </span>
                  </div>
                  <p className="mb-3 text-sm leading-snug text-on-surface-variant">
                    Since you&apos;re ahead, let&apos;s visit this{' '}
                    <span className="aurora-gradient-text font-semibold">hidden temple nearby</span>. It&apos;s a
                    {estimatedWalkMinutes ? ` ${estimatedWalkMinutes}-minute` : ' 4-minute'} walk and rarely crowded at this hour.
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-aurora-border pt-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-aurora-border bg-aurora-bg">
                        <img
                          alt="Nearby location"
                          className="h-full w-full object-cover opacity-80"
                          src={presentPlace?.photoUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDNfaonM15MZYQfVCY0izOnAMnMMjYa0PyzICDXxvPIW4wS1QEa49K21-1KcHeyXK4rB468Vsibsiv6xtGPywTWY3LDrLMbq8Q6bLOHT5gGq-wpQcwR2w_8x1c5mOUFdEp4_SvDwpV05zzekbb1d9VISB90FTAJ-x8OXfu4fhEi56FwsvGRfoH1S2eMP361-jYwUqAk51wx2dytj-Z7g73oOJ32PTtX9yxMeNmy94uyG9C2QnnFk3fp-ZKMHuNljWAefhZLlgv1kc0'}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{nearbyRecommendation?.name || 'Ryoan-ji Sub-temple'}</p>
                        <p className="text-[10px] uppercase tracking-tighter text-on-surface-variant">
                          {estimatedWalkMinutes ? `${estimatedWalkMinutes}-min walk` : '4-min walk'} • Zen garden
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (nearbyRecommendation) {
                          const newItem = {
                            time: '12:00 PM',
                            title: nearbyRecommendation.name,
                            location: nearbyRecommendation.address || nearbyRecommendation.name,
                            durationMinutes: 45,
                            lat: nearbyRecommendation.lat,
                            lng: nearbyRecommendation.lng,
                          }
                          const nextItems = [...(draft.items || []), newItem]
                          saveDraft({ ...draft, items: nextItems })
                        }
                      }}
                      className="rounded-lg border border-aurora-accent/30 bg-aurora-accent/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-aurora-accent transition-all hover:bg-aurora-accent/20"
                    >
                      Add to Route
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Map Container */}
            <div className="relative min-h-[500px] flex-grow overflow-hidden rounded-[2.5rem] border border-aurora-border bg-[#050505] shadow-2xl">
              <div className="absolute inset-0 z-0">
                <LeafletMap
                  center={mapCenter}
                  zoom={13}
                  focusPoint={
                    focusedMapStop?.lat != null && focusedMapStop?.lng != null
                      ? ([focusedMapStop.lat, focusedMapStop.lng] as [number, number])
                      : null
                  }
                  focusZoom={16}
                  startMarker={
                    mapRoute.length
                      ? { lat: mapRoute[0][0], lng: mapRoute[0][1], title: timelineItems[0]?.title || 'Start' }
                      : undefined
                  }
                  currentLocation={
                    currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng, title: 'You are here', accuracy: undefined } : undefined
                  }
                  markers={mapMarkers}
                  route={mapRoute}
                />
              </div>

              {/* SVG Route Overlay */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 600">
                <defs>
                  <linearGradient id="apple-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#2563EB" />
                    <stop offset="100%" stopColor="#06B6D4" />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur result="coloredBlur" stdDeviation="2.5" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="cyan-glow">
                    <feGaussianBlur result="coloredBlur" stdDeviation="2" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <path
                  className="route-line"
                  d="M 200,450 Q 250,420 300,350 T 400,280 T 550,400 T 650,480"
                  fill="none"
                  filter="url(#glow)"
                  stroke="url(#apple-gradient)"
                  strokeLinecap="round"
                  strokeWidth="3"
                />
                <path
                  className="route-line opacity-40"
                  d="M 400,280 Q 420,240 450,220"
                  fill="none"
                  stroke="#2563EB"
                  strokeDasharray="4,4"
                  strokeWidth="2"
                />
                <path
                  className="route-line-cyan"
                  d="M 400,280 Q 430,250 464,210"
                  fill="none"
                  filter="url(#cyan-glow)"
                  stroke="#06B6D4"
                  strokeDasharray="6,4"
                  strokeLinecap="round"
                  strokeWidth="2.5"
                />
              </svg>

              {/* Text Label for Branch */}
              <div className="pointer-events-none absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="rounded-md border border-secondary/30 bg-secondary/10 px-2 py-0.5 backdrop-blur-md">
                  <span className="text-[9px] font-bold uppercase tracking-tight text-secondary">
                    {estimatedWalkMinutes ? `${estimatedWalkMinutes} min walk to nearby` : '4 min walk to hidden gem'}
                  </span>
                </div>
              </div>

              {/* Map Layer Controls */}
              <div className="absolute left-6 top-6 flex flex-wrap gap-2 pr-6">
                <button className="flex items-center gap-2 rounded-full border border-white/5 bg-[#1C1C1E]/90 px-4 py-2 text-[10px] font-bold text-on-surface-variant shadow-lg transition-all hover:text-white backdrop-blur-xl">
                  <span className="material-symbols-outlined text-[14px]">layers</span> Traffic
                </button>
                <button className="flex items-center gap-2 rounded-full border border-white/5 bg-[#1C1C1E]/90 px-4 py-2 text-[10px] font-bold text-on-surface-variant shadow-lg transition-all hover:text-white backdrop-blur-xl">
                  <span className="material-symbols-outlined text-[14px]">my_location</span> Focus
                </button>
                <button className="flex items-center gap-2 rounded-full border border-white/5 bg-[#1C1C1E]/90 px-4 py-2 text-[10px] font-bold text-on-surface-variant shadow-lg transition-all hover:bg-energy-low/10 hover:text-white backdrop-blur-xl group/lf">
                  <span className="material-symbols-outlined text-[14px] text-energy-low/60 group-hover/lf:text-energy-low">warning</span> Lost &amp;
                  Found
                </button>
              </div>

              {/* Map Legend / Info Glass */}
              <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between rounded-2xl border border-white/5 bg-[#0B0B0F]/60 p-4 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-2">
                    {timelineItems.map((_, index) => (
                      <button
                        key={`nav-${index}`}
                        type="button"
                        onClick={() => setFocusedStopIndex(index)}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1C1C1E] text-[10px] font-bold transition-transform hover:scale-110 ${
                          focusedStopIndex === index ? 'ring-2 ring-secondary/40' : ''
                        } ${index === 0 ? 'bg-aurora-accent' : index === 1 ? 'bg-secondary' : 'bg-aurora-border'}`}
                        aria-label={`Focus stop ${index + 1}: ${timelineItems[index].title}`}
                        title={timelineItems[index].title}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-medium text-white/80">{mapRoute.length} Stops Remaining</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-energy-high" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Walking Optimized</span>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Contextual Details */}
          <section className="space-y-6 md:col-span-3">
            {/* Location Hero Card */}
            <div className="overflow-hidden rounded-xl border border-aurora-border bg-aurora-card shadow-sm">
              <img
                alt={presentPlace?.name || 'Golden Pavilion'}
                className="h-48 w-full object-cover opacity-80"
                src={presentPlace?.photoUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZ_OGnshCPCC7SOrD9gg-E7DFjS-b_HvD4lTfphgy0U0voOt1VRXGrjLSuieTN7ByqaUg7PLhgwRGPnEc6F5YQ-rjkgmmt72-e2Bk6UA1-XYm3DSrrTkxI-e4OPl85E2by7bziUhLiBHPQ9pjLKZ23uc7wtxEcZL0-PsTjCR5MP6sI8AfsjNecFvF_X4cG1wr5HuqMmprqW_UlyS7JI_TWvZDPUmUmeps1s-SN0mWEWM9t1aOJFANicvK6E_jrkm7OycYVe9q3hIs'}
              />
              <div className="p-6">
                <h2 className="mb-2 font-headline text-xl font-bold tracking-tight text-white">{presentPlace?.name || 'Golden Pavilion'}</h2>
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex text-energy-med">
                    {Array.from({ length: 5 }).map((_, index) => {
                      const ratingVal = presentPlace?.rating ?? 4.8
                      const filled = Math.round(ratingVal || 0) >= index + 1
                      return (
                        <span
                          key={index}
                          className="material-symbols-outlined text-sm"
                          style={{ fontVariationSettings: `"FILL" ${filled ? 1 : 0}` }}
                        >
                          star
                        </span>
                      )
                    })}
                  </div>
                  <span className="text-xs font-medium text-on-surface-variant">
                    ({presentPlace?.rating ? presentPlace.rating.toFixed(1) : '4.8'} /{' '}
                    {presentPlace?.user_ratings_total ? (presentPlace.user_ratings_total >= 1000 ? `${Math.round(presentPlace.user_ratings_total / 100) / 10}k` : presentPlace.user_ratings_total) : '12k'}{' '}
                    reviews)
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  {presentPlace?.description || 'A Zen temple whose top two floors are completely covered in gold leaf. Reflects the extravagant Kitayama culture.'}
                </p>
              </div>
            </div>

            {/* Recent Pulse Section */}
            <div className="space-y-4 px-2">
              <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-on-surface-variant">Recent Pulse</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aurora-accent" />
                  <div className="space-y-0.5">
                    <p className="text-[13px] font-bold leading-tight text-white">Route Optimized</p>
                    <p className="text-[11px] text-on-surface-variant">10:45 AM - Crowd alert</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-energy-low" />
                  <div className="space-y-0.5">
                    <p className="text-[13px] font-bold leading-tight text-white">Nishiki Market Update</p>
                    <p className="text-[11px] text-on-surface-variant">2m ago - Early closure reported</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Fast Facts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-aurora-border bg-aurora-card p-4 shadow-sm">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Pricing</span>
                <p className="text-sm font-bold text-white">¥600 ($4.00)</p>
              </div>
              <div className="rounded-2xl border border-aurora-border bg-aurora-card p-4 shadow-sm">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Stay Time</span>
                <p className="text-sm font-bold text-white">45-60 Mins</p>
              </div>
            </div>

            {/* Signature Selection */}
            <div className="rounded-2xl border border-aurora-border bg-aurora-card p-6">
              <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-white">Nearby Signature Tea</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-xl bg-aurora-bg">
                    <img
                      alt="Matcha bowl"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuBXtzdAoTVFxygu-oqmh5E05u_qZ25LFDtzku-Zdp3L9u7VNn-gwRDo8ytrtMsba1QVmRe3GXB2hgZm-RgOCZpi-d6iSpo7sdnFuVmC_Md-C3qGC-QWEYA6CUUq0ARGH03VoqvFY6QD-pp9txM4cTeXK9E4MnU_ZBDwTqilHO4zz1BY6yKCWj9YV3HHnKIzMi8F4rG6vsP4eDh_kZHyCInDhKpgSdpgKIINq5ssPqPRcAvA4Yx7iWrEk_6aDiE-ASqOihktbV22Ka4"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Gold-Leaf Matcha</p>
                    <p className="text-xs text-on-surface-variant">At the garden tea house</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <button className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora-accent to-secondary py-4 font-bold text-white shadow-lg shadow-aurora-accent/20 transition-all hover:opacity-90">
              Get Walking Directions
              <span className="material-symbols-outlined text-sm">near_me</span>
            </button>
          </section>
        </div>
      </main>
    </div>
  )
}
