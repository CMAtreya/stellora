import { apiFetch } from './apiClient'

const base = (() => {
  const explicit = (import.meta.env.VITE_TRANSLATOR_API_BASE as string | undefined)?.replace(/\/$/, '')
  if (explicit) return explicit
  const supa = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  if (supa) return `${supa}/functions/v1/translator`
  return '/api/translator'
})()

export type TranslationRequest = {
  text: string
  sourceLang: string
  targetLang: string
  context?: Record<string, unknown>
}

export type TranslationResponse = {
  translatedText: string
  confidence?: number
  hints?: string[]
}

export type CulturalIntel = {
  tips: string[]
  confidence: number
  situation: string
}

export type EmergencyPhrase = {
  phrase: string
  pronunciation?: string
  language: string
}

export async function translateText(payload: TranslationRequest, token?: string): Promise<TranslationResponse> {
  return apiFetch<TranslationResponse>(`${base}/translate`, {
    method: 'POST',
    body: payload,
    token,
  })
}

export async function translateImage(imageDataUrl: string, sourceLang: string, targetLang: string, token?: string): Promise<TranslationResponse> {
  return apiFetch<TranslationResponse>(`${base}/vision`, {
    method: 'POST',
    body: { imageDataUrl, sourceLang, targetLang },
    token,
  })
}

export async function fetchEmergencyPhrases(language: string, token?: string): Promise<EmergencyPhrase[]> {
  return apiFetch<EmergencyPhrase[]>(`${base}/emergency?lang=${encodeURIComponent(language)}`, { token })
}

export async function fetchCulturalIntel(lat: number | null, lng: number | null, situation: string, token?: string): Promise<CulturalIntel> {
  const qs = new URLSearchParams()
  if (lat && lng) {
    qs.set('lat', String(lat))
    qs.set('lng', String(lng))
  }
  qs.set('situation', situation)
  return apiFetch<CulturalIntel>(`${base}/cultural?${qs.toString()}`, { token })
}
