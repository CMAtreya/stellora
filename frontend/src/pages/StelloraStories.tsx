import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapPin, Play, Navigation, Radio, Satellite, Sparkles, ArrowLeft, StopCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import TripArcShell from '../components/TripArcShell'
import { supabase } from '../lib/supabaseClient'

// Simple distance helper for geofence checks.
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

type Story = {
  id: string
  title: string
  place_id?: string
  xid?: string
  lat?: number
  lon?: number
  audio_url_quick?: string
  audio_url_full?: string
  summary?: string
  duration_minutes?: number
  location?: string
}

type ItineraryItem = {
  id: string
  xid?: string
  title: string
  location: string
  timeSlot: string
  durationMinutes: number
  category: string
  status?: 'planned' | 'suggested' | 'skipped'
  note?: string
  dayNumber?: number
  crowdLevel?: string
  coords?: { lat: number; lng: number }
}

type LocationState = {
  items?: ItineraryItem[]
  city?: string
}

async function fetchSavedStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('id,title,place_id,xid,lat,lon,audio_url_quick,audio_url_full,summary,duration_minutes,location')
    .limit(50)
  if (!error && data && data.length > 0) {
    return data as Story[]
  }
  return []
}

export default function StelloraStories() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState | null) || {}

  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [watching, setWatching] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null)
  const [autoPlayId, setAutoPlayId] = useState<string | null>(null)
  const [lastTrigger, setLastTrigger] = useState<Record<string, number>>({})
  const [generating, setGenerating] = useState(false)
  const [genMessage, setGenMessage] = useState<string | null>(null)
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})

  const toggleFlip = async (id: string, story?: Story) => {
    setFlipped(prev => ({ ...prev, [id]: !prev[id] }))

    // If flipping OPEN and story has no real summary, fetch one
    if (story && (!flipped[id]) && (!story.summary || story.summary.startsWith('Story about') || story.summary.length < 20)) {
      try {
        // Optimistic update
        setStories(prev => prev.map(s => s.id === id ? { ...s, summary: 'Fetching quick guide...' } : s))

        const res = await fetch(`${apiUrl}/place-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: story.title, location: story.location })
        })
        if (res.ok) {
          const data = await res.json()
          if (data.summary) {
            setStories(prev => prev.map(s => s.id === id ? { ...s, summary: data.summary } : s))
          }
        }
      } catch (e) {
        setStories(prev => prev.map(s => s.id === id ? { ...s, summary: 'Could not load summary.' } : s))
      }
    }
  }

  const truncateWords = (str: string, max: number) => {
    const array = str.trim().split(/\s+/)
    return array.length <= max ? str : array.slice(0, max).join(' ') + '...'
  }

  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  const watchIdRef = useRef<number | null>(null)
  const apiUrl = useMemo(() => import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '') || null, [])

  const toPlayableUrl = (url?: string) => {
    if (!url) return url
    if (url.startsWith('data:')) return url
    if (!apiUrl) return url
    if (url.startsWith(apiUrl)) return url
    return `${apiUrl}/audio-proxy?url=${encodeURIComponent(url)}`
  }

  const speakText = (text?: string) => {
    if (typeof window === 'undefined' || !text) return
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = 1.04
      utter.pitch = 1
      window.speechSynthesis.speak(utter)
    } catch (err) {
      console.warn('Speech synthesis failed', err)
    }
  }

  // Load items from state (Finalized page) and fetch saved stories from DB
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      const savedStories = await fetchSavedStories()

      let merged: Story[] = [...savedStories]

      if (state.items && state.items.length > 0) {
        // Merge state items, avoiding duplicates if they already exist in saved stories
        const stateStories: Story[] = state.items.map(item => {
          // Check if we already have this story from DB (by xid or title fuzzy match)
          const existing = savedStories.find(s => s.xid === item.xid || s.title === item.title)
          if (existing) return existing

          // Convert ItineraryItem to Story format
          return {
            id: item.id,
            title: item.title,
            xid: item.xid,
            location: item.location,
            summary: item.note || `Story about ${item.title}`,
            duration_minutes: item.durationMinutes > 10 ? 3 : 1, // Estimate story length logic
            lat: item.coords?.lat,
            lon: item.coords?.lng
          }
        })

        // Combine, filtering duplicates from the state side
        const uniqueStateStories = stateStories.filter(ss => !merged.find(m => m.id === ss.id))
        merged = [...uniqueStateStories, ...merged]
      }

      // If still empty, add demo
      if (merged.length === 0) {
        merged = [
          {
            id: 'demo-ctr',
            title: 'CTR — Butter Dosa Origin',
            lat: 13.0107,
            lon: 77.5696,
            summary: 'How CTR became a Bengaluru breakfast icon and the legend of the benne dosa.',
            duration_minutes: 3,
            location: 'CTR, Malleshwaram',
          }
        ]
      }

      setStories(merged)
      setLoading(false)
    }

    loadData()
  }, [state.items])

  const nearest = useMemo(() => {
    if (!position || stories.length === 0) return null
    let best: { story: Story; dist: number } | null = null
    for (const s of stories) {
      if (typeof s.lat !== 'number' || typeof s.lon !== 'number') continue
      const dist = distanceMeters(position.lat, position.lon, s.lat, s.lon)
      if (!best || dist < best.dist) {
        best = { story: s, dist }
      }
    }
    return best
  }, [position, stories])

  useEffect(() => {
    if (!watching || !position || !stories.length) return
    for (const s of stories) {
      if (typeof s.lat !== 'number' || typeof s.lon !== 'number') continue
      const dist = distanceMeters(position.lat, position.lon, s.lat, s.lon)
      const last = lastTrigger[s.id] || 0
      const now = Date.now()
      const canTrigger = dist <= 150 && now - last > 5 * 60 * 1000
      if (canTrigger) {
        setActiveStoryId(s.id)
        setAutoPlayId(s.id)
        setLastTrigger((prev) => ({ ...prev, [s.id]: now }))
        break
      }
    }
  }, [position, stories, watching, lastTrigger])

  const startWatching = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation not supported.')
      return
    }
    setGeoError(null)
    setWatching(true)
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      (err) => {
        setGeoError(err.message || 'Unable to read location.')
        setWatching(false)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    )
    watchIdRef.current = id
  }

  const stopWatching = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setWatching(false)
  }

  const handlePlay = (story: Story, type: 'quick' | 'full') => {
    const url = type === 'quick' ? story.audio_url_quick : story.audio_url_full

    // If no URL, try text-to-speech fallback
    if (!url) {
      if (type === 'quick') {
        speakText(story.summary || story.title)
      } else {
        // Mock full text if not real
        speakText(`Full history of ${story.title}. This is a place known for... ${story.summary}`)
      }
      setActiveStoryId(story.id)
      setAutoPlayId(null)
      return
    }

    const playable = toPlayableUrl(url)
    setActiveStoryId(story.id)
    setAutoPlayId(null)
    const ref = audioRefs.current[story.id]
    if (ref && playable) {
      ref.src = playable
      ref.play().catch(() => undefined)
    }
  }

  const handleStop = (id: string) => {
    // Stop Audio
    const ref = audioRefs.current[id]
    if (ref) {
      ref.pause()
      ref.currentTime = 0
    }
    // Stop SpeechSynthesis
    if (typeof window !== 'undefined') window.speechSynthesis.cancel()

    if (activeStoryId === id) setActiveStoryId(null)
  }

  const handleGenerateStory = async (hint?: Story) => {
    if (!apiUrl) {
      setGenMessage('Set VITE_API_URL')
      return
    }

    // Prioritize the hint (clicked story)
    const basis = hint || nearest?.story || (position ? {
      id: 'temp',
      title: 'Current Location',
      lat: position.lat,
      lon: position.lon,
      location: 'Here',
      summary: 'Spot check'
    } : null)

    if (!basis) {
      setGenMessage('Select a story or move nearby.')
      return
    }

    setGenerating(true)
    setGenMessage(`Generating audio for ${basis.title}...`)

    try {
      const res = await fetch(`${apiUrl}/generate-story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: basis.title,
          lat: basis.lat,
          lon: basis.lon,
          kinds: 'culture,food,landmark',
          rating: 4.5,
          reviewsSnippet: basis.summary,
          location: basis.location,
          xid: basis.xid,
          place_id: basis.place_id, // Pass place_id if we have it
        }),
      })
      if (!res.ok) throw new Error('API failed')

      const data = (await res.json()) as Story
      setStories((prev) => {
        // Update existing if ID matches, else add
        const idx = prev.findIndex(p => p.id === basis.id || p.id === data.id)
        if (idx >= 0) {
          const clone = [...prev]
          clone[idx] = { ...clone[idx], ...data, id: basis.id } // Keep original ID if possible to match state
          return clone
        }
        return [data, ...prev]
      })
      setGenMessage('Story ready.')
    } catch (e) {
      setGenMessage('Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <TripArcShell mainClassName="max-w-6xl">
      <header className="mb-8 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60 mb-2">TripArc Audio</p>
            <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl text-white">Story Mode</h1>
            <p className="text-white/70 mt-2 max-w-xl">Deep dives, quick tales, and local secrets for your journey. Auto-plays when you're 150m close.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={watching ? stopWatching : startWatching}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${watching ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-100' : 'border-white/20 bg-white/5 text-white/80 hover:bg-white/10'}`}
            >
              {watching ? <Radio size={14} className="animate-pulse" /> : <Navigation size={14} />}
              {watching ? 'Watching GPS' : 'Start GPS'}
            </button>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex flex-wrap gap-3 text-xs text-white/60">
          {geoError && <span className="rounded-full bg-rose-500/10 border border-rose-500/20 px-3 py-1 text-rose-200">{geoError}</span>}
          {position && (
            <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 flex items-center gap-2">
              <Satellite size={12} /> {position.lat.toFixed(4)}, {position.lon.toFixed(4)}
            </span>
          )}
          {nearest && (
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-emerald-200">
              <MapPin size={12} className="inline mr-1" /> Near {nearest.story.title} ({Math.round(nearest.dist)}m)
            </span>
          )}
          {genMessage && <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-indigo-200">{genMessage}</span>}
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {loading && (
          <div className="col-span-full py-12 text-center text-white/30 italic">Loading audio library...</div>
        )}

        {!loading && stories.length === 0 && (
          <div className="col-span-full py-12 text-center text-white/30">No stories found. Add some stops to your plan!</div>
        )}

        {stories.map((story) => {
          const isActive = activeStoryId === story.id
          const isFlipped = flipped[story.id] || false
          const hasAudio = !!(story.audio_url_quick || story.audio_url_full)

          return (
            <div key={story.id} className="group relative h-[360px] rounded-3xl" style={{ perspective: '1000px' }}>
              <motion.div
                initial={false}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                className="relative w-full h-full"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* FRONT FACE */}
                <div
                  className={`absolute inset-0 flex flex-col gap-4 rounded-3xl border p-6 transition-all duration-300 ${isActive ? 'border-white/20 bg-emerald-900/10 shadow-[0_24px_60px_-12px_rgba(16,185,129,0.2)]' : 'border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 shadow-[0_24px_60px_-38px_rgba(0,0,0,1)]'}`}
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className="flex justify-between items-start">
                    <div className="p-3 rounded-full bg-white/5 border border-white/10 text-white/70">
                      {isActive ? <Radio size={18} className="animate-spin-slow" /> : <Sparkles size={18} />}
                    </div>
                    {story.duration_minutes && (
                      <span className="text-[10px] uppercase tracking-wider text-white/40 border border-white/10 rounded-full px-2 py-1">{story.duration_minutes} min check</span>
                    )}
                  </div>

                  <div>
                    <h3
                      onClick={(e) => { e.stopPropagation(); toggleFlip(story.id, story); }}
                      className="text-xl font-bold text-white leading-tight mb-1 cursor-pointer hover:text-amber-200 transition-colors flex items-center gap-2"
                      title="Tap for details"
                    >
                      {story.title} <span className="text-[10px] opacity-40 font-normal border border-white/20 rounded px-1 ml-auto">INFO</span>
                    </h3>
                    <p className="text-sm text-white/60 flex items-center gap-1.5"><MapPin size={14} className="text-white/40" /> {story.location || 'Nearby'}</p>
                  </div>

                  {story.summary && (
                    <p className="text-sm text-white/50 line-clamp-2">{story.summary}</p>
                  )}

                  <div className="mt-auto pt-4 flex flex-wrap gap-2">
                    {/* Generate Button if missing audio */}
                    {!hasAudio && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleGenerateStory(story); }}
                        disabled={generating}
                        className="flex-1 flex items-center justify-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        {generating ? 'Creating...' : 'Create Audio'}
                      </button>
                    )}

                    {/* Play Controls */}
                    {(hasAudio || isActive) && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlay(story, 'quick'); }}
                          className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-900 transition hover:bg-emerald-50 hover:scale-105 shadow-lg"
                        >
                          <Play size={12} fill="currentColor" /> Quick
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlay(story, 'full'); }}
                          className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-white/10"
                        >
                          <Play size={12} /> Full
                        </button>
                      </>
                    )}

                    {isActive && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStop(story.id); }}
                        className="flex items-center justify-center w-10 h-10 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-100 transition"
                        title="Stop"
                      >
                        <StopCircle size={18} />
                      </button>
                    )}
                  </div>
                </div>

                {/* BACK FACE */}
                <div
                  className="absolute inset-0 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/95 p-6 overflow-y-auto"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                  onClick={() => toggleFlip(story.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-amber-200">Quick Guide</h3>
                    <button className="text-white/40 hover:text-white"><ArrowLeft size={16} /></button>
                  </div>
                  <p className="text-sm leading-relaxed text-white/80 font-serif italic">
                    {truncateWords(story.summary || 'No details available.', 280)}
                  </p>
                  <div className="mt-auto pt-4 border-t border-white/10">
                    <p className="text-xs text-white/40 uppercase tracking-widest text-center">Tap to flip back</p>
                  </div>
                </div>
              </motion.div>

              {/* Hidden Audio Element */}
              <audio
                ref={(el) => {
                  audioRefs.current[story.id] = el
                  if (el && autoPlayId === story.id && story.audio_url_quick) {
                    el.src = toPlayableUrl(story.audio_url_quick)!
                    el.play().catch(() => undefined)
                  }
                }}
                onEnded={() => setActiveStoryId(null)}
                className="hidden"
              />
            </div>
          )
        })}
      </div>
    </TripArcShell>
  )
}
