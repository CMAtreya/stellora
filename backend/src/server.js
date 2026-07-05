import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

dotenv.config()

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,
  GOOGLE_PLACES_API_KEY,
  OPENTRIPMAP_API_KEY,
  GEMINI_API_KEY,
  ALLOWED_ORIGIN,
  PORT = 8787,
} = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in env")
  process.exit(1)
}

const app = express()
const allowedOrigins = ALLOWED_ORIGIN && ALLOWED_ORIGIN !== "*"
  ? ALLOWED_ORIGIN.split(",").map(o => o.trim())
  : "*";
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: "1mb" }))

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.post("/adjust-itinerary", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    const { data: userData, error: userError } = token ? await supabase.auth.getUser(token) : { data: null, error: null }
    const userId = userData?.user?.id
    const isAnon = !token || userError || !userId

    const payload = req.body || {}
    const { city, behind, ahead, locationPref, items = [], mood, categoryPref, diet, moreIdeas } = payload

    const coords = await resolveCoords(city, locationPref)
    if (!coords) return res.status(400).json({ error: "could not resolve coordinates" })

    const candidates = (await fetchPlacesRestaurants(coords.lat, coords.lon, GOOGLE_PLACES_API_KEY, diet)).concat(
      await fetchNearby(coords.lat, coords.lon, OPENTRIPMAP_API_KEY)
    )

    const limit = moreIdeas ? 12 : 6
    const suggested = await pickSuggestions(items, candidates, { behind, ahead, city, mood, categoryPref, diet, limit })

    const enriched = suggested.map((item) => ({
      ...item,
      status: item.status ?? "suggested",
      user_id: userId ?? null,
      city,
    }))

    if (!isAnon) {
      const { error: upsertError } = await supabase.from("itinerary_items").upsert(enriched, { onConflict: "id" })
      if (upsertError) console.error(upsertError)
    }

    return res.json(enriched)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "internal" })
  }
})

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`)
})

async function resolveCoords(city, pref = {}) {
  if (pref.mode === "live" && typeof pref.lat === "number" && typeof pref.lng === "number") {
    return { lat: pref.lat, lon: pref.lng }
  }
  if (!city || !OPENTRIPMAP_API_KEY) return null
  const url = `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(city)}&apikey=${OPENTRIPMAP_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (typeof data.lat === "number" && typeof data.lon === "number") return { lat: data.lat, lon: data.lon }
  return null
}

async function fetchNearby(lat, lon, apiKey) {
  if (!apiKey) return []
  const kinds = "interesting_places,cultural,foods,amusements"
  const radius = 5000
  const limit = 12
  const url = `https://api.opentripmap.com/0.1/en/places/radius?lat=${lat}&lon=${lon}&radius=${radius}&limit=${limit}&kinds=${kinds}&format=json&apikey=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data)
    ? data.map((d) => ({
        xid: d.xid,
        name: d.name || "Nearby spot",
        dist: d.dist,
        kinds: d.kinds || "",
        source: "otm",
      }))
    : []
}

async function fetchPlacesRestaurants(lat, lon, apiKey, diet) {
  if (!apiKey) return []
  const radius = 5000
  const keyword = diet === "veg" ? "vegetarian" : diet === "non-veg" ? "restaurant" : diet === "cafe" ? "cafe" : "restaurant"
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=restaurant&keyword=${encodeURIComponent(keyword)}&opennow=true&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  const results = Array.isArray(data.results) ? data.results : []

  const operational = results.filter((r) => r.business_status === "OPERATIONAL")
  const shortlist = operational.slice(0, 8)

  const withDetails = await Promise.all(
    shortlist.map(async (r, idx) => {
      const details = await fetchPlaceDetails(r.place_id, apiKey)
      return { base: r, details, idx }
    })
  )

  const destinations = withDetails
    .map(({ details }) => {
      const loc = details?.geometry?.location
      return typeof loc?.lat === "number" && typeof loc?.lng === "number" ? `${loc.lat},${loc.lng}` : null
    })
    .filter(Boolean)

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
      xid: base.place_id || `g-${idx}`,
      name: details?.name || base.name || "Restaurant",
      dist: distanceMeters,
      kinds: Array.isArray(details?.types) ? details.types.join(",") : Array.isArray(base.types) ? base.types.join(",") : "food",
      source: "google",
      openNow: details?.opening_hours?.open_now ?? base.opening_hours?.open_now ?? false,
      vicinity: base.vicinity || "Nearby",
      rating: typeof details?.rating === "number" ? details.rating : undefined,
      userRatingsTotal: typeof details?.user_ratings_total === "number" ? details.user_ratings_total : undefined,
      distanceMeters,
      travelMinutes,
      dineMinutes,
      mustTry: guessMustTryFromReviews(details?.reviews) || details?.editorial_summary?.overview,
    }
  })
}

async function fetchPlaceDetails(placeId, apiKey) {
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

async function fetchDistanceMatrix(lat, lon, destinations, apiKey) {
  if (!apiKey || destinations.length === 0) return {}
  const unique = Array.from(new Set(destinations)).slice(0, 25)
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat},${lon}&destinations=${unique.join("|")}&mode=walking&units=metric&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return {}
  const data = await res.json()
  const row = data?.rows?.[0]?.elements
  const result = {}
  if (Array.isArray(row)) {
    row.forEach((elem, idx) => {
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

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

async function pickSuggestions(existing, candidates, flags) {
  const base = (existing || []).filter((i) => i.status !== "suggested")
  const limit = flags.limit ?? 6
  const ideas = candidates
    .sort((a, b) => (a.travelMinutes ?? a.dist) - (b.travelMinutes ?? b.dist))
    .slice(0, limit)
    .map((c, idx) => ({
      id: `otm-${c.xid}-${idx}`,
      title: c.name,
      location: c.vicinity || `${Math.round(c.distanceMeters ?? c.dist)}m away`,
      timeSlot: flags.behind ? "Next 60 min" : "Bonus 45 min",
      durationMinutes: (c.dineMinutes ?? 45) + (c.travelMinutes ?? 10),
      category: (c.kinds || "food").split(",")[0] || "Explore",
      status: "suggested",
      note: buildNote(c, flags.behind),
    }))

  const aiRanked = await rerankWithGemini(ideas, base, flags)
  return [...base, ...aiRanked]
}

async function rerankWithGemini(ideas, base, flags) {
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
      ...(base || []).map((b) => `- ${b.timeSlot} ${b.title} at ${b.location}`),
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

    return parsed.map((p, idx) => ({
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

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch (_err) {
    return null
  }
}

function buildNote(c, isBehind) {
  const openNote = c.openNow ? "Open now" : isBehind ? "Opening soon? verify" : "Check opening hours"
  const ratingNote = typeof c.rating === "number" ? `★${c.rating.toFixed(1)}${typeof c.userRatingsTotal === "number" ? ` (${c.userRatingsTotal})` : ""}` : "Rating tbd"
  const travelNote = typeof c.travelMinutes === "number" ? `${c.travelMinutes} min travel` : `${Math.round(c.distanceMeters ?? c.dist)}m away`
  const dineNote = typeof c.dineMinutes === "number" ? `${c.dineMinutes} min to dine` : "Plan ~45 min to dine"
  const dishNote = c.mustTry ? `Must try: ${c.mustTry}` : "Ask staff for recommendations"
  return `${openNote} · ${ratingNote} · ${travelNote} · ${dineNote} · ${dishNote}`
}

function guessMustTryFromReviews(reviews) {
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
  const counts = {}
  tokens.forEach((w) => {
    counts[w] = (counts[w] || 0) + 1
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

function formatDishName(word) {
  return word
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ")
}
