export type OraMessage = {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at?: string
}

export type OraChatResponse = {
  response: string
  user_message_corrected?: string
  safety_triggered: boolean
}

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Simple client-side cache for common travel etiquette and FAQs
const ETICKET_CACHE: Record<string, string> = {
  "hello": "Hello there! I'm ORA, your travel assistant. How can I help you on your trip today?",
  "how to say thank you in japanese": "In Japan, you say 'Arigatou Gozaimasu' (ありがとう ございます) to show respect and gratitude.",
  "where do i put my shoes": "In traditional Japanese venues, temples, and homes, you should remove your shoes at the entrance (genkan) and step onto the raised floor.",
  "emergency number": "The general emergency services number varies by country. In Japan, call 119 for fire/ambulance and 110 for police. In the US/Canada, call 911. In Europe, call 112.",
}

function normalizeKey(str: string): string {
  return str.toLowerCase().trim().replace(/[?.!,]/g, '')
}

function getUserIdHeader(): Record<string, string> {
  const token = localStorage.getItem('supabase.auth.token') || '' // Check if token exists
  const guestId = localStorage.getItem('triparc:user_id') || 'guest_anonymous'
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': guestId,
    'x-guest-id': guestId,
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  return headers
}

/**
 * Sends a chat message to ORA. Includes automated retry with exponential backoff.
 */
export async function sendOraChat(
  message: string, 
  locationContext: string = "Unknown location",
  retries: number = 3,
  delay: number = 1000
): Promise<OraChatResponse> {
  // Check local cache first for common questions
  const cacheKey = normalizeKey(message)
  if (ETICKET_CACHE[cacheKey]) {
    return {
      response: ETICKET_CACHE[cacheKey],
      safety_triggered: false
    }
  }

  const url = `${apiBase}/api/ora/chat`
  const headers = getUserIdHeader()
  const body = JSON.stringify({ message, locationContext })

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body
      })

      if (response.status === 429) {
        // Rate limited - wait and retry
        console.warn(`ORA: Rate limited (429). Retrying in ${delay * Math.pow(2, i)}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
        continue
      }

      if (!response.ok) {
        throw new Error(`Server returned error: ${response.status}`)
      }

      return (await response.json()) as OraChatResponse
    } catch (err) {
      if (i === retries - 1) {
        console.error("ORA: Chat request failed after max retries:", err)
        throw err
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }

  throw new Error("ORA: Request timed out or failed to complete.")
}

/**
 * Fetches conversational history.
 */
export async function fetchOraHistory(limit: number = 30): Promise<OraMessage[]> {
  const url = `${apiBase}/api/ora/history?limit=${limit}`
  const headers = getUserIdHeader()

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to load history: ${response.status}`)
    }

    const data = await response.json()
    return (data.history || []) as OraMessage[]
  } catch (err) {
    console.error("ORA: Failed to load history:", err)
    return []
  }
}

/**
 * Deletes user's chat history and summarized profile.
 */
export async function deleteOraHistory(): Promise<boolean> {
  const url = `${apiBase}/api/ora/history`
  const headers = getUserIdHeader()

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers
    })
    return response.ok
  } catch (err) {
    console.error("ORA: Failed to delete history:", err)
    return false
  }
}

/**
 * Transcribes audio fallback via server-side Groq Whisper.
 */
export async function transcribeAudioFallback(audioBlob: Blob): Promise<string> {
  const url = `${apiBase}/api/ora/transcribe`
  const formData = new FormData()
  formData.append('file', audioBlob, 'audio.wav')
  
  const headers = getUserIdHeader()
  // FormData boundary is handled automatically by browser when Content-Type is omitted
  const requestHeaders = { ...headers }
  delete requestHeaders['Content-Type']

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Transcription service failed: ${response.status}`)
    }

    const data = await response.json()
    return data.transcript || ''
  } catch (err) {
    console.error("ORA: Transcription fallback failed:", err)
    throw err
  }
}

/**
 * Exposes edge-tts audio URL helper.
 */
export function getOraSpeakUrl(text: string, voice: string = "en-US-AvaNeural"): string {
  const qs = new URLSearchParams()
  qs.set('text', text)
  qs.set('voice', voice)
  // We can call via GET or POST. Since our endpoint was POST, we will do a POST fetch on demand,
  // or we can generate the URL for a standard HTML audio source if we modify main.py.
  // Wait! In main.py, we defined `POST /api/ora/speak`!
  // To play it, we fetch the audio stream as a blob and play it using URL.createObjectURL(blob).
  // That works beautifully for POST endpoints!
  return `${apiBase}/api/ora/speak`
}

export async function fetchOraAudio(text: string, voice: string = "en-US-AvaNeural"): Promise<Blob | null> {
  const url = `${apiBase}/api/ora/speak`
  const headers = getUserIdHeader()
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, voice })
    })
    
    if (!response.ok) return null
    return await response.blob()
  } catch (err) {
    console.error("ORA: Audio synthesis fetch failed:", err)
    return null
  }
}
