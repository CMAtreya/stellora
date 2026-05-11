import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")
const LIBRE_URL = Deno.env.get("LIBRETRANSLATE_URL") ?? "https://libretranslate.de/translate"
const OCR_SPACE_KEY = Deno.env.get("OCR_SPACE_API_KEY")
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*"

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const authHeader = req.headers.get("Authorization") ?? ""
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userRes } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
  const userId = userRes?.user?.id ?? null

  const url = new URL(req.url)
  const path = url.pathname.split("/").pop()

  try {
    if (path === "translate" && req.method === "POST") {
      const body = await req.json()
      const res = await translateWithLibre(body.text, body.sourceLang, body.targetLang, { ...body.context, userId })
      return json(res)
    }

    if (path === "vision" && req.method === "POST") {
      const body = await req.json()
      const text = await extractText(body.imageDataUrl)
      if (!text) return json({ error: "ocr unavailable" }, 400)
      const res = await translateWithLibre(text, body.sourceLang, body.targetLang, { mode: "ocr", userId })
      return json(res)
    }

    if (path === "emergency" && req.method === "GET") {
      const lang = url.searchParams.get("lang") ?? "en"
      const phrases = await buildEmergencyPhrases(lang)
      return json(phrases)
    }

    if (path === "cultural" && req.method === "GET") {
      const lat = url.searchParams.get("lat")
      const lng = url.searchParams.get("lng")
      const situation = url.searchParams.get("situation") ?? "general"
      const intel = await buildCulturalIntel(lat ? Number(lat) : null, lng ? Number(lng) : null, situation)
      return json(intel)
    }

    return json({ error: "not found" }, 404)
  } catch (err) {
    console.error(err)
    return json({ error: "internal" }, 500)
  }
})

async function translateWithLibre(text: string, source: string, target: string, context?: Record<string, unknown>) {
  const payload = {
    q: text,
    source: mapLang(source),
    target: mapLang(target),
    format: "text",
    alternatives: 2,
    context: context ? JSON.stringify(context) : undefined,
  }

  const res = await fetch(LIBRE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const fallback = await fallbackTranslate(text, source, target)
    return fallback
  }
  const data = await res.json()
  return {
    translatedText: data?.translatedText ?? data?.translation ?? text,
    confidence: 0.72,
    hints: context ? ["Context applied: " + Object.keys(context).join(", ")] : [],
  }
}

async function fallbackTranslate(text: string, source: string, target: string) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${mapLang(source)}|${mapLang(target)}`
  const res = await fetch(url)
  const data = await res.json().catch(() => null)
  return { translatedText: data?.responseData?.translatedText ?? text, confidence: 0.4 }
}

async function extractText(dataUrl: string): Promise<string | null> {
  if (!OCR_SPACE_KEY) return null
  const form = new FormData()
  form.append("base64Image", dataUrl)
  form.append("language", "eng")
  form.append("isOverlayRequired", "false")

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { apikey: OCR_SPACE_KEY },
    body: form,
  })
  if (!res.ok) return null
  const data = await res.json()
  const text = data?.ParsedResults?.[0]?.ParsedText
  return typeof text === "string" ? text : null
}

async function buildEmergencyPhrases(language: string) {
  const base = ["I need help", "Call emergency services", "Where is the hospital?", "I lost my passport", "I am hurt"]
  const translated = await Promise.all(base.map((p) => translateWithLibre(p, "English", language, { mode: "emergency" }).then((r) => r.translatedText)))
  return base.map((p, idx) => ({ phrase: translated[idx] ?? p, language }))
}

async function buildCulturalIntel(lat: number | null, lng: number | null, situation: string) {
  if (!GEMINI_API_KEY) {
    return {
      tips: [
        `Stay polite and concise for ${situation}.`,
        lat && lng ? `You appear near ${lat.toFixed(2)},${lng.toFixed(2)} — avoid loud speech in residential areas.` : "Mind local queues and personal space.",
      ],
      confidence: 0.42,
      situation,
    }
  }

  const prompt = [
    "Give 3 short cultural tips as bullet strings for a traveler.",
    lat && lng ? `Approximate location: ${lat}, ${lng}.` : "Location unknown.",
    `Situation: ${situation}.`,
    "Return JSON: {tips: string[], confidence: number}.",
  ].join("\n")

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
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
  if (!res.ok) {
    return { tips: ["Keep greetings soft-spoken.", "Avoid blocking doorways.", "Thank staff verbally."], confidence: 0.3, situation }
  }
  const data = await res.json().catch(() => null)
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  try {
    const parsed = JSON.parse(text)
    return { tips: parsed.tips ?? [], confidence: parsed.confidence ?? 0.6, situation }
  } catch (_err) {
    return { tips: [text ?? "Mind local etiquette"], confidence: 0.4, situation }
  }
}

function mapLang(label: string) {
  const lower = label?.toLowerCase() ?? ""
  if (lower.startsWith("en")) return "en"
  if (lower.startsWith("es")) return "es"
  if (lower.startsWith("fr")) return "fr"
  if (lower.startsWith("de")) return "de"
  if (lower.startsWith("ja") || lower.includes("japan")) return "ja"
  if (lower.startsWith("ko")) return "ko"
  if (lower.includes("mandarin") || lower.startsWith("zh")) return "zh"
  return lower.slice(0, 2) || "en"
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}
