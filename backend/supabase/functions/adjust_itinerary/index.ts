import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0"

type ItineraryItem = {
  id?: string
  title: string
  location: string
  timeSlot: string
  durationMinutes: number
  category: string
  status?: "planned" | "suggested" | "skipped"
  note?: string
}

type LocationPref = {
  mode: "live" | "manual"
  label: string
  lat?: number
  lng?: number
}

type Payload = {
  city: string
  behind: boolean
  ahead: boolean
  locationPref: LocationPref
  items: ItineraryItem[]
  mood?: string
  categoryPref?: string
  diet?: string
  moreIdeas?: boolean
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const OPENTRIPMAP_API_KEY = Deno.env.get("OPENTRIPMAP_API_KEY")
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")
const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY")
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*"

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !OPENTRIPMAP_API_KEY) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENTRIPMAP_API_KEY")
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders })
    }

    const payload = (await req.json()) as Payload
    const { city, behind, ahead, locationPref, items, mood, categoryPref, diet, moreIdeas } = payload

    const coords = await resolveCoords(city, locationPref)
    if (!coords) {
      return new Response(JSON.stringify({ error: "could not resolve coordinates" }), { status: 400, headers: corsHeaders })
    }

    const candidates = (await fetchPlacesRestaurants(coords.lat, coords.lon, GOOGLE_PLACES_API_KEY, diet))
      .concat(await fetchNearby(coords.lat, coords.lon, OPENTRIPMAP_API_KEY))

    const limit = moreIdeas ? 12 : 6
    const suggested = await pickSuggestions(items, candidates, { behind, ahead, city, mood, categoryPref, diet, limit })

    const enriched = suggested.map((item) => ({
      ...item,
      status: item.status ?? "suggested",
      user_id: user.id,
      city,
    }))

    const { error: upsertError } = await supabase.from("itinerary_items").upsert(enriched, {
      onConflict: "id",
    })
    if (upsertError) {
      console.error(upsertError)
    }

    return new Response(JSON.stringify(enriched), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: "internal" }), { status: 500, headers: corsHeaders })
  }
})

async function resolveCoords(city: string, pref: LocationPref): Promise<{ lat: number; lon: number } | null> {
  if (pref.mode === "live" && typeof pref.lat === "number" && typeof pref.lng === "number") {
    return { lat: pref.lat, lon: pref.lng }
  }
  const url = `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(city)}&apikey=${OPENTRIPMAP_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (typeof data.lat === "number" && typeof data.lon === "number") {
    return { lat: data.lat, lon: data.lon }
  }
  return null
}

async function fetchNearby(lat: number, lon: number, apiKey: string) {
  const kinds = "interesting_places,cultural,foods,amusements"
  const radius = 5000
  const limit = 12
  const url = `https://api.opentripmap.com/0.1/en/places/radius?lat=${lat}&lon=${lon}&radius=${radius}&limit=${limit}&kinds=${kinds}&format=json&apikey=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data)
    ? data.map((d) => ({
        xid: d.xid as string,
        name: (d.name as string) || "Nearby spot",
        dist: d.dist as number,
        kinds: (d.kinds as string) ?? "",
        source: "otm" as const,
      }))
    : []
}

async function fetchPlacesRestaurants(lat: number, lon: number, apiKey?: string, diet?: string) {
  if (!apiKey) return []
  const radius = 5000
  const keyword =
    diet === "veg" ? "vegetarian" : diet === "non-veg" ? "restaurant" : diet === "cafe" ? "cafe" : "restaurant"

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=restaurant&keyword=${encodeURIComponent(keyword)}&opennow=true&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  const results = Array.isArray(data.results) ? data.results : []

  const operational = results.filter((r) => r.business_status === "OPERATIONAL")
  const shortlist = operational.slice(0, 8)

  const withDetails = await Promise.all(
    shortlist.map(async (r: any, idx: number) => {
      const details = await fetchPlaceDetails(r.place_id, apiKey)
      return { base: r, details, idx }
    })
  )

  const destinations = withDetails
    .map(({ details }) => {
      const loc = details?.geometry?.location
      return typeof loc?.lat === "number" && typeof loc?.lng === "number" ? `${loc.lat},${loc.lng}` : null
    })
    .filter((d): d is string => !!d)

  const travelMap = await fetchDistanceMatrix(lat, lon, destinations, apiKey)

  return withDetails.map(({ base, details, idx }) => {
    const loc = details?.geometry?.location
    const destKey = loc ? `${loc.lat},${loc.lng}` : undefined
    const travel = destKey ? travelMap[destKey] : undefined
    const fallbackDist =
      typeof loc?.lat === "number" && typeof loc?.lng === "number"
        ? haversineDistanceMeters(lat, lon, loc.lat, loc.lng)
        : idx * 50 + 100

    const distanceMeters = travel?.distanceMeters ?? base.distance_meters ?? fallbackDist
    const travelMinutes = travel?.durationMinutes ?? Math.max(5, Math.round(distanceMeters / 80))
    const dineMinutes = Math.min(90, Math.max(35, Math.round((details?.user_ratings_total ?? 0) > 200 ? 55 : 45)))

    return {
      xid: base.place_id ?? `g-${idx}`,
      name: details?.name ?? base.name ?? "Restaurant",
      dist: distanceMeters,
      kinds: Array.isArray(details?.types) ? details.types.join(",") : Array.isArray(base.types) ? base.types.join(",") : "food",
      source: "google" as const,
      openNow: details?.opening_hours?.open_now ?? base.opening_hours?.open_now ?? false,
      vicinity: base.vicinity ?? "Nearby",
      rating: typeof details?.rating === "number" ? details.rating : undefined,
      userRatingsTotal: typeof details?.user_ratings_total === "number" ? details.user_ratings_total : undefined,
      distanceMeters,
      travelMinutes,
      dineMinutes,
      mustTry: guessMustTryFromReviews(details?.reviews) ?? details?.editorial_summary?.overview,
    }
  })
}

async function fetchPlaceDetails(placeId: string, apiKey: string) {
  if (!placeId) return null
  const fields = [
    "name",
    "rating",
    "user_ratings_total",
    "opening_hours",
    "types",
    "geometry",
    "price_level",
    "editorial_summary",
    "reviews",
  ].join(",")
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&reviews_sort=newest&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return data?.result ?? null
}

async function fetchDistanceMatrix(lat: number, lon: number, destinations: string[], apiKey: string) {
  if (!apiKey || destinations.length === 0) return {} as Record<string, { distanceMeters: number; durationMinutes: number }>

  const unique = Array.from(new Set(destinations)).slice(0, 25)
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat},${lon}&destinations=${unique.join("|")}&mode=walking&units=metric&key=${apiKey}`

  const res = await fetch(url)
  if (!res.ok) return {} as Record<string, { distanceMeters: number; durationMinutes: number }>
  const data = await res.json()
  const row = data?.rows?.[0]?.elements

  const result: Record<string, { distanceMeters: number; durationMinutes: number }> = {}
  if (Array.isArray(row)) {
    row.forEach((elem: any, idx: number) => {
      const destKey = unique[idx]
      if (elem?.status === "OK") {
        const distanceMeters = elem.distance?.value
        const durationSeconds = elem.duration?.value
        if (typeof distanceMeters === "number" && typeof durationSeconds === "number") {
          result[destKey] = { distanceMeters, durationMinutes: Math.max(1, Math.round(durationSeconds / 60)) }
        }
      }
    })
  }
  return result
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

function guessMustTryFromReviews(reviews?: any[]): string | undefined {
  if (!Array.isArray(reviews)) return undefined
  const text = reviews
    .slice(0, 5)
    .map((r) => (typeof r.text === "string" ? r.text : ""))
    .filter((t) => t.length > 0)
    .join(" ")
    .toLowerCase()

  if (!text) return undefined

  const cleaned = text.replace(/[^a-z\s]/g, " ")
  const tokens = cleaned.split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w))
  const counts: Record<string, number> = {}
  tokens.forEach((w) => {
    counts[w] = (counts[w] ?? 0) + 1
  })

  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (!top || top[1] < 2) return undefined
  return `Most mentioned: ${formatDishName(top[0])}`
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "were",
  "have",
  "had",
  "good",
  "great",
  "very",
  "really",
  "nice",
  "food",
  "dish",
  "menu",
  "place",
  "restaurant",
  "cafe",
  "coffee",
  "service",
  "staff",
  "they",
  "them",
  "also",
  "just",
  "like",
  "best",
  "much",
  "some",
  "were",
  "been",
  "after",
  "before",
  "when",
  "where",
  "your",
  "ours",
  "mine",
  "their",
  "there",
  "what",
  "which",
  "very",
  "super",
  "awesome",
  "amazing",
  "delicious",
  "tasty",
])

function formatDishName(word: string) {
  return word
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ")
}

type Candidate = {
  xid: string
  name: string
  dist: number
  kinds: string
  source: "google" | "otm"
  openNow?: boolean
  vicinity?: string
  rating?: number
  userRatingsTotal?: number
  travelMinutes?: number
  distanceMeters?: number
  mustTry?: string
  dineMinutes?: number
}

async function pickSuggestions(
  existing: ItineraryItem[],
  candidates: Candidate[],
  flags: { behind: boolean; ahead: boolean; city: string; mood?: string; categoryPref?: string; diet?: string; limit?: number }
): Promise<ItineraryItem[]> {
  const base = existing.filter((i) => i.status !== "suggested")
  const limit = flags.limit ?? 6
  const ideas = candidates
    .sort((a, b) => (a.travelMinutes ?? a.dist) - (b.travelMinutes ?? b.dist))
    .slice(0, limit)
    .map((c, idx) => ({
      id: `otm-${c.xid}-${idx}`,
      title: c.name,
      location: c.vicinity ?? `${Math.round(c.distanceMeters ?? c.dist)}m away`,
      timeSlot: flags.behind ? "Next 60 min" : "Bonus 45 min",
      durationMinutes: (c.dineMinutes ?? 45) + (c.travelMinutes ?? 10),
      category: c.kinds.split(",")[0] ?? "Explore",
      status: "suggested" as const,
      note: buildNote(c, flags.behind),
    }))

  const aiRanked = await rerankWithGemini(ideas, base, flags)
  return [...base, ...aiRanked]
}

function buildNote(c: Candidate, isBehind: boolean) {
  const openNote = c.openNow ? "Open now" : isBehind ? "Opening soon? verify" : "Check opening hours"
  const ratingNote =
    typeof c.rating === "number"
      ? `★${c.rating.toFixed(1)}${typeof c.userRatingsTotal === "number" ? ` (${c.userRatingsTotal})` : ""}`
      : "Rating tbd"
  const travelNote =
    typeof c.travelMinutes === "number"
      ? `${c.travelMinutes} min travel`
      : `${Math.round(c.distanceMeters ?? c.dist)}m away`
  const dineNote = typeof c.dineMinutes === "number" ? `${c.dineMinutes} min to dine` : "Plan ~45 min to dine"
  const dishNote = c.mustTry ? `Must try: ${c.mustTry}` : "Ask staff for recommendations"
  return `${openNote} · ${ratingNote} · ${travelNote} · ${dineNote} · ${dishNote}`
}

async function rerankWithGemini(
  ideas: ItineraryItem[],
  base: ItineraryItem[],
  flags: { behind: boolean; ahead: boolean; city: string; mood?: string; categoryPref?: string; diet?: string }
): Promise<ItineraryItem[]> {
  if (!GEMINI_API_KEY) return ideas

  try {
    const prompt = [
      "You are planning a same-day itinerary (08:00-20:00).",
      `City: ${flags.city}.`,
      `Traveler is ${flags.behind ? ">30 min behind" : flags.ahead ? ">30 min ahead" : "on time"}.`,
      flags.mood ? `Traveler mood: ${flags.mood}.` : "",
      flags.categoryPref && flags.categoryPref !== "Any" ? `Prefer category: ${flags.categoryPref}.` : "",
      flags.diet && flags.diet !== "Any" ? `Diet preference: ${flags.diet}.` : "",
      "Existing fixed items:",
      ...base.map((b) => `- ${b.timeSlot} ${b.title} at ${b.location}`),
      "Candidate nearby items to rank (JSON will be returned):",
    ].join("\n")

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              text: JSON.stringify(
                ideas.map((i) => ({
                  id: i.id,
                  title: i.title,
                  location: i.location,
                  timeSlot: i.timeSlot,
                  durationMinutes: i.durationMinutes,
                  category: i.category,
                  note: i.note,
                }))
              ),
            },
            {
              text: "Return a JSON array of the same objects reordered and, if helpful, tweak timeSlot/note to best fit the behind/ahead status.",
            },
          ],
        },
      ],
    }

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )

    if (!res.ok) return ideas
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return ideas
    const parsed = safeJsonParse(text)
    if (!Array.isArray(parsed)) return ideas

    return parsed.map((p: any, idx: number) => ({
      id: String(p.id ?? ideas[idx]?.id ?? `ai-${idx}`),
      title: String(p.title ?? ideas[idx]?.title ?? "Suggestion"),
      location: String(p.location ?? ideas[idx]?.location ?? "Nearby"),
      timeSlot: String(p.timeSlot ?? ideas[idx]?.timeSlot ?? "Next 60 min"),
      durationMinutes: Number(p.durationMinutes ?? ideas[idx]?.durationMinutes ?? 45),
      category: String(p.category ?? ideas[idx]?.category ?? "Explore"),
      status: "suggested",
      note: typeof p.note === "string" ? p.note : ideas[idx]?.note ?? "AI-ranked",
    }))
  } catch (err) {
    console.error("Gemini rank error", err)
    return ideas
  }
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text)
  } catch (_err) {
    return null
  }
}
