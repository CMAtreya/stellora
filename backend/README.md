# Stellora Backend

This folder holds server-only assets (Prisma schema, service credentials). Keep Supabase service-role and database URLs here—never ship them to the frontend.

## Setup
```
cp .env.example .env
# Fill DATABASE_URL and SUPABASE_SERVICE_ROLE (service key). Keep this file private.
npm install
npm run prisma:generate
```

## Scripts
- `npm run prisma:generate` — generate Prisma client
- `npm run prisma:migrate:dev` — run dev migrations
- `npm run prisma:studio` — open Prisma Studio

## Env (backend/.env)
- `DATABASE_URL` — Postgres connection string from Supabase
- `SUPABASE_SERVICE_ROLE` — service_role key (server-only)
