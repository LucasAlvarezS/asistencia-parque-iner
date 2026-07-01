# INER Check-in

PWA offline para registro de jornadas de técnicos en parques eólicos. Escribe eventos en
**Supabase**; **n8n** vuelca las vistas de reporte a la **planilla Google Sheets** del equipo
no técnico.

> **Stack completo y justificado:** ver **[`STACK.md`](./STACK.md)**.
> **Modelo de datos:** ver [`MODELO_RECONCILIADO.md`](./MODELO_RECONCILIADO.md).

## Setup

1. `npm install`
2. Copiar `.env.local.example` → `.env.local` y completar las claves de Supabase.
3. En Supabase (SQL Editor), ejecutar en orden:
   - `supabase/migrations/0001_init.sql`
   - `supabase/seed.sql`
4. `npm run dev` → http://localhost:3000 (health check: lista los parques del seed).

## Deploy (Vercel)

Conectar el repo. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server-only).

## Estructura

```
app/            Next.js App Router (shell + PWA: manifest.ts, sw.ts)
  login/          pantalla de login (placeholder)
  onboarding/     selección de parque (placeholder)
  _components/    componentes compartidos (placeholder)
lib/
  catalogos.ts    catálogos del modelo (eventos, motivos, subtipos, países)
  tiempo.ts       utilidades de fecha/hora por TZ
  supabase/       clientes browser/server
  offline/        cola IndexedDB (db, registrarEvento, sync) — placeholders
supabase/         migración + seed (fuente de verdad del modelo)
```

## Roadmap

Según [`PLAN.md`](./PLAN.md): Parte A (modelo de datos), Parte B (offline + pantallas + PWA),
Parte C (n8n → Sheets, ver [`PLAN_N8N.md`](./PLAN_N8N.md)).
