# Plan — Integración n8n → Google Sheets (export de eventos)

## Contexto

Elabora la **Parte C** del plan general de la app INER Check-in (que vive en `PLAN.md` del repo
Gitea). Objetivo: que **n8n** lea la base de Supabase y vuelque la información a **Google Sheets**
para el equipo no técnico, sin que ellos toquen la base.

Decisiones tomadas (clarificadas con el usuario):
- **Un libro de Google Sheets por país** (Argentina, Chile, Perú, Uruguay; hoy solo AR y CL
  tienen parques/datos).
- **Una fila por evento crudo** (cada pulsación de botón: `entrada_parque`, `traslado_maquina`,
  `entrada_wtg`, `salida_wtg`, `inicio_almuerzo`, `inicio_standby`, `finalizar_parque`), no por
  tramo. → La fuente NO es la vista `tramos` sino una vista **a nivel de evento**.
- **Autenticación Google: OAuth** de una cuenta (credencial Google Sheets OAuth2 en n8n).
- **Corte 20:00 hora local de cada país** (ya decidido en el plan general).
- **Arquitectura: directo BD → Google Sheets, SIN CSV intermedio.** El "parseo" (joins,
  categoría, formato) lo hace Postgres en la vista `reporte_eventos`; n8n solo mueve filas a cada
  libro. Se descartó el CSV de staging por sumar pasos y complicar la deduplicación (la base ya es
  la fuente de verdad y el match por `evento_id` da idempotencia). Si más adelante hace falta un
  snapshot auditable, se agrega un branch de respaldo CSV sin tocar el camino principal.

> Esta sesión es de **planificación**: no se construye n8n todavía.

---

## Flujo del workflow

```
  ┌─ Schedule 20:00 AR (TZ Buenos_Aires) ─┐
  ┌─ Schedule 20:00 CL (TZ Santiago)    ─┤   (1 cron por país, su TZ local)
  ┌─ Schedule 20:00 PE (TZ Lima)        ─┤
  ┌─ Schedule 20:00 UY (TZ Montevideo)  ─┘
                  │  (cada trigger setea la variable {pais})
                  ▼
        [Set] país + spreadsheetId del libro de ese país (lookup)
                  ▼
        [Postgres] SELECT * FROM public.reporte_eventos
                   WHERE pais = {{pais}}
                     AND updated_at > {{watermark[pais]}}   -- alto-agua incremental
                  ▼
        [Set/Function] ordenar columnas + formatear timestamps a hora local
                  ▼
        [Google Sheets] operación "Append or Update Row"
                   match column = evento_id  → idempotente (no duplica, refleja anulaciones)
                   spreadsheet = libro del país · hoja "eventos"
                  ▼
        [Set] guardar nuevo watermark[pais] = max(updated_at) en static data
                  ▼
        [IF error] → notificación (email/Slack) sin perder el watermark
```

**Por qué "Append or Update" con `evento_id`:** cada evento tiene PK UUID estable. Usar
`evento_id` como columna de match hace el export **idempotente**: re-correr, solapamientos de
ventana o datos que llegan tarde (técnico que sincroniza días después) **no duplican** filas; y
si un evento se **anula** luego, su fila se **actualiza** (no se crea otra). Esto resuelve el
Conflicto C5 del plan general a nivel de evento (clave = `evento_id`).

---

## Parte A — Backend Supabase (cambios para soportar el export por evento)

### A1. Vista `public.reporte_eventos` (grano de evento)
Reemplaza/!complementa a `reporte_diario` (que era a nivel de tramo). Une
`eventos → jornadas → parques → (empresas) → tecnicos` y expone el país para el ruteo:
```sql
create or replace view public.reporte_eventos as
select
  e.id                as evento_id,
  j.fecha,                              -- día local del parque (TZ por país)
  p.pais,
  p.nombre            as parque,
  emp.nombre          as empresa,
  t.nombre            as tecnico,
  j.subtipo,
  e.tipo,                               -- el botón
  e.categoria,
  e.maquina_id,
  e.ts_dispositivo,                     -- hora exacta con offset local
  e.ts_servidor,                        -- cuándo entró a la base (sync)
  e.motivo, e.motivo_otro, e.comentario,
  e.anulado,
  e.updated_at                          -- para el alto-agua (ver A2)
from public.eventos e
join public.jornadas j on j.id = e.jornada_id
join public.parques  p on p.id = j.parque_id
left join public.empresas emp on emp.id = p.empresa_id
join public.tecnicos t on t.id = j.tecnico_id;
```
Se exportan **todos** los eventos (incluidos `anulado = true`) con su columna `anulado`, para que
una anulación se refleje como actualización de la fila. (Alternativa: filtrar anulados; se
descartó para que el equipo vea correcciones.)

### A2. `eventos.updated_at` para capturar anulaciones
Hoy `eventos` no tiene `updated_at`. Como ahora se permite UPDATE de `anulado` (A6 del plan
general), agregar:
```sql
alter table public.eventos add column if not exists updated_at timestamptz not null default now();
-- trigger que bumpea updated_at en cada UPDATE (o setearlo desde la app al anular).
```
n8n usa **`updated_at` como alto-agua** (no solo `ts_servidor`): así captura tanto inserts nuevos
como anulaciones posteriores. Para inserts, `updated_at = ts_servidor` por el default.

### A3. Rol de solo lectura para n8n
```sql
create role n8n_reader login password '<secreto>' nosuperuser nocreatedb nocreaterole;
-- La vista es la única superficie que n8n necesita:
grant usage on schema public to n8n_reader;
grant select on public.reporte_eventos to n8n_reader;
```
Como `reporte_eventos` lee tablas con RLS y `n8n_reader` no es `authenticated`, definir la vista
como **`security_definer`** (propiedad de `postgres`) para que el reader vea las filas a través de
ella, **sin** darle acceso directo a las tablas base ni `BYPASSRLS`. (Es una vista de reporte de
solo lectura; menor privilegio que un rol con BYPASSRLS.)
Conexión: cadena Postgres de Supabase (pooler sesión, puerto 5432) con `n8n_reader`.

---

## Parte B — Configuración en n8n (manual, una vez)

1. **Credencial Postgres** → host/puerto/db/usuario `n8n_reader` de Supabase (solo lectura).
2. **Credencial Google Sheets OAuth2** → conectar la cuenta Google del equipo; dar permiso de
   edición de Sheets.
3. **Crear los libros** (uno por país, hoy AR y CL): cada libro con una hoja `eventos` y la
   **fila de encabezados** en el orden de columnas de la vista (evento_id, fecha, pais, parque,
   empresa, tecnico, subtipo, tipo, categoria, maquina_id, ts_dispositivo, ts_servidor, motivo,
   motivo_otro, comentario, anulado). Compartir/poseer con la cuenta OAuth.
4. **Mapa país → spreadsheetId**: en un nodo `Set` inicial o variables de entorno de n8n
   (`SHEET_AR`, `SHEET_CL`, …), para rutear cada país a su libro.

---

## Parte C — El workflow (versionado en el repo)

Archivos a crear (al ejecutar, en `Asistencia-app-iner/`):
- `n8n/checkin-export.workflow.json` — export del workflow para versionarlo.
- `n8n/README.md` — pasos de import, credenciales, mapa de spreadsheets, cómo correr manual.
- `supabase/reporte_eventos.sql` — la vista A1 + `updated_at` A2 + rol A3 (o integrarlo en
  `supabase/migrations/0001_init.sql`).

Nodos:
1. **Schedule Trigger** ×4 (uno por país, TZ local, 20:00). Cada uno fija `{{pais}}`. Alternativa
   compacta: 1 trigger horario + filtro "¿son las 20:00 locales de algún país?".
2. **Set** — `pais` + `spreadsheetId` (lookup del mapa).
3. **Postgres** — `select * from public.reporte_eventos where pais = $1 and updated_at > $2`
   (`$2` = watermark del país desde `getWorkflowStaticData`; en la 1ª corrida, epoch 0).
4. **Set/Function** — orden de columnas y formateo de `ts_dispositivo`/`fecha` a texto legible.
5. **Google Sheets** — *Append or Update Row*, match `evento_id`, hoja `eventos` del libro del país.
6. **Set** — `staticData[pais].watermark = max(updated_at)` de lo procesado.
7. **Error Trigger / IF** — notificación de fallo; el watermark **no** avanza si falló, para
   reintentar en la próxima corrida.

---

## Conflictos específicos del export (además de los del plan general)

- **N1. Anulaciones posteriores al export** → resuelto con `updated_at` como alto-agua + match por
  `evento_id` (la fila se actualiza con `anulado=true`).
- **N2. Datos sincronizados tarde** (técnico offline por días) → el evento entra con `ts_servidor`
  reciente, así que `updated_at` reciente lo captura; el match por id evita duplicar.
- **N3. RLS vs n8n** → vista `security_definer` + `grant select` solo sobre la vista (N10 del plan
  general, ahora concretado).
- **N4. Watermark perdido / primera corrida** → epoch 0 trae todo histórico una vez; el match por
  `evento_id` evita duplicar si se re-corre.
- **N5. Límites de Google Sheets** (filas, cuota API) → "Append or Update" hace 1 lectura+escritura
  por fila; si el volumen crece, batch por lotes y/o rotar hoja por mes. Monitorear cuota OAuth.
- **N6. Hora del cron** → n8n usa la TZ configurada del trigger; alinear con `TZ_POR_PAIS` del país
  para que "20:00" sea local real.

---

## Verificación (al ejecutar, tras el OK)

1. Crear la vista `reporte_eventos` y `n8n_reader`; `select * from public.reporte_eventos` como
   `n8n_reader` devuelve filas (RLS no lo bloquea por `security_definer`).
2. Cargar datos de prueba (1 técnico, 1 asignación, 1 jornada, varios eventos) en CL.
3. Importar el workflow en n8n; configurar credenciales y `spreadsheetId` de CL.
4. **Run manual** del branch CL → el libro de Chile, hoja `eventos`, recibe **una fila por evento**
   con las columnas correctas.
5. **Idempotencia:** re-correr → no se duplican filas (match por `evento_id`).
6. **Anulación:** marcar un evento `anulado=true` → re-correr → la fila de ese evento se
   **actualiza** a `anulado=true` (no se crea otra).
7. **Datos tardíos:** insertar un evento con `ts_dispositivo` viejo pero `ts_servidor` actual →
   re-correr → aparece en el sheet.
8. Programar el cron 20:00 TZ Santiago y dejar correr un día real.

---

## Orden de ejecución (cuando des el OK)
1. Parte A (vista `reporte_eventos`, `updated_at`, rol `n8n_reader`) en Supabase.
2. Parte B (credenciales + libros + mapa de spreadsheets en n8n).
3. Parte C (construir/importar el workflow y versionarlo en `n8n/`).
4. Verificación end-to-end y activación del cron.
