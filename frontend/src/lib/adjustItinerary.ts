import { supabase } from './supabaseClient'

export type ItineraryItem = {
  id?: string
  title: string
  location: string
  timeSlot: string
  durationMinutes: number
  category: string
  status?: 'planned' | 'suggested' | 'skipped'
  note?: string
}

export type AdjustPayload = {
  city: string
  behind: boolean
  ahead: boolean
  locationPref: { mode: 'live' | 'manual'; lat?: number; lng?: number; label: string }
  items: ItineraryItem[]
  mood?: string
  categoryPref?: string
  diet?: string
  moreIdeas?: boolean
}

export async function requestAdjustItinerary(payload: AdjustPayload) {
  const { data, error } = await supabase.functions.invoke<ItineraryItem[]>('adjust_itinerary', { body: payload })
  if (error) throw error
  return data ?? []
}
