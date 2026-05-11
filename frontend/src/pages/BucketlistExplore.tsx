import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ChevronLeft, Navigation2, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import TripArcNav from '../components/TripArcNav'

type ReelPick = {
  id?: string
  name: string
  city?: string
  category?: string
  reasoning?: string
  source?: string
  photoUrl?: string
  vicinity?: string
  maps_link?: string
  lat?: number
  lng?: number
}

const IMAGE_VERSION = 'v4'

type ExploreLocationState = {
  city?: string
  items?: ReelPick[]
}

function normalizeCity(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function pickCity(pick: ReelPick) {
  return pick.city || pick.vicinity || 'Unknown City'
}

function buildDirectionsHref(pick: ReelPick) {
  if (pick.maps_link) return pick.maps_link
  if (pick.lat && pick.lng) {
    return `https://www.google.com/maps/search/?api=1&query=${pick.lat},${pick.lng}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pick.name} ${pickCity(pick)}`)}`
}

function readPhotoReference(photoUrl: string) {
  try {
    const parsed = new URL(photoUrl)
    return parsed.searchParams.get('photo_reference') || ''
  } catch {
    return ''
  }
}

function pickImageUrl(pick: ReelPick, width = 1200, height = 800) {
  if (pick.photoUrl) {
    if (pick.photoUrl.startsWith('/api/place-photo')) return pick.photoUrl
    const ref = readPhotoReference(pick.photoUrl)
    if (ref) return `/api/place-photo?ref=${encodeURIComponent(ref)}&maxwidth=${Math.min(1600, Math.max(200, width))}&_=${IMAGE_VERSION}`
    return pick.photoUrl
  }

  const w = Math.min(640, Math.max(200, Math.floor(width / 2)))
  const h = Math.min(640, Math.max(200, Math.floor(height / 2)))
  if (pick.lat && pick.lng) {
    return `/api/static-map?lat=${pick.lat}&lng=${pick.lng}&width=${w}&height=${h}&zoom=15&_=${IMAGE_VERSION}`
  }
  return `/api/static-map?query=${encodeURIComponent(`${pick.name} ${pickCity(pick)}`)}&width=${w}&height=${h}&zoom=14&_=${IMAGE_VERSION}`
}

function groupByCategory(items: ReelPick[]) {
  const grouped = new Map<string, ReelPick[]>()
  for (const item of items) {
    const key = (item.category || 'Places').toUpperCase()
    grouped.set(key, [...(grouped.get(key) || []), item])
  }
  return [...grouped.entries()].map(([category, groupedItems]) => ({
    category,
    items: groupedItems,
  }))
}

export default function BucketlistExplorePage() {
  const location = useLocation()
  const params = useParams<{ city: string }>()
  const state = (location.state || {}) as ExploreLocationState

  const routeCity = decodeURIComponent(params.city || '').trim()
  const initialCity = (state.city || routeCity || 'City').trim()

  const [city, setCity] = useState(initialCity)
  const [items, setItems] = useState<ReelPick[]>(state.items || [])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if ((state.items || []).length > 0) return
    if (!routeCity) return

    const loadFromWishlist = async () => {
      setLoading(true)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData?.session) {
          setItems([])
          return
        }

        const { data: lists } = await supabase
          .from('wishlists')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)

        const listId = lists?.[0]?.id
        if (!listId) {
          setItems([])
          return
        }

        const { data, error } = await supabase
          .from('wishlist_items')
          .select('id, title, location, xid, metadata')
          .eq('wishlist_id', listId)
          .order('created_at', { ascending: false })
          .limit(300)

        if (error) {
          setItems([])
          return
        }

        const picks = (data || []).map((row: any) => {
          const meta = (row?.metadata ?? {}) as Partial<ReelPick>
          return {
            id: row?.id,
            name: row?.title ?? meta.name ?? 'Untitled',
            city: meta.city,
            category: meta.category,
            reasoning: meta.reasoning,
            source: meta.source ?? 'reel',
            photoUrl: meta.photoUrl,
            vicinity: meta.vicinity ?? row?.location,
            maps_link: meta.maps_link ?? row?.xid,
            lat: meta.lat,
            lng: meta.lng,
          } as ReelPick
        })

        const routeCityNorm = normalizeCity(routeCity)
        const filtered = picks.filter((pick) => normalizeCity(pickCity(pick)) === routeCityNorm)

        if (filtered.length) {
          setItems(filtered)
          setCity(pickCity(filtered[0]))
        } else {
          setItems([])
          setCity(routeCity)
        }
      } finally {
        setLoading(false)
      }
    }

    loadFromWishlist()
  }, [routeCity, state.items])

  const banner = useMemo(() => {
    const firstWithImage = items.find((item) => item.photoUrl)
    if (firstWithImage) return pickImageUrl(firstWithImage, 1920, 1080)
    return `/api/city-image?city=${encodeURIComponent(city)}&_=${IMAGE_VERSION}`
  }, [items, city])

  const groupedSections = useMemo(() => groupByCategory(items), [items])

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1]">
      <TripArcNav />

      <main className="relative z-10 pb-24">
        <header className="px-6 py-4 sm:px-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#adc6ff]">Explore</p>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{city}</h1>
            </div>
            <Link
              to="/bucketlist"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white"
            >
              <ChevronLeft size={14} />
              Bucketlist
            </Link>
          </div>
        </header>

        <section className="px-6 pt-6 sm:px-10">
          <div className="relative h-[440px] overflow-hidden rounded-[2rem] border border-white/10 sm:h-[560px]">
            <img src={banner} alt={`${city} banner`} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/10" />
            <div className="absolute bottom-8 left-8 right-8 max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#fe9400]/20 px-3 py-1 backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#ffbc7c]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#ffbc7c]">Live from reels</span>
              </div>
              <h2 className="text-5xl font-black tracking-tight text-white sm:text-7xl">{city}</h2>
              <p className="mt-3 text-sm text-white/75 sm:text-base">
                Explore places extracted from your reels. Content is fully dynamic from your saved bucketlist.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 space-y-14 px-6 sm:px-10">
          {loading && <p className="text-sm text-white/70">Loading places...</p>}

          {!loading && groupedSections.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-[#1c1b1b]/70 p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#adc6ff]">No places found</p>
              <p className="mt-2 text-sm text-white/70">Extract reels in bucketlist and open Explore from a city card.</p>
            </div>
          )}

          {!loading && groupedSections.map((section) => (
            <div key={section.category}>
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#adc6ff]">Curation</p>
                  <h3 className="mt-1 text-3xl font-black tracking-tight text-white">{section.category}</h3>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">{section.items.length} places</span>
              </div>

              <div className="no-scrollbar -mx-1 flex gap-6 overflow-x-auto pb-2">
                {section.items.map((item) => (
                  <article
                    key={item.id || `${item.name}-${item.maps_link || item.vicinity || ''}`}
                    className="min-w-[300px] flex-shrink-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#1c1b1b]/70 sm:min-w-[360px]"
                  >
                    <div className="relative h-64 overflow-hidden">
                      <img
                        src={pickImageUrl(item, 1200, 800)}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                      <div className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/35 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                        <Sparkles size={12} />
                        Reel Pick
                      </div>
                    </div>

                    <div className="p-5">
                      <h4 className="text-2xl font-black tracking-tight text-white">{item.name}</h4>
                      <p className="mt-1 text-xs uppercase tracking-widest text-white/60">{pickCity(item)}</p>
                      {item.reasoning && <p className="mt-3 line-clamp-2 text-sm text-white/70">{item.reasoning}</p>}
                      <a
                        href={buildDirectionsHref(item)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white transition hover:bg-white hover:text-black"
                      >
                        <Navigation2 size={14} />
                        Directions
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}
