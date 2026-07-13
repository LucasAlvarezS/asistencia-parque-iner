-- =====================================================================
-- 0016 — Reinspecciones en los tableros (consolidado externo + resumen interno)
-- Correr una vez en el SQL Editor. Idempotente (create or replace).
--
-- "Reinspeccionada" = turbina con >=2 inspecciones COMPLETAS (visitada y
-- cerrada más de una vez). Se cuenta como métrica INDEPENDIENTE → nunca da
-- negativo. `inspeccionadas` sigue siendo DISTINTA y `pendientes` sigue
-- floored en 0, así que no se rompe nada.
--
-- Columnas nuevas (al final de cada vista):
--   reinspeccionadas int   — cuántas turbinas se reinspeccionaron
--   reinsp_wtg       text   — lista de números de esas turbinas (para marcar)
-- =====================================================================

-- ---------------------------------------------------------------------
-- resumen_asistencia (Consolidado externo) + reinspecciones
-- ---------------------------------------------------------------------
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
reinsp as (   -- turbinas con >=2 inspecciones completas
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
sb as (   -- misma regla (clima 100% / programacion_45 -45) que standby_dia en 0017:
          -- si se cambia acá, actualizar TAMBIÉN 0017 (lógica duplicada a propósito).
  select parque_id, sum(dur_ajustado)::int as horas_standby_min
  from (
    select ec.parque_id, ec.tipo,
           case
             when ec.motivo = 'clima'
               or coalesce(ec.motivo_otro,'') ~* '(viento|lluvia|llovizna|ca[ií]da de agua|niebla|nieve|granizo|poca luz|tormenta|indisponibilidad de la m[aá]quina)'
               then greatest(0, round(extract(epoch from (
                 lead(ec.ts_dispositivo) over w - ec.ts_dispositivo)) / 60.0))::int
             when ec.motivo = 'programacion_45'
               or coalesce(ec.motivo_otro,'') ~* 'programaci[oó]n\s*\+?\s*45'
               then greatest(0, round(extract(epoch from (
                 lead(ec.ts_dispositivo) over w - ec.ts_dispositivo)) / 60.0)::int - 45)
             else 0
           end as dur_ajustado
    from public.eventos_ctx ec
    where ec.subtipo = 'inspector_externo'
    window w as (partition by ec.jornada_id order by ec.ts_dispositivo)
  ) q
  where tipo = 'inicio_standby'
  group by parque_id
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

-- ---------------------------------------------------------------------
-- resumen_interno (Resumen interno) + reinspecciones
-- ---------------------------------------------------------------------
-- OJO: create or replace solo permite AGREGAR columnas al final (no quitar ni
-- reordenar). Por eso esta vista conserva EXACTA la definición de 0014 (incluidas
-- palas e inspeccionadas/pendientes/pct_avance _parque, y el from dias que no
-- pierde los grupos con días de puro standby) y solo suma reinspeccionadas/reinsp_wtg.
create or replace view public.resumen_interno as
with obj as (   -- turbinas objetivo del parque (catálogo)
  select p.id as parque_id, p.nombre as parque_nombre, p.pais,
         coalesce(p.turbinas, count(a.id))::int as turbinas_objetivo
  from public.parques p
  left join public.aeros a on a.parque_id = p.id
  group by p.id, p.nombre, p.pais, p.turbinas
),
vis as (   -- visitas de internos (base de las agregaciones de abajo)
  select v.grupo_clave, v.parque_id, v.maquina_id, v.numero, v.fecha, v.inspeccionado
  from public.visitas_aero v
  join public.tecnicos t on t.id = v.tecnico_id
  where t.subtipo = 'interno'
),
ins as (   -- inspeccionadas por grupo/parque
  select grupo_clave, parque_id,
         count(distinct maquina_id) filter (where inspeccionado) as inspeccionadas
  from vis
  group by grupo_clave, parque_id
),
ins_p as (   -- inspeccionadas por parque (todos los grupos internos juntos)
  select parque_id,
         count(distinct maquina_id) filter (where inspeccionado) as inspeccionadas
  from vis
  group by parque_id
),
reinsp as (   -- turbinas con >=2 inspecciones completas, por equipo/parque
  select grupo_clave, parque_id,
         count(*)                                     as reinspeccionadas,
         string_agg(numero::text, ', ' order by numero) as reinsp_wtg
  from (
    select grupo_clave, parque_id, maquina_id, min(numero) as numero
    from vis
    where inspeccionado
    group by grupo_clave, parque_id, maquina_id
    having count(*) >= 2
  ) q
  group by grupo_clave, parque_id
),
dias as (   -- días sitio/productivos + equipo_id, SOLO internos
  select ec.grupo_clave, ec.parque_id,
         max(ec.equipo_id) as equipo_id,
         count(distinct ec.fecha) as dias_sitio,
         count(distinct ec.fecha) filter (
           where exists (select 1 from vis v
                         where v.grupo_clave = ec.grupo_clave and v.parque_id = ec.parque_id
                           and v.fecha = ec.fecha and v.inspeccionado)) as dias_productivos
  from public.eventos_ctx ec
  where ec.subtipo = 'interno'
  group by ec.grupo_clave, ec.parque_id
)
select
  d.grupo_clave, d.equipo_id, o.pais, o.parque_id, o.parque_nombre,
  o.turbinas_objetivo,
  -- Desempeño por Equipo (por grupo):
  coalesce(i.inspeccionadas, 0)                                     as inspeccionadas,
  greatest(0, o.turbinas_objetivo - coalesce(i.inspeccionadas, 0))  as pendientes,
  round(100.0 * coalesce(i.inspeccionadas, 0)
        / nullif(o.turbinas_objetivo, 0), 2)                        as pct_avance,
  3 * coalesce(i.inspeccionadas, 0)                                 as palas,
  d.dias_sitio,
  d.dias_productivos,
  round(100.0 * d.dias_productivos / nullif(d.dias_sitio, 0), 2)    as pct_productividad,
  round(coalesce(i.inspeccionadas, 0)::numeric
        / nullif(d.dias_productivos, 0), 2)                         as turb_dia,
  -- Resumen Operacional (por parque; repetido en cada fila del parque):
  coalesce(ip.inspeccionadas, 0)                                    as inspeccionadas_parque,
  greatest(0, o.turbinas_objetivo - coalesce(ip.inspeccionadas, 0)) as pendientes_parque,
  round(100.0 * coalesce(ip.inspeccionadas, 0)
        / nullif(o.turbinas_objetivo, 0), 2)                        as pct_avance_parque,
  -- Reinspecciones (0016; columnas nuevas al final):
  coalesce(re.reinspeccionadas, 0)                                  as reinspeccionadas,
  re.reinsp_wtg
from dias d
join obj o        on o.parque_id = d.parque_id
left join ins i   on i.grupo_clave = d.grupo_clave and i.parque_id = d.parque_id
left join ins_p ip on ip.parque_id = d.parque_id
left join reinsp re on re.grupo_clave = d.grupo_clave and re.parque_id = d.parque_id;
