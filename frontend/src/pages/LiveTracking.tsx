import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldAlert, Play, Clock, AlertTriangle, CheckCircle, Video } from 'lucide-react'
import { resolveApiPath } from '../lib/apiClient'
import LeafletMap from '../components/LeafletMap'

type SOSClip = {
  id: string
  clip_url: string
  duration_seconds: number
  created_at: string
}

type SOSPing = {
  lat: number
  lng: number
  timestamp: string
}

type SOSEvent = {
  id: string
  user_id: string
  trigger_type: string
  status: 'active' | 'resolved'
  started_at: string
  ended_at: string | null
}

export default function LiveTracking() {
  const { eventId } = useParams<{ eventId: string }>()
  const [event, setEvent] = useState<SOSEvent | null>(null)
  const [clips, setClips] = useState<SOSClip[]>([])
  const [pings, setPings] = useState<SOSPing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeClipUrl, setActiveClipUrl] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Stellora SOS Live Tracking'
    document.documentElement.classList.add('dark')
    return () => {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const fetchData = async () => {
    if (!eventId) return
    try {
      const res = await fetch(resolveApiPath(`/api/sos/track/${eventId}`))
      if (!res.ok) {
        throw new Error(`Tracking session not found: ${res.statusText}`)
      }
      const data = await res.json()
      setEvent(data.event)
      setClips(data.clips || [])
      setPings(data.pings || [])
      setError(null)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Unable to load tracking details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
    // Poll every 5 seconds for live updates
    const timer = setInterval(fetchData, 5000)
    return () => clearInterval(timer)
  }, [eventId])

  const resolveClipUrl = (url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    return resolveApiPath(url)
  }

  const routePoints = useMemo<[number, number][]>(() => {
    return pings.map((p) => [p.lat, p.lng])
  }, [pings])

  const centerPoint = useMemo<[number, number]>(() => {
    if (pings.length > 0) {
      const last = pings[pings.length - 1]
      return [last.lat, last.lng]
    }
    return [12.9716, 77.5946] // Default center
  }, [pings])

  const lastLocation = useMemo(() => {
    if (pings.length > 0) {
      return pings[pings.length - 1]
    }
    return null
  }, [pings])

  if (loading && !event) {
    return (
      <div className="min-h-screen bg-[#0b0b11] text-[#f1eced] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-[#ffab1a]/20 border-t-[#ffab1a] animate-spin" />
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#ffab1a]">Loading Live Tracking...</p>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-[#0b0b11] text-[#f1eced] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#1b171d] rounded-2xl p-8 border border-red-500/20 text-center shadow-2xl">
          <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
          <h2 className="text-xl font-bold mb-2">Tracking Session Inactive</h2>
          <p className="text-sm text-[#c8c2cb] mb-6">
            The tracking link might have expired, or this event was resolved and its data was purged.
          </p>
          <div className="text-[10px] text-red-400 font-mono bg-red-500/10 p-2 rounded-lg truncate">
            {error || 'Event ID not found'}
          </div>
        </div>
      </div>
    )
  }

  const isSessionActive = event.status === 'active'

  return (
    <div className="min-h-screen bg-[#0b0b11] text-[#f1eced] selection:bg-[#ffb4ab]/30 relative overflow-hidden font-[Manrope]">
      <div
        className="aurora-bg"
        style={{
          position: 'fixed',
          background: 'radial-gradient(circle at 50% 18%, rgba(110, 20, 36, 0.3) 0%, rgba(11, 11, 17, 0) 50%), radial-gradient(circle at 72% 60%, rgba(24, 76, 145, 0.12) 0%, rgba(11, 11, 17, 0) 40%)',
          inset: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex h-16 items-center justify-between border-b border-white/5 bg-[#131317]/80 px-6 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <ShieldAlert className="text-[#ffb31a] animate-pulse" size={24} />
          <div>
            <span className="text-[12px] font-black uppercase tracking-[0.16em] text-zinc-100">
              Stellora Emergency Tracker
            </span>
            <p className="text-[9px] text-[#c6c1c9] tracking-[0.08em] mt-0.5 font-mono">
              SESSION ID: {event.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            {isSessionActive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isSessionActive ? 'bg-red-500' : 'bg-green-500'}`} />
          </span>
          <span className={`text-[10px] font-extrabold uppercase tracking-widest ${isSessionActive ? 'text-red-400' : 'text-green-400'}`}>
            {isSessionActive ? 'LIVE TRACKING' : 'RESOLVED'}
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="pt-20 pb-12 px-4 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-5rem)]">
        {/* Left Side: Map & Info */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-[#1b171d] rounded-2xl p-6 border border-white/5 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[9px] uppercase tracking-[0.15em] text-[#c8c2cb]">SOS Event Triggered</p>
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                {isSessionActive ? (
                  <>
                    <span className="text-red-500 font-extrabold animate-pulse">●</span> Emergency Active
                  </>
                ) : (
                  <>
                    <CheckCircle className="text-green-400 inline" size={20} /> Event Resolved
                  </>
                )}
              </h2>
              <div className="flex items-center gap-4 text-xs text-[#c8c2cb] mt-2">
                <span className="flex items-center gap-1.5 font-mono">
                  <Clock size={14} className="text-[#a7c4ff]" />
                  Started: {new Date(event.started_at).toLocaleTimeString()}
                </span>
                {event.ended_at && (
                  <span className="flex items-center gap-1.5 font-mono">
                    <CheckCircle size={14} className="text-green-400" />
                    Ended: {new Date(event.ended_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <p className="text-[9px] uppercase tracking-[0.15em] text-[#c8c2cb] mb-1">Trigger Method</p>
              <span className="bg-[#ffb31a]/10 text-[#ffb31a] text-[10px] font-bold px-3 py-1.5 rounded-lg border border-[#ffb31a]/20 uppercase tracking-widest">
                {event.trigger_type} trigger
              </span>
            </div>
          </div>

          {/* Interactive Map */}
          <div className="relative rounded-2xl overflow-hidden h-[450px] lg:h-[550px] bg-[#0e0d12] border border-white/5 shadow-2xl">
            <LeafletMap
              center={centerPoint}
              zoom={pings.length > 0 ? 15 : 13}
              route={routePoints}
              currentLocation={
                lastLocation
                  ? {
                      lat: lastLocation.lat,
                      lng: lastLocation.lng,
                      title: isSessionActive ? 'Last Known Location' : 'Last Location Reported',
                      accuracy: 25,
                    }
                  : undefined
              }
            />
          </div>
        </section>

        {/* Right Side: Media Evidence Vault */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#1b171d] rounded-2xl p-6 border border-white/5 shadow-xl flex-1 flex flex-col min-h-[400px]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-[#c8c2cb]">Evidence Clips</h3>
                <p className="text-[10px] text-[#c8c2cb]/60 mt-1">Recorded video and audio from user&apos;s device</p>
              </div>
              <Video className="text-[#ffab1a]" size={20} />
            </div>

            {clips.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/5 rounded-xl">
                <Video className="text-[#c8c2cb]/20 mb-3" size={36} />
                <p className="text-xs font-semibold text-[#c8c2cb]">No evidence clips uploaded yet</p>
                <p className="text-[10px] text-[#c8c2cb]/40 mt-1">Clips upload automatically every 10 seconds</p>
              </div>
            ) : (
              <div className="space-y-4 flex-1 overflow-y-auto max-h-[480px] pr-1">
                {clips.map((clip, index) => {
                  const clipUrl = resolveClipUrl(clip.clip_url)
                  const isActive = activeClipUrl === clipUrl
                  return (
                    <div
                      key={clip.id}
                      className={`group rounded-xl border p-3 transition-all duration-300 ${
                        isActive
                          ? 'border-[#ffb31a] bg-[#ffb31a]/5'
                          : 'border-white/5 bg-[#0b0b0d]/60 hover:bg-[#0b0b0d]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-[#a7c4ff] font-mono">
                          CLIP #{clips.length - index}
                        </span>
                        <span className="text-[9px] text-[#c8c2cb]/50 font-mono">
                          {new Date(clip.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      {isActive ? (
                        <div className="rounded-lg overflow-hidden border border-white/10 aspect-video bg-black relative mb-2">
                          <video
                            src={clipUrl}
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveClipUrl(clipUrl)}
                          className="w-full flex items-center justify-between bg-[#1f1a23] hover:bg-[#28222d] border border-white/5 rounded-lg px-3 py-2 text-xs font-bold text-white transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <Play size={12} className="text-[#ffb31a]" />
                            Play clip ({Math.round(clip.duration_seconds || 10)}s)
                          </span>
                          <Video size={14} className="text-[#c8c2cb]/40 group-hover:text-white" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
