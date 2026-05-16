import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bookmark,
  ChevronLeft,
  Folder,
  Loader2,
  Navigation2,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { resolveApiPath } from '../lib/apiClient'
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

function parseJsonSafe(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const wishlistKey = (p: ReelPick) => `${p.name.toLowerCase()}|${p.city ?? p.vicinity ?? ''}|${p.maps_link ?? ''}`

function mergeUnique(existing: ReelPick[], incoming: ReelPick[]): ReelPick[] {
  const seen = new Set(existing.map(wishlistKey))
  const merged = [...existing]
  for (const item of incoming) {
    const key = wishlistKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

function pickCity(pick: ReelPick) {
  return pick.city || pick.vicinity || 'Unknown City'
}

function isFoodDiningPick(pick: ReelPick) {
  const category = (pick.category || '').toLowerCase()
  return (
    category.includes('food') ||
    category.includes('dining') ||
    category.includes('restaurant') ||
    category.includes('cafe') ||
    category.includes('culinary')
  )
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

export default function BucketlistPage() {
  const navigate = useNavigate()
  const [reelLoading, setReelLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [wishlist, setWishlist] = useState<ReelPick[]>([])
  const [detectedLocations, setDetectedLocations] = useState<ReelPick[]>([])
  const [foodFolders, setFoodFolders] = useState<Record<string, ReelPick[]>>({})
  const [activeFoodCity, setActiveFoodCity] = useState<string | null>(null)
  const [wishlistId, setWishlistId] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [bestMonthByCity, setBestMonthByCity] = useState<Record<string, string>>({})

  const topCategory = useMemo(() => {
    if (!wishlist.length) return { label: 'NONE', percent: 0 }
    const counts = new Map<string, number>()
    for (const item of wishlist) {
      const category = (item.category || 'curated').toUpperCase()
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    let winner = 'NONE'
    let max = 0
    for (const [key, value] of counts.entries()) {
      if (value > max) {
        max = value
        winner = key
      }
    }
    return { label: winner, percent: Math.round((max / wishlist.length) * 100) }
  }, [wishlist])

  const cityFoldersForMain = useMemo(() => {
    return Object.entries(foodFolders).map(([city, items]) => {
      const firstWithPhoto = items.find((item) => item.photoUrl)
      const banner = firstWithPhoto
        ? pickImageUrl(firstWithPhoto, 1600, 900)
        : `/api/city-image?city=${encodeURIComponent(city)}&_=${IMAGE_VERSION}`
      return { city, items, banner }
    })
  }, [foodFolders])

  useEffect(() => {
    const missingCities = cityFoldersForMain
      .map((entry) => entry.city)
      .filter((city) => !bestMonthByCity[city])

    if (!missingCities.length) return

    let cancelled = false

    const loadBestMonths = async () => {
      const updates: Record<string, string> = {}
      for (const city of missingCities) {
        try {
          const res = await fetch(resolveApiPath(`/api/best-visit-month?city=${encodeURIComponent(city)}`))
          if (!res.ok) continue
          const data = await res.json()
          const month = typeof data?.month === 'string' ? data.month : ''
          if (month) updates[city] = month
        } catch {
          // Keep silent fallback in UI.
        }
      }
      if (cancelled || !Object.keys(updates).length) return
      setBestMonthByCity((prev) => ({ ...prev, ...updates }))
    }

    loadBestMonths()
    return () => {
      cancelled = true
    }
  }, [cityFoldersForMain, bestMonthByCity])

  const locationRows = useMemo(() => {
    return detectedLocations.slice(0, 8).map((pick) => ({
      key: wishlistKey(pick),
      name: pick.name,
      country: pickCity(pick),
      image: pickImageUrl(pick, 400, 300),
      source: pick,
    }))
  }, [detectedLocations])

  useEffect(() => {
    const loadWishlist = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session) {
        setStatusMsg('Sign in to sync your bucketlist across devices.')
        return
      }

      const ensuredWishlistId = await ensureWishlist()
      if (!ensuredWishlistId) {
        setStatusMsg('Could not load wishlist.')
        return
      }

      setWishlistId(ensuredWishlistId)
      const { data, error } = await supabase
        .from('wishlist_items')
        .select('id, title, location, xid, metadata')
        .eq('wishlist_id', ensuredWishlistId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        setStatusMsg('Could not load saved wishlist.')
        return
      }

      const picks = (data ?? []).map((row: any) => {
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

      if (picks.length) {
        setWishlist((prev) => mergeUnique(prev, picks))
        setFoodFolders((prev) => {
          const next = { ...prev }
          for (const pick of picks) {
            if (!isFoodDiningPick(pick)) continue
            const city = pickCity(pick)
            const current = next[city] ?? []
            if (!current.some((entry) => wishlistKey(entry) === wishlistKey(pick))) {
              next[city] = [pick, ...current]
            }
          }
          return next
        })
        setStatusMsg(`Loaded ${picks.length} saved destinations.`)
      }
    }

    loadWishlist()
  }, [])

  const ensureWishlist = async (): Promise<string | null> => {
    if (wishlistId) return wishlistId

    const { data: lists, error: listErr } = await supabase
      .from('wishlists')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)

    if (!listErr && lists && lists.length > 0) {
      return lists[0].id as string
    }

    const { data: created, error: createErr } = await supabase
      .from('wishlists')
      .insert({ name: 'My Wishlist' })
      .select('id')
      .single()

    if (createErr || !created?.id) return null
    return created.id as string
  }

  const persistToWishlist = async (picks: ReelPick[]) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) return

    const id = await ensureWishlist()
    if (!id) return
    setWishlistId(id)

    const existingKeys = new Set(wishlist.map(wishlistKey))
    const newOnes = picks.filter((item) => !existingKeys.has(wishlistKey(item)))
    if (!newOnes.length) return

    const rows = newOnes.map((item) => ({
      wishlist_id: id,
      title: item.name,
      location: item.city || item.vicinity || null,
      xid: item.maps_link || null,
      metadata: item,
    }))

    await supabase.from('wishlist_items').insert(rows)
  }

  const moveToFoodFolder = (pick: ReelPick) => {
    setFoodFolders((prev) => {
      const city = pickCity(pick)
      const current = prev[city] ?? []
      if (current.some((entry) => wishlistKey(entry) === wishlistKey(pick))) return prev
      return { ...prev, [city]: [pick, ...current] }
    })
  }

  const moveFoodPicksToCityFolders = (picks: ReelPick[]) => {
    const foodPicks = picks.filter(isFoodDiningPick)
    if (!foodPicks.length) return 0

    for (const pick of foodPicks) {
      moveToFoodFolder(pick)
    }

    const firstCity = pickCity(foodPicks[0])
    if (firstCity) setActiveFoodCity(firstCity)
    return foodPicks.length
  }

  const deletePickFromWishlistStorage = async (pick: ReelPick) => {
    const id = wishlistId || (await ensureWishlist())
    if (!id) return
    setWishlistId(id)

    if (pick.id) {
      await supabase.from('wishlist_items').delete().eq('id', pick.id)
      return
    }

    await supabase
      .from('wishlist_items')
      .delete()
      .eq('wishlist_id', id)
      .eq('title', pick.name)
      .eq('location', pick.city || pick.vicinity || '')
  }

  const removePickFromLocalCollections = (pick: ReelPick) => {
    const key = wishlistKey(pick)
    setWishlist((prev) => prev.filter((entry) => wishlistKey(entry) !== key))
    setDetectedLocations((prev) => prev.filter((entry) => wishlistKey(entry) !== key))
    setFoodFolders((prev) => {
      const next: Record<string, ReelPick[]> = {}
      for (const [city, items] of Object.entries(prev)) {
        const remaining = items.filter((entry) => wishlistKey(entry) !== key)
        if (remaining.length) next[city] = remaining
      }
      return next
    })
  }

  const handleDeleteFoodPlace = async (pick: ReelPick) => {
    removePickFromLocalCollections(pick)
    await deletePickFromWishlistStorage(pick)
    setStatusMsg(`${pick.name} removed from Food & Dining.`)
  }

  const handleDeleteFoodFolder = async (city: string) => {
    const items = foodFolders[city] ?? []
    if (!items.length) {
      setFoodFolders((prev) => {
        const next = { ...prev }
        delete next[city]
        return next
      })
      if (activeFoodCity === city) setActiveFoodCity(null)
      return
    }

    const keys = new Set(items.map((item) => wishlistKey(item)))
    setWishlist((prev) => prev.filter((entry) => !keys.has(wishlistKey(entry))))
    setDetectedLocations((prev) => prev.filter((entry) => !keys.has(wishlistKey(entry))))
    setFoodFolders((prev) => {
      const next = { ...prev }
      delete next[city]
      return next
    })

    if (activeFoodCity === city) setActiveFoodCity(null)

    for (const item of items) {
      await deletePickFromWishlistStorage(item)
    }

    setStatusMsg(`Deleted ${city} folder and ${items.length} places.`)
  }

  const handleExtractReel = async () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl.includes('instagram.com') && !trimmedUrl.includes('instagr.am')) {
      setStatusMsg('Please enter a valid Instagram Reel URL.')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) {
      setStatusMsg('Sign in first to save your bucketlist to your profile.')
      return
    }

    setReelLoading(true)
    setStatusMsg('Extracting destinations...')
    try {
      const res = await fetch(resolveApiPath('/api/analyze-reel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ url: trimmedUrl }),
      })

      const raw = await res.text()
      if (!res.ok) {
        const errJson = parseJsonSafe(raw)
        throw new Error(errJson?.detail || raw || 'Extraction failed')
      }

      const data = parseJsonSafe(raw)
      if (!data) throw new Error('Extraction failed: invalid response')
      const picks: ReelPick[] = data.destinations || []

      if (!picks.length) {
        setStatusMsg(data.detail || 'No destinations detected from this reel. Try another public reel URL.')
        return
      }

      setWishlist((prev) => mergeUnique(prev, picks))
      setDetectedLocations((prev) => mergeUnique(prev, picks))
      const movedToFood = moveFoodPicksToCityFolders(picks)

      await persistToWishlist(picks)
      if (movedToFood > 0) {
        setStatusMsg(`Saved ${picks.length} destinations. ${movedToFood} food places were grouped into city folders.`)
      } else {
        setStatusMsg(`Saved ${picks.length} destinations.`)
      }
    } catch (error: any) {
      setStatusMsg(error?.message || 'Extraction failed')
    } finally {
      setReelLoading(false)
    }
  }

  const addLocationToBucketlist = (pick: ReelPick | null) => {
    if (!pick) return
    if (isFoodDiningPick(pick)) {
      moveToFoodFolder(pick)
      setActiveFoodCity(pickCity(pick))
      setStatusMsg(`${pick.name} moved to ${pickCity(pick)} folder.`)
      return
    }
    setStatusMsg(`${pick.name} detected.`)
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0e0e0e] font-['Manrope',sans-serif] text-[#e5e2e1]">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_30%,rgba(75,142,255,0.15)_0%,transparent_40%),radial-gradient(circle_at_80%_70%,rgba(131,130,255,0.1)_0%,transparent_40%)]" />

      <TripArcNav />

      <aside className="fixed left-0 top-0 z-40 hidden h-full w-80 border-r border-white/10 bg-[#131313] px-6 pb-6 pt-20 lg:flex">
        <div className="flex h-full w-full flex-col gap-6">
          <div className="flex items-center gap-3 px-2">
            <div className="rounded-xl bg-[#4b8eff]/20 p-2">
              <Sparkles size={18} className="text-[#adc6ff]" />
            </div>
            <div>
              <h2 className="leading-none tracking-tight text-[#e5e2e1]">THE CURATOR</h2>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#ADC6FF]">CELESTIAL TIER</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#353534]/20 p-1">
              <input
                className="w-full bg-transparent p-3 text-[11px] uppercase tracking-widest text-[#e5e2e1] outline-none placeholder:text-[#c1c6d7]/50"
                placeholder="PASTE REEL URL..."
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleExtractReel()
                }}
              />
            </div>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#adc6ff] to-[#4b8eff] py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#00285c] transition active:scale-95 disabled:opacity-60"
              type="button"
              onClick={handleExtractReel}
              disabled={reelLoading || !url}
            >
              {reelLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {reelLoading ? 'Extracting' : 'Extract New Reel'}
            </button>
            {statusMsg && <p className="text-[10px] uppercase tracking-[0.1em] text-[#c1c6d7]">{statusMsg}</p>}
          </div>

          <div className="flex-1 space-y-8 overflow-y-auto pr-2">
            <section>
              <h3 className="mb-4 px-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Locations Detected</h3>
              <div className="space-y-3">
                {locationRows.length === 0 ? (
                  <p className="rounded-2xl bg-[#1c1b1b]/60 p-3 text-[9px] uppercase tracking-wider text-[#c1c6d7]">
                    No locations detected yet. Paste a reel URL to extract places.
                  </p>
                ) : locationRows.map((location) => (
                  <button
                    key={location.key}
                    className="group flex w-full items-center gap-3 rounded-2xl bg-[#1c1b1b]/60 p-3 text-left transition hover:bg-[#3a3939]/40"
                    type="button"
                    onClick={() => addLocationToBucketlist(location.source)}
                    disabled={!location.source}
                  >
                    <img src={location.image} alt={location.name} className="h-10 w-10 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold uppercase tracking-wider text-[#e5e2e1]">{location.name}</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[9px] uppercase text-[#c1c6d7]">{location.country}</p>
                        {location.source && (
                          <a
                            href={buildDirectionsHref(location.source)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-[#adc6ff] hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Navigation2 size={10} />
                            Direction
                          </a>
                        )}
                      </div>
                    </div>
                    <Plus size={15} className="text-[#adc6ff] opacity-0 transition group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-4 px-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Food & Dining</h3>
              {activeFoodCity ? (
                <div className="space-y-3">
                  <button
                    className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#adc6ff]"
                    type="button"
                    onClick={() => setActiveFoodCity(null)}
                  >
                    <ChevronLeft size={14} />
                    Back to folders
                  </button>
                  <div className="rounded-2xl border border-[#4b8eff]/35 bg-[#4b8eff]/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#e5e2e1]">{activeFoodCity}</p>
                        <p className="text-[9px] uppercase text-[#c1c6d7]">{(foodFolders[activeFoodCity] ?? []).length} saved from reels</p>
                      </div>
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-[#ffbc7c]/40 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#ffbc7c] transition hover:bg-[#ffbc7c]/15"
                        type="button"
                        onClick={() => handleDeleteFoodFolder(activeFoodCity)}
                      >
                        <Trash2 size={11} />
                        Delete Folder
                      </button>
                    </div>
                  </div>
                  {(foodFolders[activeFoodCity] ?? []).map((item) => (
                    <div key={wishlistKey(item)} className="rounded-2xl bg-[#1c1b1b]/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#e5e2e1]">{item.name}</p>
                        <button
                          className="inline-flex items-center gap-1 rounded-full border border-[#ffbc7c]/40 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#ffbc7c] transition hover:bg-[#ffbc7c]/15"
                          type="button"
                          onClick={() => handleDeleteFoodPlace(item)}
                        >
                          <Trash2 size={11} />
                          Delete
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <a
                          href={buildDirectionsHref(item)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-[#adc6ff] hover:underline"
                        >
                          <Navigation2 size={10} />
                          Direction
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(foodFolders).length === 0 ? (
                    <p className="rounded-2xl bg-[#1c1b1b]/60 p-3 text-[9px] uppercase tracking-wider text-[#c1c6d7]">
                      No city folders yet. Extract a reel to create one.
                    </p>
                  ) : (
                    Object.entries(foodFolders).map(([city, items]) => (
                      <div
                        key={city}
                        className="flex items-center gap-2 rounded-2xl bg-[#1c1b1b]/60 p-2"
                      >
                        <button
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition hover:bg-[#3a3939]/40"
                          type="button"
                          onClick={() => setActiveFoodCity(city)}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fe9400]/20 text-[#ffbc7c]">
                            <Folder size={16} />
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-[#e5e2e1]">{city}</p>
                            <p className="text-[9px] uppercase text-[#c1c6d7]">{items.length} saved places</p>
                          </div>
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-full border border-[#ffbc7c]/40 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#ffbc7c] transition hover:bg-[#ffbc7c]/15"
                          type="button"
                          onClick={() => handleDeleteFoodFolder(city)}
                        >
                          <Trash2 size={11} />
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>

          </div>

          <div className="mt-auto space-y-1">
            <button className="flex w-full items-center gap-4 rounded-full bg-[#3A3939] p-3 text-[#ADC6FF]" type="button">
              <Bookmark size={18} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.1em]">Saved Items</span>
            </button>
            <button className="flex w-full items-center gap-4 rounded-full p-3 text-[#C1C6D7] opacity-70 transition hover:bg-[#1C1B1B] hover:opacity-100" type="button">
              <Users size={18} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.1em]">Shared With Me</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="pb-16 pt-6 lg:pl-80">
        <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
          <header className="mb-12 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[#adc6ff]">Curated Aspirations</p>
              <h1 className="text-5xl font-black tracking-tight text-[#E5E2E1] md:text-7xl">My Bucketlist</h1>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3">
            {cityFoldersForMain.map(({ city, items, banner }) => (
              <article
                key={`city-folder-${city}`}
                className="group relative aspect-[3/4] overflow-hidden rounded-3xl border border-[#ffbc7c]/25 bg-[#1c1b1b]"
              >
                <img
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  src={banner}
                  alt={`${city} food folder`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10" />
                <div className="absolute inset-x-6 top-6 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#ffbc7c]/20 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-[#ffbc7c] backdrop-blur-md">
                    <Folder size={12} />
                    City Folder
                  </span>
                  <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-white/90 backdrop-blur-md">
                    {items.length} places
                  </span>
                </div>

                <div className="absolute bottom-8 left-8 right-8">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#ffbc7c]">Food & Dining</p>
                  <h3 className="mt-2 text-4xl font-black tracking-tight text-white">{city}</h3>
                  <p className="mt-2 line-clamp-1 text-sm text-white/70">
                    {items[0]?.name ? `Featured: ${items[0].name}` : 'Curated restaurants from reels'}
                  </p>
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <button
                      className="rounded-full border border-white/20 bg-white/10 px-6 py-2 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur-md transition hover:bg-white hover:text-black"
                      type="button"
                      onClick={() => navigate(`/bucketlist/explore/${encodeURIComponent(city)}`, { state: { city, items } })}
                    >
                      Explore
                    </button>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#adc6ff]">
                      Best in {bestMonthByCity[city] || 'Apr'}
                    </span>
                  </div>
                </div>
              </article>
            ))}

            {cityFoldersForMain.length === 0 && (
              <article className="col-span-full rounded-3xl border border-white/10 bg-[#1c1b1b]/70 p-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c1c6d7]">No city folders yet</p>
                <p className="mt-2 text-sm text-white/70">Paste a reel URL to detect places and auto-create city cards.</p>
              </article>
            )}
          </section>

          <section className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-4">
            <article className="rounded-[2rem] border border-white/10 bg-[#1c1b1b] p-8 md:col-span-2">
              <div className="mb-6 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Bucketlist Progress</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#2563EB]">Live</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-black text-[#e5e2e1]">{wishlist.length}</span>
                <span className="mb-2 text-[12px] font-bold uppercase text-[#c1c6d7]">Destinations Saved</span>
              </div>
              <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-[#353534]">
                <div className="h-full bg-[#adc6ff] shadow-[0_0_10px_rgba(173,198,255,0.5)]" style={{ width: `${Math.min(100, Math.max(8, wishlist.length * 8))}%` }} />
              </div>
            </article>

            <article className="flex flex-col justify-between rounded-[2rem] border border-white/10 bg-[#1c1b1b] p-8">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Top Category</h4>
              <div className="mt-4">
                <span className="text-3xl font-black text-[#ffbc7c]">{topCategory.label}</span>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-[#c1c6d7]">{topCategory.percent}% of items</p>
              </div>
            </article>

            <article className="rounded-[2rem] border border-[#adc6ff]/30 bg-[#adc6ff]/5 p-8">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#adc6ff]">Food City Folders</h4>
              <div className="mt-4">
                <span className="text-4xl font-black text-[#e5e2e1]">{cityFoldersForMain.length}</span>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-[#adc6ff]">Created from reels</p>
              </div>
            </article>
          </section>
        </div>
      </main>

      <button className="fixed bottom-10 right-10 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-[#adc6ff] text-[#00285c] shadow-2xl transition hover:scale-110 active:scale-95" type="button" aria-label="Add new">
        <Plus size={28} />
      </button>

      <nav className="fixed bottom-0 left-0 z-50 flex h-20 w-full items-center justify-around border-t border-white/10 bg-[#0E0E0E]/85 backdrop-blur-xl lg:hidden">
        <Link to="/triparc" className="flex flex-col items-center gap-1 text-[#4B8EFF]">
          <Sparkles size={16} />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Explore</span>
        </Link>
        <Link to="/triparc/memories" className="flex flex-col items-center gap-1 text-[#c1c6d7]">
          <Bookmark size={16} />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Journal</span>
        </Link>
        <Link to="/private-profile" className="flex flex-col items-center gap-1 text-[#c1c6d7]">
          <Users size={16} />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Profile</span>
        </Link>
      </nav>

      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(193, 198, 215, 0.3);
          border-radius: 9999px;
        }
      `}</style>
    </div>
  )
}
