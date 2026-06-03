const base = (() => {
  const explicit = (import.meta.env.VITE_TRANSLATOR_API_BASE as string | undefined)?.replace(/\/$/, '')
  if (explicit) return explicit
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
  title: string
  locationLabel: string
  situation: string
  rituals: string[]
  rules: string[]
  regulations: string[]
  tips: string[]
  confidence: number
}

export type EmergencyPhrase = {
  phrase: string
  pronunciation?: string
  language: string
}

export async function translateText(payload: TranslationRequest, token?: string): Promise<TranslationResponse> {
  const response = await fetch(`${base}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Translation request failed: ${response.status} ${text}`)
  }
  return (await response.json()) as TranslationResponse
}

export async function translateImage(imageDataUrl: string, sourceLang: string, targetLang: string, token?: string): Promise<TranslationResponse> {
  const response = await fetch(`${base}/vision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ imageDataUrl, sourceLang, targetLang }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Vision translation request failed: ${response.status} ${text}`)
  }
  return (await response.json()) as TranslationResponse
}

export async function fetchEmergencyPhrases(language: string, token?: string): Promise<EmergencyPhrase[]> {
  const response = await fetch(`${base}/emergency?lang=${encodeURIComponent(language)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Emergency phrases request failed: ${response.status} ${text}`)
  }
  return (await response.json()) as EmergencyPhrase[]
}

export async function fetchCulturalIntel(lat: number | null, lng: number | null, situation: string, token?: string): Promise<CulturalIntel> {
  const qs = new URLSearchParams()
  if (lat && lng) {
    qs.set('lat', String(lat))
    qs.set('lng', String(lng))
  }
  qs.set('situation', situation)
  const response = await fetch(`${base}/cultural?${qs.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cultural intel request failed: ${response.status} ${text}`)
  }
  return (await response.json()) as CulturalIntel
}
