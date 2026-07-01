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
- **Dos formatos** (misma base, distinta vista):
  - **Interno**: formato ancho, 1 fila por (grupo, parque, día); turbinas en columnas WTG 1/2/3
    desde el JSON `visitas` de `reporte_planilla`.
  - **Externo**: formato **PLOM** (reemplaza al viejo Naretto de 11 AERO): 1 fila **por aero
    visitado** con cadena de tiempos, desde `reporte_externo` (+ hoja RESUMEN). Ver más abajo.
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
  `{aero, numero, nombre, ingreso, salida}`). Trae `grupo_clave`, `equipo_id`, `subtipo`,
  `pais` para el ruteo. `termino` = último `salida_parque`/`finalizar_parque` del día.
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

## Mapa de columnas real por pestaña (planilla legada)

Derivado de los CSV en `csv/`. **Las pestañas NO comparten layout**: interna y externa
difieren en orden de columnas y en qué columnas existen. Por eso el nodo Function lleva un
**mapa por plantilla** y el Switch elige *plantilla + hoja* según `grupo_clave`. Todas las
horas se formatean a la **TZ local del país** (`paises.tz`), formato `HH:MM`.

### Plantilla INTERNA — `01. Equipo X-C`, `02. Equipo F-K` (máx 3 WTG/día)
Orden exacto (+ `row_key` como columna **oculta** de match, p.ej. al final o col A):
`N° · Día · Mes · Año · Parque Eólico · llegada subestación · Inicio de actividades ·
[Tras. WTG i · Ingreso WTG i · Salida WTG i] × i=1..3 · Colación · Hora de termino ·
Nombre WTG · WTG 1 · WTG 2 · WTG 3 · Palas insp · Observaciones`

Mapeo desde `reporte_planilla`:
| Columna hoja | Origen |
|---|---|
| Día / Mes / Año | `dia` / `mes` / `anio` |
| Parque Eólico | `parque_nombre` |
| llegada subestación | `llegada` |
| Inicio de actividades | `inicio_actividades` |
| Ingreso WTG i / Salida WTG i | `visitas[i-1].ingreso` / `.salida` |
| Tras. WTG i | *(sin origen: `traslado_maquina` es 1×/día, ya reflejado en Inicio de actividades — se deja vacío)* |
| Colación | `colacion` |
| Hora de termino | `termino` |
| Nombre WTG | `visitas[i-1].nombre` en el slot i (ej. `WTG 04`) |
| WTG 1 / WTG 2 / WTG 3 | `1` si `visitas[i-1]` está inspeccionado, si no vacío |
| Palas insp | `palas` (3 × aeros inspeccionados) |
| Observaciones | `observaciones` (standby + comentarios) |

### Plantilla EXTERNA — formato **PLOM** (estándar para TODOS los externos)
> **Reemplaza** al viejo layout ancho de Naretto (11 AERO). El externo usa un archivo con una
> hoja **RESUMEN** + una **hoja de detalle por parque**. Fuente: vistas `reporte_externo`
> (detalle) y `reporte_externo_resumen` (RESUMEN). Ejemplo: `Horas OT PLOM junio 2026.xlsx`.

**Detalle** — **una fila por aero visitado** (no por día): agrupadas por día. Columnas y origen
(desde `reporte_externo`; horas formateadas a TZ local, duraciones desde `*_min`):
| Columna hoja | Origen |
|---|---|
| Fecha / Cant de WTG | `fecha` / count de filas del día |
| WTG | `wtg` (nº de aero) |
| Esfuerzo Inicio | `esfuerzo_inicio` |
| Traslado | `traslado_min` |
| Parada de aero | `parada_aero` |
| Esfuerzo final / Inicio Aero | `esfuerzo_final` (= `inicio_aero`) |
| Salida de parque | `salida_de_parque` (solo última fila del día) |
| Tiempo | `tiempo_min` (solo última fila del día) |
| Observacion | `observacion` |

**RESUMEN** — una fila por (grupo/parque) desde `reporte_externo_resumen`:
`Parque · Fecha Inicio · Fecha Término · Días Trabajados · WTG · Prom Diario · Stand by`
← `parque_nombre · fecha_inicio · fecha_termino · dias_trabajados · wtg · prom_diario · standby`.

Ruteo del externo: `grupo_clave = 'tecnico:<uuid>'` → hoja del técnico/parque. `row_key` sugerida
para el detalle: `grupo_clave|parque_id|fecha|wtg` (idempotencia por aero-día).

### Pestaña `Resumen` (desde `reporte_resumen`)
Dos tablas lado a lado (Inspección **interna** | **externa**) + bloque "Desempeño por Equipo":
| Columna hoja | Origen |
|---|---|
| Equipo | `equipo_id` (interna) / técnico (externa) |
| Parque | `parque_nombre` |
| Turbinas a Inspeccionar / Turb. Obj. | `turbinas_objetivo` |
| Turbinas Inspeccionadas / Inspecc. | `inspeccionadas` |
| WTG Pend / Pend. | `pendientes` |
| % Avance | `pct_avance` |
| Tiempo Total (Días) / Días Sitio | `dias_sitio` |
| Días Prod. | `dias_productivos` |
| % Prod. | `pct_productividad` |
| Turb/Día | `turb_dia` |
| Promedio Palas Inspeccionadas | `palas` / `inspeccionadas` |
| Informes NL | *(sin origen en eventos → carga manual)* |

### Notas de mapeo
- **Ruteo (Switch):** `grupo_clave` decide plantilla + hoja. Interna `equipo:<id>` → mapa
  **equipo→hoja** (X-C/F-K); externa `tecnico:<uuid>` → mapa **técnico→hoja** (Naretto). n8n
  necesita **ambos mapas** + el mapa **país→spreadsheetId**.
- **`N°`** es un correlativo cosmético de la planilla; no lo toca n8n (o se setea por posición).
- **Overflow** (>3 interna / >11 externa en un día): política = fila extra con mismo `row_key`
  sufijado o truncar + marcar en `Observaciones`. Hoy la operación real es ~1 aero/día en interna.
- El DB es **más rico** que la planilla: si algún día se quieren llenar los `Tras.` por-aero,
  bastaría registrar `traslado_maquina` por máquina (hoy es 1×/día por decisión operativa).

---

## Parte A — Backend Supabase

Ya cubierto en `supabase/migrations/0001_init.sql`:
- Vistas `reporte_planilla` y `reporte_resumen` (pivot + tablero).
- `eventos.updated_at` con trigger (captura anulaciones; alto-agua opcional para incremental).

Vistas de reporte, **dos familias** (misma base de eventos):
- **Interno:** `reporte_planilla` / `reporte_resumen` (planilla legada AR por equipo/persona).
- **Externo:** `reporte_externo` / `reporte_externo_resumen` (**formato PLOM**, ver §"Plantilla
  EXTERNA" arriba). Estándar para todos los externos.

Falta solo el **rol de solo lectura** para n8n — ya versionado en **`supabase/n8n_role.sql`**:
```sql
create role n8n_reader login password '<secreto>' nosuperuser nocreatedb nocreaterole nobypassrls;
grant usage on schema public to n8n_reader;
grant select on public.reporte_planilla, public.reporte_resumen,
                public.reporte_externo, public.reporte_externo_resumen to n8n_reader;
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
