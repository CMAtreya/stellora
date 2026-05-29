import { resolveApiPath } from './apiClient'
import { supabase } from './supabaseClient'

export type SevenPillarsDestination = {
  location: string
  travelFrom: string
  travelTo: string
}

export type SevenPillarsPayload = {
  engineVersion: string
  destinations: SevenPillarsDestination[]
  dayStart: string
  dayEnd: string
  budgetTier: string
  budgetAmount: number
  archetypes: string[]
  composition: string
  dietary: {
    preferences: string[]
    allergies: string
  }
  interests: string[]
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Please sign in to continue.')
  return token
}

export async function fetchSevenPillarsProfile() {
  const token = await getAccessToken()
  const res = await fetch(resolveApiPath('/api/seven-pillars'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to load profile: ${res.status} ${text}`)
  }
  return (await res.json()) as { data: any | null }
}

export async function saveSevenPillarsProfile(payload: SevenPillarsPayload) {
  const token = await getAccessToken()
  const res = await fetch(resolveApiPath('/api/seven-pillars'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to save profile: ${res.status} ${text}`)
  }
  return (await res.json()) as { ok: boolean; data: any }
}

export async function generateJourneyMap(payload: {
  city: string
  plan: {
    locationPref: { crowded: 'low' | 'medium' | 'high'; walkKm: number }
    budget: string
    budgetAmount?: number
    dayStart?: string
    dayEnd?: string
    travelStyle: string
    food: string[]
    interests: string[]
  }
  chosen: Record<string, string[]>
}) {
  const token = await getAccessToken()
  const res = await fetch(resolveApiPath('/api/generate-full-itinerary'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to generate journey map: ${res.status} ${text}`)
  }
  return (await res.json()) as {
    timeline: any[]
    overflow?: any[]
    analysis?: string
    city: string
  }
}

export type MealType = 'breakfast' | 'lunch' | 'snacks' | 'dinner'

export async function generateSmartTimeline(payload: {
  city: string
  travelWindow?: { from?: string; to?: string }
  plan?: Record<string, any>
  items: Array<Record<string, any>>
  preferences?: Record<string, any>
  mealPlan?: Record<MealType, boolean>
  selectedMeals?: Partial<Record<MealType, string | 'skip'>>
}) {
  const token = await getAccessToken()
  const res = await fetch(resolveApiPath('/api/optimize-itinerary'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to generate timeline: ${res.status} ${text}`)
  }
  return (await res.json()) as {
    city: string
    weatherData: {
      city: string
      latitude?: number
      longitude?: number
      hourly: Array<{ hour: number; label: string; tempC?: number | null; condition?: string; rainProbability?: number; windKph?: number | null }>
      summary?: { bestWindow?: string; hotHours?: number[] }
    }
    mealOptions: Record<MealType, Array<{ name: string; category?: string; address?: string; lat?: number; lng?: number; type?: string }>>
    timeline: any[]
    analysis: string
    summary: {
      weatherOptimized: boolean
      bestWindow?: string
      crowdTiming?: string
      mealCount: number
      placeCount: number
    }
    selectedMeals: Partial<Record<MealType, string | 'skip'>>
  }
}

export async function searchDestinationPlaces(query: string, city?: string, limit = 6) {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
  })
  if (city?.trim()) params.set('city', city.trim())

  const res = await fetch(resolveApiPath(`/api/search-place?${params.toString()}`))
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to search places: ${res.status} ${text}`)
  }
  const data = (await res.json()) as {
    results?: Array<{ label: string; name: string; vicinity?: string; lat?: number; lng?: number; rating?: number; reviews?: number; placeId?: string; photoReference?: string; photoUrl?: string; types?: string[] }>
  }
  return data.results ?? []
}

export async function getRecommendations(payload: {
  city: string
  destinations?: string[]
  interests: string[]
  archetypes?: string[]
  excludeNames?: string[]
  budgetTier: string
  budgetAmount: number
  composition: string
  dietaryPreferences: string[]
  dayStart: string
  dayEnd: string
  latestAnchorPlace?: { name: string; category: string; lat?: number; lng?: number }
}) {
  const token = await getAccessToken()
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const fetchDiscover = fetch(resolveApiPath('/api/discover-city'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  let fetchNearby: Promise<Response> | null = null
  if (payload.latestAnchorPlace) {
    fetchNearby = fetch(resolveApiPath('/api/nearby-recommendations'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  }

  const [discoverRes, nearbyRes] = await Promise.all([fetchDiscover, fetchNearby])

  if (!discoverRes.ok) {
    throw new Error('Failed to fetch discovery recommendations')
  }

  const discoverData = await discoverRes.json()
  let combinedRecommendations = discoverData.recommendations || []

  if (nearbyRes && nearbyRes.ok) {
    const nearbyData = await nearbyRes.json()
    if (nearbyData.recommendations?.length) {
      combinedRecommendations = [...nearbyData.recommendations, ...combinedRecommendations]
    }
  }

  return { recommendations: combinedRecommendations }
}

export async function getPlaceDetails(query: string, city?: string) {
  const params = new URLSearchParams({
    query,
  })
  if (city?.trim()) params.set('city', city.trim())

  const res = await fetch(resolveApiPath(`/api/verify-place?${params.toString()}`))
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to fetch place details: ${res.status} ${text}`)
  }
  return (await res.json()) as {
    details: {
      name: string
      category: string
      estimatedDurationMinutes: number
      openingHours?: string
      bestTimeToVisit?: string
      crowdLevel?: string
      image?: string
      photoUrl?: string
      placeId?: string
      photoReference?: string
      address?: string
    }
  }
}

export async function analyzeDraftItinerary(payload: {
  city: string
  travelWindow?: { from?: string; to?: string }
  plan?: any
  items: Array<{
    id?: string
    title?: string
    name?: string
    category?: string
    type?: string
    location?: string
    time?: string
    timeSlot?: string
    durationMinutes?: number
    baseDurationMinutes?: number
    lat?: number
    lng?: number
  }>
}) {
  const res = await fetch(resolveApiPath('/api/curate/draft-itinerary'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to analyze draft itinerary: ${res.status} ${text}`)
  }
  return (await res.json()) as {
    city: string
    draftItinerary: Array<{
      id?: string
      place: string
      duration: number
      recommended_time: string
      user_time: string
      status: 'optimal' | 'not optimal'
      suggestion: string
      category?: string
      crowd_pattern?: { peak: number[]; low: number[] }
      crowd_window?: { peak: number[]; low: number[] }
      recommended_minutes?: number
      user_minutes?: number | null
      order?: number
    }>
    reordered: Array<{
      id?: string
      place: string
      duration: number
      recommended_time: string
      user_time: string
      status: 'optimal' | 'not optimal'
      suggestion: string
    }>
    output: Array<{
      id?: string
      place: string
      duration: number
      recommended_time: string
      user_time: string
      status: 'optimal' | 'not optimal'
      suggestion: string
      scheduled_time?: string
    }>
    optimizedItems?: Array<{
      id?: string
      title: string
      category: string
      time: string
      timeSlot: string
      durationMinutes: number
      duration: string
      description: string
      status: string
      dayNumber: number
      requiresNextDay?: boolean
    }>
    allOptimal?: boolean
    summary?: string
  }
}

export async function getUserRecommendations() {
  const token = await getAccessToken()
  const res = await fetch(resolveApiPath('/api/user/recommendations'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    console.warn(`Failed to fetch user recommendations: ${res.status} ${text}`)
    return { recommendations: [] }
  }
  return (await res.json()) as {
    recommendations: Array<{
      id: string
      name: string
      address: string
      category: string
      why: string
      estimatedMinutes: number
      bestTime: string
      crowdLevel: string
      image?: string
      destination?: string
      archetypeMatch?: string[]
    }>
  }
}
