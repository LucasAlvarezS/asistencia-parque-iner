# Stack tecnológico — INER Check-in

Documento único que consolida y **justifica** la pila del proyecto. Reconcilia las
decisiones dispersas (y a veces contradictorias) de `PLAN.md`, `FASE0_SUPABASE_VERCEL.md`,
`MODELO_RECONCILIADO.md` y `PLAN_N8N.md`. Ante cualquier discrepancia con esos docs, **este
archivo manda** para lo tecnológico; `MODELO_RECONCILIADO.md` manda para el modelo de datos.

## 0. Qué es el sistema (una línea)

PWA offline para técnicos que inspeccionan parques eólicos → escribe eventos en Supabase →
n8n vuelca vistas SQL a la planilla Google Sheets que usa el equipo no técnico.

## 1. Diagrama de capas

```
   DISPOSITIVO (técnico, campo)                 CLOUD                         DOWNSTREAM
 ┌─────────────────────────────┐    ┌──────────────────────────┐    ┌────────────────────┐
 │  PWA Next.js (Vercel)        │    │  Supabase cloud (São P.) │    │  n8n (self-hosted) │
 │  • app-shell cacheado (SW)   │───▶│  • Postgres + RLS        │    │  • cron 20:00/país │
 │  • cola outbox IndexedDB     │auth│  • Auth (auth.users)     │───▶│  • lee reporte_*   │
 │    (offline 1–2 días)        │+wr │  • vistas: tramos,       │read│  • OAuth2          │
 │  • instalable (manifest)     │    │    reporte_planilla/res. │only│                    │
 └─────────────────────────────┘    └──────────────────────────┘    └─────────┬──────────┘
        reintento al reconectar                                                ▼
                                                                      ┌────────────────────┐
   Git: Gitea self-hosted (Tailscale 100.127.72.128)                  │  Google Sheets     │
                                                                      │  (planilla legada) │
                                                                      └────────────────────┘
```

Único puente self-hosted ↔ cloud: la conexión **read-only** de n8n al pooler de Supabase.

## 2. Stack por capa

| Capa | Elección | Versión | Por qué | Alternativa descartada |
|---|---|---|---|---|
| Framework | Next.js (App Router) | 15.1.x | SSR para el catálogo + islas cliente para el check-in; ecosistema PWA maduro | Vite+React puro (sin SSR); Remix |
| Lenguaje | TypeScript | 5.7.x | Modelo tipado (catálogos, eventos) compartido entre UI y validación | JS plano |
| UI runtime | React | 19.x | Requerido por Next 15 | — |
| Estilos | Tailwind CSS | 3.4.x | Paleta dark industrial ya definida (`tailwind.config.ts`) | CSS Modules; styled-components |
| Backend (BaaS) | Supabase — Postgres + Auth + RLS | supabase-js 2.48.x · @supabase/ssr 0.5.x | Postgres real (vistas = lógica de tramos/reportes), Auth con RLS por `auth.uid()`, tier cloud gestionado | Firebase (descartado en FASE0); backend propio |
| Cola offline | IndexedDB vía `idb` | idb 8.x | `outbox` idempotente por UUID; suficiente para 1–2 días de desconexión | **PowerSync** (over-engineering para 1–2 días, lock-in); localStorage (sin capacidad/estructura) |
| PWA / Service Worker | `@serwist/next` | serwist 9.x | Compatible con Next 15 App Router; precache del app-shell + catálogo | `next-pwa` (sin soporte estable de App Router); SW a mano |
| Deploy de la app | Vercel | — | CI/CD desde git, env vars, edge; cero mantenimiento de servidor | Self-hosted (se prefiere gestionado) |
| Base de datos host | Supabase cloud (región São Paulo) | — | Baja latencia a AR/CL; backups y `wal` gestionados | Supabase self-hosted (se prefiere gestionado) |
| Automatización downstream | n8n (self-hosted) | — | Ya montado; mueve `reporte_planilla`/`reporte_resumen` a Sheets sin CSV intermedio | Google Apps Script; export CSV plano |
| Destino de reportes | Google Sheets (OAuth2) | — | Planilla legada que el equipo no técnico ya usa a diario | CSV intermedio (descartado en `PLAN_N8N.md`) |
| Repositorio / VCS | Gitea self-hosted (Tailscale) | — | Ya en uso; red privada | GitHub |

## 3. Reconciliaciones (por qué cambian los docs previos)

- **PowerSync → cola propia en IndexedDB.** `FASE0` lo proponía; `PLAN.md` ya lo descartó.
  Con offline de **1–2 días**, una `outbox` idempotente por UUID + reintento al reconectar
  alcanza, sin el costo ni el lock-in de PowerSync. La replicación lógica (`publication
  powersync`) de la migración queda como no usada (se puede reaprovechar para reporting).

- **Offline 1–2 días (no "semanas").** `PLAN.md` mencionaba 1–2 semanas; el modelo
  reconciliado y la operación real son **1–2 días**. Esto baja el riesgo de expiración del
  refresh token y de desalojo de storage a algo manejable con `autoRefreshToken` +
  `navigator.storage.persist()` best-effort, **sin** la maquinaria de "re-login que conserva
  la cola" que exigiría la variante de semanas. La cola nunca se borra hasta confirmar el
  insert en Supabase.

- **Cloud gestionado (Vercel + Supabase cloud).** Aunque Gitea y n8n corren en el servidor
  propio (Tailscale), la app y la BD viven en cloud. Menos superficie de mantenimiento
  (Postgres, backups, TLS, deploys) a cambio de que los datos salgan de la red propia —
  aceptable para este dataset operativo.

## 4. Entornos y variables

| Variable | Ámbito | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente + server | Endpoint del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente + server | Clave anónima (RLS aplica) |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo server** | Salta RLS (seed, tareas admin). Nunca `NEXT_PUBLIC_` |
| cadena Postgres pooler (`n8n_reader`) | n8n | Lectura de `reporte_*` (rol read-only, otra sesión) |

- **Local:** `.env.local` (ver `.env.local.example`).
- **Vercel:** las tres primeras como env vars del proyecto (Production + Preview).

## 5. Riesgos del stack (mitigaciones)

| Riesgo | Mitigación | Ref |
|---|---|---|
| Desalojo de storage borra la cola offline | `navigator.storage.persist()` al login; no borrar de `outbox` hasta confirmar insert; contador de pendientes visible | PLAN.md C2 |
| Expiración de refresh token tras días offline | `autoRefreshToken`; con 1–2 días rara vez expira; si expira, re-login conserva la cola | PLAN.md C3 |
| Nueva versión de SW con técnicos offline | SW conservador (sin `skipWaiting` agresivo); activar al reabrir sin pendientes; IndexedDB independiente del shell | PLAN.md C11 |
| Cuota OAuth de Google Sheets | "Append or Update" por `row_key`; batch/rotar hoja si crece el volumen | PLAN_N8N.md N5 |

## 6. Versiones fijadas

Ver `package.json`. Resumen: `next` 15.1.x · `react`/`react-dom` 19.x · `typescript` 5.7.x ·
`tailwindcss` 3.4.x · `@supabase/ssr` 0.5.x · `@supabase/supabase-js` 2.48.x · `idb` 8.x ·
`serwist` + `@serwist/next` 9.x.

## 7. Fuera del stack de la app (referencia)

- **Modelo de datos:** `MODELO_RECONCILIADO.md` + `supabase/migrations/0001_init.sql`.
- **Downstream n8n → Sheets:** `PLAN_N8N.md`.
- **Roadmap de construcción:** `PLAN.md` (Partes A–D).
