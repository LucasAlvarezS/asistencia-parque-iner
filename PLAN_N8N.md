# Plan — Integración n8n → Google Sheets (llenar la planilla)

## Contexto

Parte C del plan general (`PLAN.md`), ajustada al **modelo reconciliado**
(`MODELO_RECONCILIADO.md`). Objetivo: que **n8n** lea Supabase y **llene la planilla Google
Sheets que el equipo no técnico ya usa** (carpeta `csv/`: "Planilla Asistencia Ins
Interna_Externa ARG"), sin que ellos toquen la base.

> **Cambio respecto a la versión anterior:** ya **no** es un volcado plano de "una fila por
> evento crudo". El destino real es la **planilla legada** (formato ancho, una fila por día,
> turbinas en columnas, más una pestaña `Resumen`). El pivot lo hace **Postgres** en las
> vistas `reporte_planilla` / `reporte_resumen`; n8n solo mueve filas a la pestaña correcta.

Decisiones tomadas (ver `MODELO_RECONCILIADO.md`):
- **Un libro Google Sheets por país** (hoy AR y CL tienen datos; estructura para los 4).
- **Pestañas por equipo/persona** dentro del libro: ruteo
  `if subtipo='interno' and pais='argentina' → pestaña = equipo (X-C, F-K); else → técnico`.
- **Formato ancho**: 1 fila por (grupo, parque, día); las turbinas se expanden en columnas
  (WTG 1/2/3 en internas; AERO 1..11 en externa/Naretto) desde el JSON de visitas.
- **Auth Google: OAuth2** (credencial Google Sheets OAuth2 en n8n).
- **Corte 20:00 hora local de cada país** (TZ de `paises.tz`).
- **Arquitectura: BD → Google Sheets, sin CSV intermedio.** La base es la fuente de verdad;
  la idempotencia sale de una clave de fila estable + Append/Update.

> Esta sesión es de planificación: n8n todavía no se construye.

---

## Fuente de datos (ya definida en la migración)

- **`public.reporte_planilla`** — una fila por (grupo, parque, día). Cabecera: `dia/mes/anio`,
  `parque_nombre`, `llegada`, `inicio_actividades`, `colacion`, `termino`, `observaciones`,
  `aeros_inspeccionados`, `palas`, y `visitas` (**JSON** ordenado de
  `{aero, ingreso, salida}`). Trae `grupo_clave`, `equipo_id`, `subtipo`, `pais` para el ruteo.
- **`public.reporte_resumen`** — tablero por (grupo, parque): `turbinas_objetivo`,
  `inspeccionadas`, `pendientes`, `pct_avance`, `dias_sitio`, `dias_productivos`,
  `pct_productividad`, `turb_dia`, `palas`.

Las vistas `reporte_*` no usan `security_invoker`: corren con privilegios del owner, así que
un rol de solo lectura las consulta sin acceso a las tablas base.

---

## Flujo del workflow

```
  ┌─ Schedule 20:00 AR (paises.tz Buenos_Aires) ─┐
  ┌─ Schedule 20:00 CL (Santiago)               ─┤  (1 cron por país, su TZ local)
  ┌─ Schedule 20:00 PE / UY                     ─┘
                  │  (cada trigger setea {pais} y el spreadsheetId del libro)
                  ▼
        [Postgres] SELECT * FROM public.reporte_planilla
                   WHERE pais = {{pais}} AND fecha >= {{ventana}}   -- p.ej. últimas 48 h
                  ▼
        [Function] por cada fila: expandir `visitas` (JSON) a columnas WTG/AERO,
                   formatear horas a TZ local, calcular row_key estable
                  ▼
        [Switch] pestaña destino = (subtipo='interno' && pais='argentina')
                   ? equipo_id (X-C / F-K) : técnico
                  ▼
        [Google Sheets] "Append or Update Row" · match column = row_key
                   spreadsheet = libro del país · hoja = pestaña del equipo/técnico
                  ▼
        [Postgres] SELECT * FROM public.reporte_resumen WHERE pais = {{pais}}
                  ▼
        [Google Sheets] Update de la pestaña "Resumen" (match por grupo+parque)
                  ▼
        [IF error] → notificación (email/Slack)
```

**`row_key` (idempotencia):** clave estable por fila de planilla =
`grupo_clave || '|' || parque_id || '|' || fecha`. Usarla como columna de match en "Append or
Update" hace el export idempotente: re-correr, ventanas solapadas o datos tardíos **no
duplican**; si cambian los eventos del día (p.ej. una anulación), la fila se **actualiza**.

---

## Parte A — Backend Supabase

Ya cubierto en `supabase/migrations/0001_init.sql`:
- Vistas `reporte_planilla` y `reporte_resumen` (pivot + tablero).
- `eventos.updated_at` con trigger (captura anulaciones; alto-agua opcional para incremental).

Falta solo el **rol de solo lectura** para n8n (`supabase/n8n_role.sql`, al montar n8n):
```sql
create role n8n_reader login password '<secreto>' nosuperuser nocreatedb nocreaterole;
grant usage on schema public to n8n_reader;
grant select on public.reporte_planilla, public.reporte_resumen to n8n_reader;
```
Conexión: cadena Postgres de Supabase (pooler sesión, 5432) con `n8n_reader`.

---

## Parte B — Configuración en n8n (manual, una vez)

1. **Credencial Postgres** → `n8n_reader` de Supabase (solo lectura).
2. **Credencial Google Sheets OAuth2** → cuenta del equipo, permiso de edición.
3. **Libros por país** (hoy AR, CL): cada libro con una pestaña por equipo/técnico
   (`01. Equipo X-C`, `02. Equipo F-K`, `03. C. Naretto`, …) + `Resumen`, con la fila de
   encabezados en el orden de columnas de la planilla y una columna oculta `row_key`.
2. **Mapa país → spreadsheetId** y, dentro, **grupo → pestaña** (en un nodo `Set` o variables
   de entorno: `SHEET_AR`, `SHEET_CL`, …).

---

## Parte C — El workflow (versionado en el repo)

Archivos a crear al ejecutar (en la raíz del repo):
- `n8n/checkin-export.workflow.json` — export del workflow.
- `n8n/README.md` — import, credenciales, mapa de spreadsheets, headers, cómo correr manual.
- `supabase/n8n_role.sql` — rol read-only + grants (Parte A).

Nodos: Schedule×país → Postgres(`reporte_planilla`) → Function(expandir JSON + formato +
`row_key`) → Switch(pestaña) → Google Sheets(Append/Update por `row_key`) →
Postgres(`reporte_resumen`) → Google Sheets(Update Resumen) → Error/IF.

---

## Conflictos específicos del export

- **N1. Anulaciones / cambios posteriores** → la fila se recalcula en `reporte_planilla`; el
  match por `row_key` la **actualiza** (no duplica).
- **N2. Datos sincronizados tarde** (offline 1-2 días) → ventana de 48 h en el SELECT +
  match por `row_key` los incorpora sin duplicar.
- **N3. RLS vs n8n** → vistas `reporte_*` sin `security_invoker` + `grant select` solo sobre
  ellas (sin acceso a tablas base).
- **N4. Ancho variable de turbinas** (3 internas vs 11 Naretto) → el JSON `visitas` se expande
  en la Function según la pestaña; el template fija el máximo de columnas por pestaña.
- **N5. Límites de Google Sheets** → "Append or Update" es 1 lectura+escritura por fila; si
  crece el volumen, batch y/o rotar hoja por mes. Monitorear cuota OAuth.
- **N6. Hora del cron** → TZ del trigger alineada con `paises.tz` para que "20:00" sea local.

---

## Verificación (al ejecutar)

1. Crear `n8n_reader`; `select * from reporte_planilla` como ese rol devuelve filas (no lo
   bloquea RLS por ser vista definer).
2. Datos de prueba: 1 equipo AR interno (2 técnicos) + 1 externo → `reporte_planilla` da una
   fila por equipo/día (aeros combinados) y filas por técnico para el externo.
3. Importar workflow; configurar credenciales y spreadsheetId de AR.
4. **Run manual** → la pestaña del equipo recibe la fila con WTG expandidas; `Resumen` se
   actualiza.
5. **Idempotencia:** re-correr → no duplica (match `row_key`).
6. **Anulación / dato tardío:** anular un evento o insertar uno con `ts_dispositivo` viejo →
   re-correr → la fila se actualiza / aparece.
7. Programar el cron 20:00 por TZ y dejar correr un día real.

---

## Orden de ejecución (cuando des el OK)
1. `supabase/n8n_role.sql` (rol read-only + grants).
2. Parte B (credenciales + libros + mapa de spreadsheets/pestañas en n8n).
3. Parte C (construir/importar el workflow y versionarlo en `n8n/`).
4. Verificación end-to-end y activación del cron.
