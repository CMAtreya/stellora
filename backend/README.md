# Stellora Backend

This folder holds server-only assets (Prisma schema, service credentials). Keep Supabase service-role and database URLs here—never ship them to the frontend.

## Setup
```
npm install
npm run prisma:generate
```

## Scripts
- `npm run prisma:generate` — generate Prisma client
- `npm run prisma:migrate:dev` — run dev migrations
- `npm run prisma:studio` — open Prisma Studio

## Env
Use the single shared env file at [backend/.env](backend/.env). The frontend Vite config now reads from the same file.

Required keys:
- `DATABASE_URL` — Postgres connection string from Supabase
- `SUPABASE_URL` — Supabase project URL used by the backend
- `SUPABASE_SERVICE_ROLE` — service_role key (server-only)
- `GEMINI_API_KEY` — Gemini access for itinerary and reel analysis
- `WEATHER_API_KEY` — OpenWeatherMap key for weather-aware routes
- `OPENTRIPMAP_API_KEY` — OpenTripMap key for discovery and nearby results
- `GOOGLE_PLACES_API_KEY` — Google Places key for verification and maps data
- `VITE_API_URL` — frontend backend base URL, usually http://localhost:8000
- `VITE_SUPABASE_URL` — frontend Supabase URL, usually the same as `SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` — frontend Supabase anon key, from Supabase project settings

Optional keys:
- `SUPABASE_ANON_KEY` — optional anon key for Supabase calls
- `GOOGLE_SERVER_API_KEY` and `GOOGLE_BROWSER_API_KEY` — split Google keys if you use them
- `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` — text-to-speech
- `ALLOWED_ORIGIN` — frontend origin allowed by CORS, e.g. http://localhost:5173
- `VITE_OSRM_URL` — custom routing backend for the frontend, optional
- `VITE_TILE_URL` — custom map tile URL for the frontend, optional
- `VITE_TRANSLATOR_API_BASE` — override for the translator API base, optional
- `LIBRETRANSLATE_URL` — self-hosted LibreTranslate base URL, defaults to http://127.0.0.1:5000

Translator behavior:
- The backend prefers LibreTranslate first.
- If your self-hosted instance is unavailable, it falls back to free secondary providers so the translator still returns a result.
