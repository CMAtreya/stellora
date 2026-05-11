# Stellora Monorepo (Frontend + Backend)

Neon, Gen Z-inspired Supabase auth UI on the frontend, plus Prisma schema on the backend. Frontend keeps only the Supabase anon key; backend holds service-role and database secrets.

## Structure
- `frontend/` — Vite + React + Tailwind app. Uses Supabase anon key only.
- `backend/` — Prisma schema and server-only secrets (service role, `DATABASE_URL`).
- `.github/` — CI/Copilot instructions.

## Frontend quickstart
```
cd frontend
npm install
cp .env.example .env  # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (anon key only)
npm run dev
```
Dev server: http://localhost:5173/

## Backend quickstart (Prisma)
```
cd backend
npm install
cp .env.example .env  # set DATABASE_URL and SUPABASE_SERVICE_ROLE (keep private)
npm run prisma:generate
```

## Scripts
- Frontend: `npm run dev`, `build`, `preview`, `lint`
- Backend: `npm run prisma:generate`, `npm run prisma:migrate:dev`, `npm run prisma:studio`

## Security notes
- Never place `SUPABASE_SERVICE_ROLE` in the frontend. Keep it in `backend/.env` only.
- Frontend `.env` should only contain anon/public values.

## Design notes
- Framer Motion micro-interactions, glassmorphism, and neon gradients live in `frontend/src`.
- Replace placeholder media with branded assets and prefer CDN/self-hosting for performance.# STELLORA Landing Page (React + Vite + Tailwind)

AI-powered tourism landing page inspired by Tesla/Apple/Stripe aesthetics: cinematic minimalism, adaptive itineraries, cultural storytelling, and smooth motion via Framer Motion.

## Tech Stack
- React 19 + TypeScript (Vite)
- Tailwind CSS with custom gradients/animations
- Framer Motion for scroll/hover reveals
- Lucide React icons
- react-intersection-observer for scroll triggers
- Supabase (Postgres, auth, storage, realtime)
- Prisma schema for core domain (users, trips, itineraries, city packs)

## Prerequisites
- Node.js 18+ on PATH. On this machine, Node lives at `D:\node.exe`; prepend `D:\` to PATH in new shells before running npm scripts.
 - Supabase project (or any Postgres) for Prisma migrations.

## Setup
```
npm install
npm run dev
```
Then open http://localhost:5173/.

Backend/connectivity quickstart:
```
cp .env.example .env
# fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, DATABASE_URL
npx prisma generate
```

## Scripts
- `npm run dev` � start Vite dev server
- `npm run build` � type-check then build production bundle
- `npm run preview` � preview the production build
- `npm run lint` � run ESLint

## Structure
- `src/App.tsx` � all landing sections (Hero, Problem, Solution grid, Product Demo, How It Works, Feature deep-dives, Social Proof, Trust, Pricing, FAQ, Final CTA, Footer)
- `src/index.css` � Tailwind base + global helpers (noise, glass, gradients)
- `tailwind.config.js` � brand colors, fonts, and animations
- `src/lib/supabaseClient.ts` – Supabase JS client bootstrap
- `src/lib/apiClient.ts` – thin fetch helper for your APIs
- `prisma/schema.prisma` – scalable Postgres models (users, trips, activities, stories, city packs, waitlist)

## Assets
- Videos/images use high-quality external placeholders (Coverr/Unsplash). Replace with branded assets when available and consider self-hosting for performance.

## Notes
- Target Lighthouse: FCP < 1.5s, LCP < 2.5s, CLS < 0.1, Performance 95+.
- Respect `prefers-reduced-motion` if adding heavier animations.
- For scale: use Supabase Postgres with read replicas, PgBouncer (on by default), and move media to Supabase Storage. Partition hot tables, add indexes before launch, and keep service-role keys server-side only.
