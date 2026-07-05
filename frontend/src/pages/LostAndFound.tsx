import { useEffect, useMemo, useRef, useState } from 'react'
import LeafletMap from '../components/LeafletMap'
import TripArcNav from '../components/TripArcNav'
import { useGroup } from '../hooks/useGroup'
import { useOraPageContext } from '../types/oraContext'
import { globalActionRegistry } from '../agent/actionRegistry'

type Member = {
  id: string
  displayName?: string
  live_lat?: number | null
  live_lng?: number | null
  accuracy?: number | null
  last_updated?: string | null
  is_lost?: boolean
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
export default function LostAndFoundPage() {
  const storedGroupId = typeof window !== 'undefined' ? window.localStorage.getItem('triparc:group_id') || undefined : undefined
  const { members: liveMembers } = useGroup(storedGroupId)
  const [currentMemberIndex, setCurrentMemberIndex] = useState(0)
  const [seconds, setSeconds] = useState(262)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null)
  const [trafficActive, setTrafficActive] = useState(false)
  const [lostActive, setLostActive] = useState(true)
  const [guidanceActive, setGuidanceActive] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const { setPageContext } = useOraPageContext()

  const formattedMembers: Member[] = useMemo(() => {
    if (liveMembers && liveMembers.length) {
      return liveMembers.map((m: any) => ({
        id: m.user_id || (m.display_name || 'unknown').toLowerCase().replace(/\s+/g, '-'),
        displayName: m.display_name || m.user_id,
        live_lat: m.live_lat,
        live_lng: m.live_lng,
        accuracy: m.accuracy,
        last_updated: m.last_updated,
        is_lost: !!m.is_lost,
      }))
    }
    return []
  }, [liveMembers])

  useEffect(() => {
    const visibleEntities = formattedMembers.map((m) => ({
      type: 'member',
      id: m.id,
      summary: `${m.displayName || m.id} (Status: ${m.is_lost ? 'LOST' : 'OK'})`
    }))

    setPageContext({
      pageId: 'lost-found',
      pageSummary: `Group Lost & Found page tracking ${formattedMembers.length} members.`,
      visibleEntities,
      availableActions: ['alert_member', 'join_group', 'navigate'],
      userFacingState: {
        groupId: storedGroupId || 'None',
        membersCount: formattedMembers.length,
        members: formattedMembers.map(m => ({
          id: m.id,
          name: m.displayName,
          is_lost: m.is_lost,
          lat: m.live_lat,
          lng: m.live_lng,
          last_updated: m.last_updated
        })),
        selfLocation: currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : null
      },
      lastUpdated: Date.now()
    })

    return () => {
      setPageContext(null)
    }
  }, [formattedMembers, storedGroupId, currentLocation, setPageContext])

  useEffect(() => {
    const unsubAlert = globalActionRegistry.register('alert_member', (params) => {
      const { memberId, message } = params
      const m = formattedMembers.find(member => member.id === memberId)
      if (m) {
        setToastMessage(`Alert sent to ${m.displayName || m.id}: ${message || 'Are you okay?'}`)
      } else {
        setToastMessage(`Sent group alert: ${message || 'Please check in.'}`)
      }
    })

    const unsubJoin = globalActionRegistry.register('join_group', (params) => {
      const { code } = params
      if (code) {
        window.localStorage.setItem('triparc:group_id', code)
        setToastMessage(`Joined group ${code}`)
        window.location.reload()
      }
    })

    return () => {
      unsubAlert()
      unsubJoin()
    }
  }, [formattedMembers])
  const currentMember = formattedMembers[currentMemberIndex] || null

  const currentTime = useMemo(() => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [seconds])

  const liveMapCenter: [number, number] = currentLocation ? [currentLocation.lat, currentLocation.lng] : mapCenter
  const [memberRoutes, setMemberRoutes] = useState<MemberRoute[]>([])
  const routeCacheRef = useRef<Record<string, MemberRoute>>({})

  const selfUserId = typeof window !== 'undefined' ? window.localStorage.getItem('triparc:user_id') || '' : ''
  const colorByMember = (id: string) => {
    const palette = ['#FF7A59', '#2f8cff', '#06b6d4', '#f59e0b', '#22c55e']
    let acc = 0
    for (let i = 0; i < id.length; i += 1) acc += id.charCodeAt(i)
    return palette[acc % palette.length]
  }

  const routeKeyFor = (member: Member, destination: { lat: number; lng: number }) => {
    const oLat = Number(member.live_lat || 0).toFixed(5)
    const oLng = Number(member.live_lng || 0).toFixed(5)
    const dLat = Number(destination.lat).toFixed(5)
    const dLng = Number(destination.lng).toFixed(5)
    return `${member.id}:${oLat},${oLng}->${dLat},${dLng}`
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      setSeconds((value) => value + 1)
    }, 1000)

    return () => window.clearInterval(id)
  }, [])

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

      const targetMembers = guidanceActive
        ? formattedMembers.filter((m) => m.live_lat != null && m.live_lng != null && m.id !== selfUserId)
        : currentMember && currentMember.live_lat != null && currentMember.live_lng != null && currentMember.id !== selfUserId
        ? [currentMember]
        : []

      if (!targetMembers.length) {
        setMemberRoutes([])
        return
      }

      const now = Date.now()
      const resolved: MemberRoute[] = []
      const toFetch: Array<{ member: Member; key: string }> = []

      for (const member of targetMembers) {
        const key = routeKeyFor(member, { lat: currentLocation.lat, lng: currentLocation.lng })
        const cached = routeCacheRef.current[key]
        if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
          resolved.push(cached)
        } else {
          toFetch.push({ member, key })
        }
      }

      if (toFetch.length) {
        const fetched = await Promise.all(
          toFetch.map(async ({ member, key }) => {
            try {
              const res = await fetch('/api/groups/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  origin: { lat: member.live_lat, lng: member.live_lng },
                  destination: { lat: currentLocation.lat, lng: currentLocation.lng },
                  profile: 'walking',
                }),
              })
              if (!res.ok) return null
              const data = await res.json()
              if (!data?.geometry) return null
              const route: MemberRoute = {
                id: member.id,
                geometry: data.geometry,
                color: colorByMember(member.id),
                duration: typeof data.duration === 'number' ? data.duration : undefined,
                distance: typeof data.distance === 'number' ? data.distance : undefined,
                title: member.displayName || member.id,
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

      const order = new Map(targetMembers.map((m, idx) => [m.id, idx]))
      resolved.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
      setMemberRoutes(resolved)
    }

    fetchRoutes()
    return () => {
      aborted = true
    }
  }, [formattedMembers, currentMember, currentLocation, guidanceActive, selfUserId])

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
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
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
      showToast(next ? 'Real-time guidance active' : 'Navigation suspended')
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
          <div className="flex flex-col items-start justify-between gap-4 rounded-xl border-l-4 border-red-500 bg-[#1b1b1f] p-4 shadow-xl shadow-blue-950/10 backdrop-blur-xl md:flex-row">
            <div className="flex items-center gap-4">
              <div className="h-3 w-3 rounded-full bg-red-500 pulse-red" />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <h1 className="font-headline text-lg font-extrabold tracking-tighter text-white">Group Separation Detected</h1>
                  <span className="rounded-full border border-red-500/30 bg-red-950/50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-400">Critical</span>
                </div>
                <p className="text-sm text-zinc-400">2 members are apart. Smart meetup point generated.</p>
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
        </section>

        <section className="mx-auto mt-6 grid h-[calc(100vh-320px)] max-w-[1400px] grid-cols-1 gap-6 px-6 md:grid-cols-12">
          <aside className="flex flex-col gap-4 overflow-y-auto md:col-span-3">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Group Members</h2>
              <span className="rounded-full bg-[#2563EB]/20 px-2 py-0.5 text-[10px] font-bold text-[#b4c5ff]">{formattedMembers.length} Online</span>
            </div>

            {formattedMembers.map((m, idx) => {
              const isYou = m.id === 'you' || m.id === (window.localStorage.getItem('triparc:user_id') || '')
              const statusLabel = m.is_lost ? 'Separated' : isYou ? 'Safe' : 'Active'
              const statusTone = m.is_lost ? 'text-red-400' : isYou ? 'text-green-400' : 'text-orange-400'
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
                    <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-[#1f1f23] ${m.is_lost ? 'bg-red-500 pulse-red' : isYou ? 'bg-green-500' : 'bg-orange-500'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-bold text-white">{m.displayName || 'Unknown'}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-tighter ${statusTone}`}>{statusLabel}</span>
                    </div>
                    <p className="text-xs text-zinc-500">{m.live_lat && m.live_lng ? `${Math.round((m.accuracy || 0))}m accuracy` : 'Location unavailable'}</p>
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
                  <span className="text-[11px] font-bold uppercase tracking-tight">Lost &amp; Found (2)</span>
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
                      {currentMember?.displayName || 'Unknown'}
                      <span className="material-symbols-outlined ml-2 align-middle text-[18px] text-zinc-500 transition-colors group-hover:text-[#b4c5ff]">chevron_right</span>
                    </h4>
                    <div className="mt-1 flex items-center gap-3">
                      <div className="flex items-center gap-1 text-zinc-400">
                        <span className="material-symbols-outlined text-[14px]">battery_full</span>
                        <span className="text-[10px] font-bold">--</span>
                      </div>
                      <div className="flex items-center gap-1 text-zinc-400">
                        <span className="material-symbols-outlined text-[14px]">speed</span>
                        <span className="text-[10px] font-bold">--</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="rounded-xl border-l-2 border-[#2563EB] bg-[#1b1b1f] p-3">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#b4c5ff]">Recovery Insights</span>
                    <p className="text-xs text-zinc-300">{currentMember?.is_lost ? 'Member appears separated from group.' : 'No insights available.'}</p>
                  </div>
                  <div className="rounded-xl border-l-2 border-[#4cd7f6] bg-[#1b1b1f] p-3">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#4cd7f6]">Safety Suggestion</span>
                    <p className="text-xs text-zinc-300">{currentMember?.is_lost ? 'Consider moving toward the meetup point.' : 'No suggestions at this time.'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <h3 className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Live Feed</h3>
              <div className="space-y-4 overflow-y-auto px-2">
                <div className="flex gap-3">
                  <div className="h-auto w-1 rounded-full bg-zinc-800" />
                  <div className="py-1">
                    <p className="text-xs text-zinc-300">
                      <strong className="text-white">Leo</strong> is 50m from meetup point.
                    </p>
                    <span className="text-[10px] font-medium text-zinc-500">12s ago</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-auto w-1 rounded-full bg-red-500/30" />
                  <div className="py-1">
                    <p className="text-xs text-zinc-300">
                      <strong className="text-white">Sarah</strong> accepted meetup request.
                    </p>
                    <span className="text-[10px] font-medium text-zinc-500">1m ago</span>
                  </div>
                </div>
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
              Call Sarah
            </button>
            <button
              type="button"
              onClick={handlePing}
              className="flex items-center gap-2 rounded-xl bg-[#353439] px-5 py-3 text-xs font-bold text-[#dbe1ff] transition-all hover:bg-[#3a393d] active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">sensors</span>
              Send Ping
            </button>
          </div>
          <button
            type="button"
            onClick={handleGuide}
            className="order-1 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#06B6D4] px-10 py-4 text-sm font-extrabold text-white shadow-xl shadow-blue-600/20 transition-transform active:scale-[0.98] md:order-2 md:w-auto"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' 1` }}>near_me</span>
            {guidanceActive ? 'Stop Guidance' : 'Guide Me to Meetup Point'}
          </button>
        </div>
      </footer>
    </div>
  )
}