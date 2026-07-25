-- =====================================================================
-- 0025 — Stand-by como período inicio→fin + minutos persistidos por jornada
-- Correr una vez en el SQL Editor. Idempotente.
--
-- Antes: `inicio_standby` era una marca; la duración se derivaba por lead() y
-- solo contaba clima/programacion_45. Ahora el stand-by es un período explícito
-- `inicio_standby → fin_standby` (o hasta la salida si se retira en stand-by), y
-- se cuenta TODO el período sin filtrar por motivo, con un TOPE de 480 min (8h)
-- por jornada: un día completo de clima no cuenta más que una jornada laboral.
--
--   1) jornadas.standby_min: minutos de stand-by del día, PERSISTIDOS.
--   2) Trigger sobre eventos que recalcula ese total automáticamente (insert/
--      update/delete), sumando cada inicio_standby → evento siguiente.
--   3) standby_dia y resumen_asistencia pasan a leer jornadas.standby_min
--      (una sola fuente de verdad; se elimina la regla de motivo duplicada).
-- =====================================================================
begin;

-- 1) Columna persistida.
alter table public.jornadas
  add column if not exists standby_min int not null default 0;

comment on column public.jornadas.standby_min is
  'Minutos de stand-by del día (suma de cada inicio_standby → evento siguiente), '
  'topado a 480 (8h). Lo mantiene el trigger recompute_standby_min. Sin filtro de motivo.';

-- 2) Trigger: recalcula standby_min de la jornada afectada.
create or replace function public.recompute_standby_min() returns trigger
language plpgsql as $$
declare
  jid text := coalesce(new.jornada_id, old.jornada_id);
begin
  update public.jornadas j
     set standby_min = least(coalesce((
           select sum(greatest(0, round(extract(epoch from (s.nxt - s.ts)) / 60.0))::int)
           from (
             select e.ts_dispositivo as ts,
                    lead(e.ts_dispositivo) over (order by e.ts_dispositivo) as nxt,
                    e.tipo
             from public.eventos e
             where e.jornada_id = jid and e.anulado = false
           ) s
           where s.tipo = 'inicio_standby'
         ), 0), 480),  -- tope 8h/día (480 min)
         updated_at = now()
   where j.id = jid;
  return null;
end;
$$;

drop trigger if exists eventos_standby on public.eventos;
create trigger eventos_standby
  after insert or update or delete on public.eventos
  for each row execute function public.recompute_standby_min();

-- 3) Backfill de las jornadas existentes.
update public.jornadas j
   set standby_min = least(coalesce((
     select sum(greatest(0, round(extract(epoch from (s.nxt - s.ts)) / 60.0))::int)
     from (
       select e.ts_dispositivo as ts,
              lead(e.ts_dispositivo) over (order by e.ts_dispositivo) as nxt,
              e.tipo
       from public.eventos e
       where e.jornada_id = j.id and e.anulado = false
     ) s
     where s.tipo = 'inicio_standby'
   ), 0), 480);

-- 4) standby_dia: minutos por (grupo_clave, parque, fecha) leídos de jornadas.
--    grupo_clave espeja eventos_ctx (AR interna = equipo; resto = técnico).
create or replace view public.standby_dia as
select
  case when t.subtipo = 'interno' and p.pais = 'argentina' and t.equipo_id is not null
       then 'equipo:'  || t.equipo_id
       else 'tecnico:' || j.tecnico_id::text end as grupo_clave,
  p.pais, j.parque_id, p.nombre as parque_nombre, j.fecha,
  max(t.subtipo)   as subtipo,
  max(t.equipo_id) as equipo_id,
  coalesce(sum(j.standby_min), 0)::int as standby_min,
  lpad((coalesce(sum(j.standby_min), 0) / 60)::text, 2, '0') || ':' ||
  lpad((coalesce(sum(j.standby_min), 0) % 60)::text, 2, '0') as standby_hhmm
from public.jornadas j
join public.tecnicos t on t.id = j.tecnico_id
join public.parques  p on p.id = j.parque_id
group by 1, p.pais, j.parque_id, p.nombre, j.fecha;

revoke all on public.standby_dia from anon, authenticated;
grant select on public.standby_dia to n8n_reader;

-- 5) resumen_asistencia: idéntica a 0016, pero el CTE `sb` lee jornadas.standby_min
--    (todo el período, externos). Se conservan columnas y orden (create or replace).
create or replace view public.resumen_asistencia as
with obj as (
  select p.id as parque_id, p.nombre as parque, p.pais,
         coalesce(p.turbinas, count(a.id))::int as turbinas_objetivo
  from public.parques p
  left join public.aeros a on a.parque_id = p.id
  group by p.id, p.nombre, p.pais, p.turbinas
),
ext as (
  select ec.parque_id,
         count(distinct ec.fecha) filter (where ec.tipo = 'entrada_wtg') as dias_trabajados,
         min(ec.fecha) as fecha_inicio,
         max(ec.fecha) as fecha_termino
  from public.eventos_ctx ec
  where ec.subtipo = 'inspector_externo'
  group by ec.parque_id
),
insp as (
  select v.parque_id,
         count(distinct v.maquina_id) filter (where v.inspeccionado) as inspeccionadas
  from public.visitas_aero v
  join public.tecnicos t on t.id = v.tecnico_id
  where t.subtipo = 'inspector_externo'
  group by v.parque_id
),
reinsp as (
  select parque_id,
         count(*)                                     as reinspeccionadas,
         string_agg(numero::text, ', ' order by numero) as reinsp_wtg
  from (
    select v.parque_id, v.maquina_id, min(v.numero) as numero
    from public.visitas_aero v
    join public.tecnicos t on t.id = v.tecnico_id
    where t.subtipo = 'inspector_externo' and v.inspeccionado
    group by v.parque_id, v.maquina_id
    having count(*) >= 2
  ) q
  group by parque_id
),
resp as (
  select distinct on (parque_id) parque_id, tecnico_id
  from (
    select ec.parque_id, ec.tecnico_id,
           count(distinct ec.fecha) filter (where ec.tipo = 'entrada_wtg') as d
    from public.eventos_ctx ec
    where ec.subtipo = 'inspector_externo'
    group by ec.parque_id, ec.tecnico_id
  ) q
  order by parque_id, d desc, tecnico_id
),
sb as (   -- 0025: stand-by persistido (todo el período inicio→fin, sin motivo).
  select j.parque_id, sum(j.standby_min)::int as horas_standby_min
  from public.jornadas j
  join public.tecnicos t on t.id = j.tecnico_id
  where t.subtipo = 'inspector_externo'
  group by j.parque_id
)
select
  o.pais, o.parque_id, o.parque,
  tr.nombre as responsable,
  o.turbinas_objetivo,
  coalesce(i.inspeccionadas, 0)                                             as inspeccionadas,
  greatest(0, o.turbinas_objetivo - coalesce(i.inspeccionadas, 0))          as pendientes,
  round(100.0 * coalesce(i.inspeccionadas, 0) / nullif(o.turbinas_objetivo, 0), 2) as pct_avance,
  coalesce(s.horas_standby_min, 0)                                          as horas_standby_min,
  e.dias_trabajados,
  round(coalesce(i.inspeccionadas, 0)::numeric / nullif(e.dias_trabajados, 0), 2) as prom_diario,
  e.fecha_inicio, e.fecha_termino,
  coalesce(re.reinspeccionadas, 0)                                          as reinspeccionadas,
  re.reinsp_wtg
from ext e
join obj  o  on o.parque_id = e.parque_id
left join insp   i on i.parque_id  = e.parque_id
left join reinsp re on re.parque_id = e.parque_id
left join resp   r on r.parque_id  = e.parque_id
left join public.tecnicos tr on tr.id = r.tecnico_id
left join sb     s on s.parque_id  = e.parque_id;

grant select on public.resumen_asistencia to n8n_reader;

commit;

-- Verificación (correr aparte):
--   select id, fecha, parque_id, standby_min from public.jornadas where standby_min > 0 order by fecha;
--   select parque, horas_standby_min from public.resumen_asistencia where horas_standby_min > 0;
