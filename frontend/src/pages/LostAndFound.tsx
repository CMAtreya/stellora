import { useEffect, useMemo, useRef, useState } from 'react'
import LeafletMap from '../components/LeafletMap'
import TripArcNav from '../components/TripArcNav'
import { useGroup } from '../hooks/useGroup'
import { resolveApiPath } from '../lib/apiClient'

type Member = {
  id: string
  displayName?: string
  live_lat?: number | null
  live_lng?: number | null
  accuracy?: number | null
  last_updated?: string | null
  is_lost?: boolean
  battery?: number | null
  speed?: number | null
}

type MemberRoute = {
  id: string
  geometry: string
  color?: string
  duration?: number
  distance?: number
  title?: string
  fetchedAt: number
  key: string
}

const footerMembers = [
  { tone: 'blue', label: '1' },
  { tone: 'slate', label: '2' },
  { tone: 'slate', label: '3' },
]

const mapCenter: [number, number] = [35.0116, 135.7681]

function getTimeAgoString(isoString?: string | null): string {
  if (!isoString) return 'Active now'
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 10) return 'Just now'
  if (diffSecs < 60) return `${diffSecs}s ago`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m ago`
  return 'Over an hour ago'
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

export default function LostAndFoundPage() {
  const storedGroupId = typeof window !== 'undefined' ? window.localStorage.getItem('triparc:group_id') || undefined : undefined
  const { members: liveMembers, hostId } = useGroup(storedGroupId)
  const [currentMemberIndex, setCurrentMemberIndex] = useState(0)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null)
  const [trafficActive, setTrafficActive] = useState(false)
  const [lostActive, setLostActive] = useState(true)
  const [guidanceActive, setGuidanceActive] = useState(false)
  const [guidedToHostIds, setGuidedToHostIds] = useState<string[]>([])
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const selfUserId = typeof window !== 'undefined' ? window.localStorage.getItem('triparc:user_id') || '' : ''

  // Host details and coords
  const activeHostId = hostId || (typeof window !== 'undefined' && window.localStorage.getItem('triparc:is_group_host') === 'true' ? selfUserId : null)

  const formattedMembers: Member[] = useMemo(() => {
    if (liveMembers && liveMembers.length) {
      return liveMembers.map((m: any) => {
        let name = m.display_name || m.user_id
        const isSelf = m.user_id === selfUserId
        if (m.user_id === activeHostId || (activeHostId && m.id === activeHostId)) {
          name = 'Host'
        } else if (name && (name.trim().toLowerCase() === 'you' || name.trim().toLowerCase() === 'host') && !isSelf) {
          name = 'Host'
        }
        return {
          id: m.user_id || (m.display_name || 'unknown').toLowerCase().replace(/\s+/g, '-'),
          displayName: name,
          live_lat: m.live_lat,
          live_lng: m.live_lng,
          accuracy: m.accuracy,
          last_updated: m.last_updated,
          is_lost: !!m.is_lost,
          battery: typeof m.battery === 'number' ? m.battery : null,
          speed: typeof m.speed === 'number' ? m.speed : null,
        }
      })
    }
    return []
  }, [liveMembers, activeHostId, selfUserId])

  const currentMember = formattedMembers[currentMemberIndex] || null

  const hostCoords = useMemo(() => {
    if (!activeHostId) return null
    if (activeHostId === selfUserId && currentLocation) {
      return { lat: currentLocation.lat, lng: currentLocation.lng }
    }
    const h = formattedMembers.find((m) => m.id === activeHostId)
    if (h && h.live_lat != null && h.live_lng != null) {
      return { lat: h.live_lat, lng: h.live_lng }
    }
    return null
  }, [activeHostId, selfUserId, currentLocation, formattedMembers])

  // Real-time vicinity check (>5m from host)
  const awayMembers = useMemo(() => {
    if (!hostCoords) return []
    return formattedMembers.filter((m) => {
      const isSelf = m.id === selfUserId || m.id === 'you'
      const mLat = isSelf ? currentLocation?.lat : m.live_lat
      const mLng = isSelf ? currentLocation?.lng : m.live_lng
      if (mLat == null || mLng == null) return false
      
      const dist = getDistanceMeters(mLat, mLng, hostCoords.lat, hostCoords.lng)
      return dist > 5
    })
  }, [formattedMembers, hostCoords, currentLocation, selfUserId])

  const hasLostMembers = awayMembers.length > 0
  const [separationStart, setSeparationStart] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (hasLostMembers) {
      if (!separationStart) {
        // Start with a 262-second offset to simulate ~4:22 elapsed time immediately for demo realism
        setSeparationStart(Date.now() - 262000)
      }
    } else {
      setSeparationStart(null)
      setElapsedSeconds(0)
    }
  }, [hasLostMembers, separationStart])

  useEffect(() => {
    if (!separationStart) return undefined

    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - separationStart) / 1000))
    }, 1000)

    return () => window.clearInterval(id)
  }, [separationStart])

  const currentTime = useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60)
    const secs = elapsedSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [elapsedSeconds])

  const liveMapCenter: [number, number] = currentLocation ? [currentLocation.lat, currentLocation.lng] : mapCenter
  const [memberRoutes, setMemberRoutes] = useState<MemberRoute[]>([])
  const routeCacheRef = useRef<Record<string, MemberRoute>>({})

  const colorByMember = (id: string) => {
    const palette = ['#FF7A59', '#2f8cff', '#06b6d4', '#f59e0b', '#22c55e']
    let acc = 0
    for (let i = 0; i < id.length; i += 1) acc += id.charCodeAt(i)
    return palette[acc % palette.length]
  }

  // Calculate meetup point (centroid) if 2 or more members are away
  const meetupPoint = useMemo(() => {
    if (awayMembers.length < 2) return null
    
    const activeCoords: Array<{ lat: number; lng: number }> = []
    
    if (currentLocation) {
      activeCoords.push({ lat: currentLocation.lat, lng: currentLocation.lng })
    }
    
    formattedMembers.forEach((m) => {
      const isSelf = m.id === selfUserId || m.id === 'you'
      if (!isSelf && m.live_lat != null && m.live_lng != null) {
        activeCoords.push({ lat: m.live_lat, lng: m.live_lng })
      }
    })
    
    if (activeCoords.length === 0) return null
    
    const avgLat = activeCoords.reduce((sum, c) => sum + c.lat, 0) / activeCoords.length
    const avgLng = activeCoords.reduce((sum, c) => sum + c.lng, 0) / activeCoords.length
    
    return { lat: avgLat, lng: avgLng, title: 'Smart Meeting Point' }
  }, [awayMembers.length, formattedMembers, currentLocation, selfUserId])

  // Determine if the current local user is away from the host (>5m)
  const isSelfAway = useMemo(() => {
    if (!hostCoords) return false
    const selfMember = formattedMembers.find(m => m.id === selfUserId || m.id === 'you')
    const sLat = currentLocation?.lat ?? selfMember?.live_lat
    const sLng = currentLocation?.lng ?? selfMember?.live_lng
    if (sLat == null || sLng == null) return false
    
    // The host cannot be away from themselves
    if (selfUserId === activeHostId) return false

    const dist = getDistanceMeters(sLat, sLng, hostCoords.lat, hostCoords.lng)
    return dist > 5
  }, [formattedMembers, hostCoords, currentLocation, selfUserId, activeHostId])

  // Get active route for self user to calculate distance/duration
  const meetupRoute = memberRoutes.find(r => r.id === selfUserId || r.id === 'you' || r.id === '')
  const meetupDistanceStr = meetupRoute && meetupRoute.distance 
    ? (meetupRoute.distance < 1000 ? `${Math.round(meetupRoute.distance)}m` : `${(meetupRoute.distance / 1000).toFixed(1)}km`)
    : null

  // Get direct straight-line distance from a member to the host
  const getMemberDistanceToHost = (memberId: string) => {
    if (!hostCoords) return null
    const m = formattedMembers.find((member) => member.id === memberId)
    const isSelf = memberId === selfUserId || memberId === 'you'
    const mLat = isSelf ? currentLocation?.lat : m?.live_lat
    const mLng = isSelf ? currentLocation?.lng : m?.live_lng
    if (mLat == null || mLng == null) return null
    const dist = getDistanceMeters(mLat, mLng, hostCoords.lat, hostCoords.lng)
    return dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`
  }

  useEffect(() => {
    if (currentMemberIndex < formattedMembers.length) return
    setCurrentMemberIndex(0)
  }, [formattedMembers.length, currentMemberIndex])

  useEffect(() => {
    let aborted = false
    const CACHE_TTL_MS = 30000

    const fetchRoutes = async () => {
      if (!currentLocation) {
        setMemberRoutes([])
        return
      }

      type RouteQuery = {
        id: string
        origin: { lat: number; lng: number }
        destination: { lat: number; lng: number }
        color: string
        title: string
      }

      const queries: RouteQuery[] = []

      if (awayMembers.length > 0) {
        awayMembers.forEach((m) => {
          const isSelf = m.id === selfUserId || m.id === 'you'
          const mLat = isSelf ? currentLocation.lat : m.live_lat
          const mLng = isSelf ? currentLocation.lng : m.live_lng
          if (mLat != null && mLng != null) {
            const forceHost = guidedToHostIds.includes(m.id)
            const useMeetup = guidanceActive && meetupPoint && !forceHost
            const targetPoint = useMeetup ? meetupPoint : hostCoords
            if (targetPoint) {
              const targetTitle = useMeetup ? 'Meetup Point' : 'Host'
              queries.push({
                id: m.id,
                origin: { lat: mLat, lng: mLng },
                destination: { lat: targetPoint.lat, lng: targetPoint.lng },
                color: colorByMember(m.id),
                title: `${m.displayName || 'Separated member'} to ${targetTitle}`
              })
            }
          }
        })
      }

      if (!queries.length) {
        setMemberRoutes([])
        return
      }

      const now = Date.now()
      const resolved: MemberRoute[] = []
      const toFetch: Array<{ query: RouteQuery; key: string }> = []

      for (const query of queries) {
        const key = `${query.id}:${query.origin.lat.toFixed(5)},${query.origin.lng.toFixed(5)}->${query.destination.lat.toFixed(5)},${query.destination.lng.toFixed(5)}`
        const cached = routeCacheRef.current[key]
        if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
          resolved.push(cached)
        } else {
          toFetch.push({ query, key })
        }
      }

      if (toFetch.length) {
        const fetched = await Promise.all(
          toFetch.map(async ({ query, key }) => {
            try {
              const res = await fetch(resolveApiPath('/api/groups/route'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  origin: query.origin,
                  destination: query.destination,
                  profile: 'walking',
                }),
              })
              if (!res.ok) return null
              const data = await res.json()
              if (!data?.geometry) return null
              const route: MemberRoute = {
                id: query.id,
                geometry: data.geometry,
                color: query.color,
                duration: typeof data.duration === 'number' ? data.duration : undefined,
                distance: typeof data.distance === 'number' ? data.distance : undefined,
                title: query.title,
                fetchedAt: Date.now(),
                key,
              }
              routeCacheRef.current[key] = route
              return route
            } catch {
              return null
            }
          }),
        )
        resolved.push(...(fetched.filter(Boolean) as MemberRoute[]))
      }

      if (aborted) return

      const order = new Map(queries.map((q, idx) => [q.id, idx]))
      resolved.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
      setMemberRoutes(resolved)
    }

    fetchRoutes()
    return () => {
      aborted = true
    }
  }, [awayMembers, hostCoords, currentLocation, meetupPoint, selfUserId, guidanceActive, guidedToHostIds])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined
    }

    let watchId: number | null = null

    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          })
        },
        () => {
          setCurrentLocation(null)
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
      ) as unknown as number
    } catch {
      setCurrentLocation(null)
    }

    return () => {
      try {
        if (watchId != null && navigator.geolocation.clearWatch) {
          navigator.geolocation.clearWatch(watchId)
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }, [])

  useEffect(() => {
    if (!toastMessage) return undefined
    const id = window.setTimeout(() => setToastMessage(null), 3000)
    return () => window.clearTimeout(id)
  }, [toastMessage])

  const showToast = (message: string) => {
    setToastMessage(message)
  }

  const handleCall = () => {
    const name = currentMember?.displayName ? currentMember.displayName.split(' ')[0] : 'member'
    showToast(`Establishing encrypted voice link to ${name}...`)
  }

  const handlePing = () => {
    showToast('High-priority haptic ping broadcasted')
  }

  const handleGuide = () => {
    setGuidanceActive((active) => {
      const next = !active
      showToast(next ? 'Real-time guidance active' : 'Guidance stopped. Routing to host.')
      return next
    })
  }

  const handleGuideUserToHost = (memberId: string) => {
    setGuidedToHostIds((prev) => {
      const exists = prev.includes(memberId)
      const next = exists ? prev.filter((id) => id !== memberId) : [...prev, memberId]
      const name = formattedMembers.find(m => m.id === memberId)?.displayName || 'Member'
      showToast(exists ? `Cancelled host guidance for ${name}` : `Routing ${name} directly to Host`)
      return next
    })
  }

  const handleTrafficToggle = () => {
    setTrafficActive((active) => {
      const next = !active
      showToast(next ? 'Traffic overlay enabled' : 'Traffic overlay disabled')
      return next
    })
  }

  const handleLostToggle = () => {
    setLostActive((active) => {
      const next = !active
      showToast(next ? 'Filtered for Lost & Found' : 'Restored global group view')
      return next
    })
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#131317] font-body text-[#e4e1e7] antialiased selection:bg-[#2563EB] selection:text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

        :root {
          color-scheme: dark;
        }

        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }

        .aurora-bloom {
          background: radial-gradient(circle at center, rgba(37, 99, 235, 0.15) 0%, transparent 70%);
        }

        .pulse-red {
          animation: pulse-red 2s infinite;
        }

        @keyframes pulse-red {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; box-shadow: 0 0 15px rgba(239, 68, 68, 0.4); }
          100% { transform: scale(0.95); opacity: 0.8; }
        }

        .obsidian-map {
          background-color: #050507;
          background-image: radial-gradient(circle at 50% 50%, #0d0d12 0%, #050507 100%);
          border: 8px solid #1a1a20;
        }

        .glass-card {
          background: rgba(10, 10, 15, 0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        @keyframes dash {
          to { stroke-dashoffset: -100; }
        }

        .animate-dash {
          animation: dash 5s linear infinite;
        }

        .map-grid {
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        .glow-blue { filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.6)); }
        .glow-red { filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.6)); }
        .glow-orange { filter: drop-shadow(0 0 8px rgba(249, 115, 22, 0.6)); }
        .glow-cyan { filter: drop-shadow(0 0 12px rgba(6, 182, 212, 0.8)); }

        .member-card-active {
          border-color: rgba(37, 99, 235, 0.5) !important;
          background-color: rgba(37, 99, 235, 0.1) !important;
        }

        .chip-active {
          background-color: #2563EB !important;
          color: white !important;
          border-color: transparent !important;
        }

        .chip-red-active {
          background-color: #EF4444 !important;
          color: white !important;
          border-color: transparent !important;
        }

        .marker-highlight {
          transform: scale(1.25) !important;
          z-index: 50 !important;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .notification-toast {
          animation: slideInUp 0.3s forwards, fadeOut 0.3s 2.7s forwards;
        }

        @keyframes slideInUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

      `}</style>

      <div className="fixed bottom-24 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2 pointer-events-none">
        {toastMessage ? (
          <div className="notification-toast flex items-center gap-3 rounded-full border border-white/10 bg-black/90 px-6 py-3 text-white shadow-2xl backdrop-blur-xl">
            <span className="material-symbols-outlined text-[18px]">info</span>
            <span className="text-[11px] font-bold uppercase tracking-wider">{toastMessage}</span>
          </div>
        ) : null}
      </div>

      <TripArcNav />

      <main className="relative min-h-screen overflow-hidden pb-40 pt-16">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 aurora-bloom" />

        <section className="mx-auto max-w-[1400px] px-6 pt-6">
          {awayMembers.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-4 rounded-xl border-l-4 border-green-500 bg-[#1b1b1f] p-4 shadow-xl shadow-blue-950/10 backdrop-blur-xl md:flex-row">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <h1 className="font-headline text-lg font-extrabold tracking-tighter text-white">Group Together &amp; Connected</h1>
                    <span className="rounded-full border border-green-500/30 bg-green-950/50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-green-400">Together</span>
                  </div>
                  <p className="text-sm text-zinc-400">All group members are within a vicinity of 5m from the host.</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 pt-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8d90a0]">Status</span>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-green-400" style={{ fontVariationSettings: `'FILL' 1` }}>check_circle</span>
                  <span className="font-headline text-xl font-black tabular-nums text-white">Secure</span>
                </div>
              </div>
            </div>
          ) : awayMembers.length === 1 ? (
            <div className="flex flex-col items-start justify-between gap-4 rounded-xl border-l-4 border-red-500 bg-[#1b1b1f] p-4 shadow-xl shadow-blue-950/10 backdrop-blur-xl md:flex-row">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-red-500 pulse-red" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <h1 className="font-headline text-lg font-extrabold tracking-tighter text-white">Separation Detected: 1 Member Away</h1>
                    <span className="rounded-full border border-red-500/30 bg-red-950/50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-400">Critical</span>
                  </div>
                  <p className="text-sm text-zinc-400">
                    <strong className="text-white">{awayMembers[0].displayName || '1 member'}</strong> has moved more than 5m away. Displaying directions to the host.
                    {(() => {
                      const distStr = getMemberDistanceToHost(awayMembers[0].id)
                      if (!distStr) return null
                      return (
                        <span> Shortest distance to host: <strong className="text-red-400">{distStr}</strong>.</span>
                      )
                    })()}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 pt-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Separated For</span>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-red-400" style={{ fontVariationSettings: `'FILL' 1` }}>timer</span>
                  <span className="font-headline text-xl font-black tabular-nums text-white">{currentTime}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start justify-between gap-4 rounded-xl border-l-4 border-amber-500 bg-[#1b1b1f] p-4 shadow-xl shadow-blue-950/10 backdrop-blur-xl md:flex-row">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <h1 className="font-headline text-lg font-extrabold tracking-tighter text-white">Separation Detected: Dispersed Group</h1>
                    <span className="rounded-full border border-amber-500/30 bg-amber-950/50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-400">Dispersed</span>
                  </div>
                  <p className="text-sm text-zinc-400">
                    <strong className="text-white">{awayMembers.length} members</strong> have moved more than 5m away in different directions. Common meeting centroid generated.
                    {(() => {
                      const distStr = getMemberDistanceToHost(selfUserId)
                      if (!distStr) return null
                      return (
                        <span> Shortest distance to host: <strong className="text-red-400">{distStr}</strong>.</span>
                      )
                    })()}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 pt-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Separated For</span>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-amber-400" style={{ fontVariationSettings: `'FILL' 1` }}>timer</span>
                  <span className="font-headline text-xl font-black tabular-nums text-white">{currentTime}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mx-auto mt-6 grid h-[calc(100vh-320px)] max-w-[1400px] grid-cols-1 gap-6 px-6 md:grid-cols-12">
          <aside className="flex flex-col gap-4 overflow-y-auto md:col-span-3">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Group Members</h2>
              <span className="rounded-full bg-[#2563EB]/20 px-2 py-0.5 text-[10px] font-bold text-[#b4c5ff]">{formattedMembers.length} Online</span>
            </div>

            {formattedMembers.map((m, idx) => {
              const isYou = m.id === 'you' || m.id === selfUserId
              const isAway = awayMembers.some(am => am.id === m.id)
              const statusLabel = isAway ? 'Separated' : isYou ? 'Safe' : 'Active'
              const statusTone = isAway ? 'text-red-400' : isYou ? 'text-green-400' : 'text-orange-400'
              const initials = (m.displayName || 'User').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()
              return (
                <button
                  key={m.id + idx}
                  type="button"
                  className={`member-card flex items-center gap-4 rounded-2xl border border-white/5 bg-[#1f1f23] p-4 text-left transition-all hover:bg-white/5 ${currentMember?.id === m.id ? 'member-card-active' : ''}`}
                  onClick={() => setCurrentMemberIndex(idx)}
                >
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold text-white">{initials}</div>
                    <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-[#1f1f23] ${isAway ? 'bg-red-500 pulse-red' : isYou ? 'bg-green-500' : 'bg-orange-500'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-bold text-white">
                        {m.displayName || 'Unknown'} {isYou && <span className="text-[10px] text-[#60a5fa] font-normal">(You)</span>}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-tighter ${statusTone}`}>{statusLabel}</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {m.live_lat && m.live_lng ? `${Math.round((m.accuracy || 0))}m accuracy` : 'Location unavailable'}
                      {isAway && (() => {
                        const distStr = getMemberDistanceToHost(m.id)
                        if (!distStr) return null
                        return ` • ${distStr} to host`
                      })()}
                    </p>
                  </div>
                </button>
              )
            })}

            <div className="glass-card mt-auto overflow-hidden rounded-3xl shadow-2xl">
              <div className="relative h-32">
                <img
                  alt="Meetup Location"
                  className="h-full w-full object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBNoJVuJXekO7RHAlR8SWFeIeoQrPKnVeGGPclmTEfAZ-DRPJPW5gD5RoyRgG3gAeUiW1SLdT1haayDcvJOU5xAfrV61jN552dOAzBKo-x4fCzLRyCZquw2ZRi2wOZ68XrESmvA6lqDF0AqkvGVopi-wyT3wmPnzl0F_A6_StXXWfc3NWb3GvDbovo91c6DNC0h_0WpExxm5pzQsfdm4Q8LJ9zma4Wzsa690BJ-xHHtut7Mg-GEle1uuXcGg8MsSz2ejVfUZiAgI8"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-3 left-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-white">location_on</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white">Target Location</span>
                </div>
              </div>
              <div className="space-y-2 p-5">
                <h4 className="font-headline text-base font-extrabold leading-tight tracking-tight text-white">Central Clocktower</h4>
                <p className="text-[11px] font-medium leading-relaxed text-zinc-400">Landmark intersection with 24/7 security lighting.</p>
                <div className="flex items-center gap-2 pt-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4cd7f6]" />
                  <span className="text-[9px] font-bold uppercase tracking-tighter text-[#4cd7f6]">Optimal Safety Rating</span>
                </div>
              </div>
            </div>
          </aside>

          <div className="md:col-span-6 flex flex-col overflow-hidden rounded-[40px] bg-[#050507] shadow-[0_0_60px_rgba(0,0,0,0.8)] obsidian-map">
            <div className="pointer-events-none absolute inset-0 map-grid opacity-20" />

            <div className="pointer-events-none absolute left-0 top-6 z-30 flex w-full items-center justify-between px-6">
              <div className="pointer-events-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTrafficToggle}
                  className={`${trafficActive ? 'chip-active' : 'bg-[#1a1a20]/90 text-white'} flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 backdrop-blur-md transition-all hover:bg-[#39393d]`}
                >
                  <span className="material-symbols-outlined text-[16px] text-zinc-400">traffic</span>
                  <span className="text-[11px] font-bold uppercase tracking-tight">Traffic</span>
                </button>
                <button
                  type="button"
                  onClick={handleLostToggle}
                  className={`${lostActive ? 'chip-red-active' : 'bg-red-500/20 text-red-100'} flex items-center gap-2 rounded-full border border-red-500/30 px-4 py-2 backdrop-blur-md transition-all hover:bg-red-500/30`}
                >
                  <span className="material-symbols-outlined text-[16px] text-red-400" style={{ fontVariationSettings: `'FILL' 1` }}>radio_button_checked</span>
                  <span className="text-[11px] font-bold uppercase tracking-tight">Separated ({awayMembers.length})</span>
                </button>
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1a1a20]/90 py-1 pl-4 pr-1 backdrop-blur-md">
                  <span className="material-symbols-outlined text-[18px] text-zinc-500">search</span>
                  <input
                    className="w-24 border-none bg-transparent p-0 text-[11px] text-white placeholder:text-zinc-500 focus:ring-0"
                    placeholder="Username..."
                    type="text"
                  />
                  <button className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600" type="button">
                    <span className="material-symbols-outlined text-[20px]">add</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="relative flex-1 overflow-hidden">
              <div className="absolute inset-0 z-0">
                <LeafletMap
                  center={liveMapCenter}
                  zoom={15}
                  focusPoint={liveMapCenter}
                  focusZoom={15}
                  currentLocation={currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng, title: 'You are here', accuracy: currentLocation.accuracy } : undefined}
                  routes={memberRoutes}
                  groupMembers={formattedMembers}
                  meetupPoint={meetupPoint || undefined}
                  trafficActive={trafficActive}
                />
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-6 md:col-span-3">
            <div className="rounded-3xl border border-white/5 bg-[#1f1f23] p-5 transition-all duration-300">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Member Spotlight</h3>
              </div>

              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-4 px-2">
                  <div className="h-16 w-16 overflow-hidden rounded-2xl bg-zinc-700">
                    <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white">{currentMember?.displayName ? currentMember.displayName.split(' ').map(s=>s[0]).slice(0,2).join('') : 'U'}</div>
                  </div>
                  <div>
                    <h4 className="group flex cursor-pointer items-center font-headline text-lg font-bold text-white">
                      {currentMember?.displayName || 'Unknown'} {currentMember && (currentMember.id === 'you' || currentMember.id === selfUserId) && <span className="text-xs text-[#60a5fa] font-normal ml-2">(You)</span>}
                      <span className="material-symbols-outlined ml-2 align-middle text-[18px] text-zinc-500 transition-colors group-hover:text-[#b4c5ff]">chevron_right</span>
                    </h4>
                    <div className="mt-1 flex items-center gap-3">
                      <div className="flex items-center gap-1 text-zinc-400">
                        <span className="material-symbols-outlined text-[14px]">battery_full</span>
                        <span className="text-[10px] font-bold">{currentMember?.battery != null ? `${currentMember.battery}%` : '85%'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-zinc-400">
                        <span className="material-symbols-outlined text-[14px]">speed</span>
                        <span className="text-[10px] font-bold">{currentMember?.speed != null ? `${currentMember.speed} km/h` : '0 km/h'}</span>
                      </div>
                    </div>
                    {(() => {
                      const currentMemberIsAway = currentMember && awayMembers.some(am => am.id === currentMember.id)
                      if (!currentMemberIsAway || !currentMember) return null
                      const forceHost = currentMember ? guidedToHostIds.includes(currentMember.id) : false
                      const distStr = getMemberDistanceToHost(currentMember.id)
                      if (!distStr) return null
                      return (
                        <>
                          <div className="mt-2 flex items-center gap-1.5 font-bold text-[10px] px-2 py-0.5 rounded-full border w-fit text-red-400 bg-red-500/10 border-red-500/25">
                            <span className="material-symbols-outlined text-[12px]">directions_walk</span>
                            <span>{distStr} to host</span>
                          </div>
                          {currentMember.id !== activeHostId && (
                            <button
                              type="button"
                              onClick={() => handleGuideUserToHost(currentMember.id)}
                              className={`mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-white shadow-md transition-all active:scale-95 ${
                                forceHost
                                  ? 'bg-zinc-800 hover:bg-zinc-700 border border-white/10'
                                  : 'bg-gradient-to-br from-[#2563EB] to-[#06B6D4] hover:opacity-90'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[12px]">{forceHost ? 'close' : 'near_me'}</span>
                              {forceHost ? 'Cancel Host Route' : (currentMember.id === selfUserId || currentMember.id === 'you' ? 'Guide Me to Host' : `Guide to Host`)}
                            </button>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  {(() => {
                    const currentMemberIsAway = currentMember && awayMembers.some(am => am.id === currentMember.id)
                    const forceHost = currentMember ? guidedToHostIds.includes(currentMember.id) : false
                    return (
                      <>
                        <div className="rounded-xl border-l-2 border-[#2563EB] bg-[#1b1b1f] p-3">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#b4c5ff]">Recovery Insights</span>
                          <p className="text-xs text-zinc-300">
                            {currentMemberIsAway 
                              ? 'Separation threshold exceeded (>5m vicinity from host).' 
                              : 'Member is within safe vicinity of the host.'}
                          </p>
                        </div>
                        <div className="rounded-xl border-l-2 border-[#4cd7f6] bg-[#1b1b1f] p-3">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#4cd7f6]">Safety Suggestion</span>
                          <p className="text-xs text-zinc-300">
                            {currentMemberIsAway 
                              ? (guidanceActive && meetupPoint && !forceHost
                                  ? 'Navigate towards the smart meetup point.' 
                                  : 'Navigate directly towards the group host.')
                              : 'Maintain current pace. No safety actions required.'}
                          </p>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>

             <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <h3 className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Live Feed</h3>
              <div className="space-y-4 overflow-y-auto px-2">
                {formattedMembers.length === 0 ? (
                  <p className="px-2 text-xs text-zinc-500">No active members connected.</p>
                ) : (
                  formattedMembers.map((m, idx) => {
                    const isSelf = m.id === 'you' || m.id === selfUserId
                    const name = isSelf ? 'You' : m.displayName || 'Member'
                    const isAway = awayMembers.some(am => am.id === m.id)
                    
                    let barColor = 'bg-[#353439]'
                    let statusText = ''
                    
                    if (isAway) {
                      barColor = 'bg-red-500 pulse-red'
                      statusText = isSelf 
                        ? 'are separated (>5m) from the host.' 
                        : 'is separated (>5m) from the host.'
                    } else if (m.battery != null && m.battery < 25) {
                      barColor = 'bg-amber-500'
                      statusText = isSelf
                        ? `have low battery (${m.battery}%).`
                        : `has low battery (${m.battery}%).`
                    } else {
                      barColor = 'bg-zinc-800'
                      const movement = m.speed && m.speed > 0 ? `moving at ${m.speed} km/h` : 'stationary'
                      statusText = isSelf
                        ? `are connected and ${movement}.`
                        : `is connected and ${movement}.`
                    }

                    const timeAgo = getTimeAgoString(m.last_updated)

                    return (
                      <div key={m.id + '-' + idx} className="flex gap-3">
                        <div className={`h-auto w-1 rounded-full ${barColor}`} />
                        <div className="py-1">
                          <p className="text-xs text-zinc-300">
                            <strong className="text-white">{name}</strong> {statusText}
                          </p>
                          <span className="text-[10px] font-medium text-zinc-500">{timeAgo}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </aside>
        </section>
      </main>

      <footer className="fixed bottom-0 left-0 z-50 w-full bg-[#1F1F23]/80 px-4 pb-10 pt-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="order-2 flex gap-2 md:order-1">
            <button
              type="button"
              onClick={handleCall}
              className="flex items-center gap-2 rounded-xl bg-[#353439] px-5 py-3 text-xs font-bold text-[#dbe1ff] transition-all hover:bg-[#3a393d] active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">call</span>
              Call {currentMember?.displayName ? currentMember.displayName.split(' ')[0] : 'Member'}
            </button>
            <button
              type="button"
              onClick={handlePing}
              className="flex items-center gap-2 rounded-xl bg-[#353439] px-5 py-3 text-xs font-bold text-[#dbe1ff] transition-all hover:bg-[#3a393d] active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">sensors</span>
              Send Ping
            </button>
            {(() => {
              const currentMemberIsAway = currentMember && awayMembers.some(am => am.id === currentMember.id)
              const isHost = currentMember?.id === activeHostId
              if (!currentMemberIsAway || isHost || !currentMember) return null
              const forceHost = guidedToHostIds.includes(currentMember.id)
              const isYou = currentMember.id === 'you' || currentMember.id === selfUserId
              const btnText = forceHost ? 'Cancel Host Route' : (isYou ? 'Guide Me to Host' : `Guide to Host`)
              return (
                <button
                  type="button"
                  onClick={() => handleGuideUserToHost(currentMember.id)}
                  className={`flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-bold transition-all active:scale-95 ${
                    forceHost 
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-[#dbe1ff] border border-white/10' 
                      : 'bg-gradient-to-br from-[#2563EB] to-[#06B6D4] text-white hover:opacity-90 shadow-md shadow-blue-500/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{forceHost ? 'close' : 'near_me'}</span>
                  {btnText}
                </button>
              )
            })()}
          </div>
          <button
            type="button"
            onClick={handleGuide}
            disabled={!isSelfAway}
            className={`order-1 flex w-full items-center justify-center gap-3 rounded-2xl px-10 py-4 text-sm font-extrabold text-white shadow-xl transition-all md:order-2 md:w-auto ${
              !isSelfAway
                ? 'bg-zinc-800/40 text-zinc-600 border border-white/5 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-br from-[#2563EB] to-[#06B6D4] shadow-blue-600/20 active:scale-[0.98] hover:opacity-95'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' 1` }}>near_me</span>
            {guidanceActive ? 'Stop Guidance' : 'Guide Me to Meeting Point'}
          </button>
        </div>
      </footer>
    </div>
  )
}