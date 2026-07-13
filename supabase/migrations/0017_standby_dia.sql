-- =====================================================================
-- 0017 — standby_dia: minutos de stand-by POR DÍA (interno + externo) para que
-- n8n complete la celda de stand-by de cada fila de detalle. Correr una vez en
-- el SQL Editor. Idempotente (create or replace).
--
-- Grano = (grupo_clave, parque_id, fecha): empalma 1:1 con las hojas de detalle
--   · interno: reporte_planilla (1 fila por grupo/parque/día)
--   · externo: reporte_externo  (trae grupo_clave/parque_id/fecha; grupo = técnico)
-- n8n hace un LEFT JOIN por esas 3 claves y escribe standby_min en la fila.
--
-- Regla de negocio (IDÉNTICA a resumen_asistencia.sb en 0016): clima al 100 %,
-- programacion_45 descontando 45 min, el resto 0. Si se cambia la regla acá,
-- ACTUALIZAR TAMBIÉN 0016 (y viceversa) — la lógica está duplicada a propósito
-- para no reordenar 0016. Consistencia esperada: sum(standby_min) por parque
-- (externo) == resumen_asistencia.horas_standby_min.
--
-- Definer (sin security_invoker, como las reporte_*): salta RLS. Se revoca a
-- anon/authenticated y se concede solo a n8n_reader.
-- =====================================================================

create or replace view public.standby_dia as
with base as (
  select ec.jornada_id, ec.fecha, ec.pais, ec.parque_id, ec.parque_nombre,
         ec.grupo_clave, ec.subtipo, ec.equipo_id,
         ec.tipo, ec.motivo, ec.motivo_otro, ec.ts_dispositivo,
         lead(ec.ts_dispositivo) over w as fin_ts
  from public.eventos_ctx ec
  window w as (partition by ec.jornada_id order by ec.ts_dispositivo)
),
dur as (
  select grupo_clave, pais, parque_id, parque_nombre, fecha, subtipo, equipo_id,
         case
           when motivo = 'clima'
             or coalesce(motivo_otro,'') ~* '(viento|lluvia|llovizna|ca[ií]da de agua|niebla|nieve|granizo|poca luz|tormenta|indisponibilidad de la m[aá]quina)'
             then greatest(0, round(extract(epoch from (fin_ts - ts_dispositivo)) / 60.0))::int
           when motivo = 'programacion_45'
             or coalesce(motivo_otro,'') ~* 'programaci[oó]n\s*\+?\s*45'
             then greatest(0, round(extract(epoch from (fin_ts - ts_dispositivo)) / 60.0)::int - 45)
           else 0
         end as dur_min
  from base
  where tipo = 'inicio_standby'
)
select grupo_clave, pais, parque_id, parque_nombre, fecha,
       max(subtipo)   as subtipo,
       max(equipo_id) as equipo_id,
       coalesce(sum(dur_min), 0)::int as standby_min,
       -- Mismo total ya formateado HH:MM (sin tope de 24 h): n8n lo pega tal cual
       -- en la celda, sin fórmulas. Ej. 290 min → "04:50".
       lpad((coalesce(sum(dur_min), 0) / 60)::text, 2, '0') || ':' ||
       lpad((coalesce(sum(dur_min), 0) % 60)::text, 2, '0') as standby_hhmm
from dur
group by grupo_clave, pais, parque_id, parque_nombre, fecha;

revoke all on public.standby_dia from anon, authenticated;
grant select on public.standby_dia to n8n_reader;
