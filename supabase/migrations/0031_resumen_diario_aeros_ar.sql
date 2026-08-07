-- =====================================================================
-- 0031 — Resumen diario de aeros inspeccionados en Argentina (interno +
-- externo), por parque y responsable (equipo o técnico). Pensada para que
-- n8n la lea y la parsee a CSV/Sheets.
-- Correr una vez en el SQL Editor. Idempotente (create or replace).
--
-- Reutiliza las vistas existentes, sin tocar tablas base:
--   · interno  → reporte_planilla (0021), ya trae aeros_inspeccionados
--     agregado por equipo/parque/día. grupo_clave = 'equipo:{id}'.
--   · externo  → reporte_externo (0003), una fila por turbina visitada;
--     se agrega con count(distinct wtg) por técnico/parque/día, excluyendo
--     los días de standby completo (wtg is null).
-- =====================================================================
begin;

create or replace view public.resumen_diario_aeros_ar as
select
  'interno'::text as subtipo,
  rp.parque_id, rp.parque_nombre, rp.fecha,
  eq.nombre as responsable,
  rp.aeros_inspeccionados
from public.reporte_planilla rp
join public.equipos eq on eq.id = split_part(rp.grupo_clave, ':', 2)
where rp.pais = 'argentina'

union all

select
  'externo'::text as subtipo,
  re.parque_id, re.parque_nombre, re.fecha,
  t.nombre as responsable,
  count(distinct re.wtg) as aeros_inspeccionados
from public.reporte_externo re
join public.tecnicos t on t.id = re.tecnico_id
where re.pais = 'argentina' and re.wtg is not null
group by re.parque_id, re.parque_nombre, re.fecha, t.nombre;

-- Permisos: vista definer (sin security_invoker) → n8n_reader la lee sin
-- tocar RLS ni las tablas base (mismo patrón que resumen_asistencia/0002).
revoke all on public.resumen_diario_aeros_ar from anon, authenticated;
grant select on public.resumen_diario_aeros_ar to n8n_reader;

commit;

-- Verificación (correr aparte):
--   select * from public.resumen_diario_aeros_ar
--     order by fecha desc, parque_nombre, subtipo, responsable
--     limit 20;
