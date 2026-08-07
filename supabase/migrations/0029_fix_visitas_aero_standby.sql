-- =====================================================================
-- 0029 — Fix visitas_aero: un standby (u otro evento) intercalado entre
-- entrada_wtg y su salida_wtg rompía la detección de cierre.
-- Correr una vez en el SQL Editor. Idempotente (create or replace).
--
-- Bug: la CTE `x` de visitas_aero (0021) aplicaba lead()/lag() sobre TODOS
-- los eventos de la jornada, sin filtrar tipo. Si el técnico tomaba un
-- standby con la turbina abierta (entrada_wtg → inicio_standby → fin_standby
-- → salida_wtg), el "next_tipo" que veía la ventana era 'inicio_standby'
-- (no un cierre) → esa visita quedaba con inspeccionado=false aunque el
-- salida_wtg real estuviera en la base. Caso real: Javier Sicoli, PE
-- Buenaventura, WTG 12 y 13, 30/07/2026.
--
-- Fix: acotar la ventana a los tipos que forman la cadena de la visita
-- (mismo criterio que reporte_externo, 0002/0003), ignorando standby,
-- clima, comentarios sueltos, etc. No cambia columnas de salida (create or
-- replace sigue siendo válido).
-- =====================================================================
begin;

create or replace view public.visitas_aero as
with x as (
  select ec.*, e.palas,
         lead(ec.tipo)           over w as next_tipo,
         lead(ec.ts_dispositivo) over w as next_ts,
         lead(e.palas)           over w as next_palas
  from public.eventos_ctx ec
  join public.eventos e on e.id = ec.id
  where ec.tipo in ('entrada_parque','traslado_maquina','entrada_wtg',
                     'salida_wtg','salida_parque','finalizar_parque')
  window w as (partition by ec.jornada_id order by ec.ts_dispositivo)
)
select x.grupo_clave, x.pais, x.parque_id, x.parque_nombre, x.fecha, x.tecnico_id,
       x.maquina_id, a.numero, a.nombre,
       x.ts_dispositivo as ingreso,
       case when x.next_tipo in ('salida_wtg','salida_parque','finalizar_parque')
            then x.next_ts end as salida,
       (x.next_tipo in ('salida_wtg','salida_parque','finalizar_parque')) as inspeccionado,
       case
         when x.next_tipo = 'salida_wtg' and x.next_palas is not null
           then array(select jsonb_array_elements_text(x.next_palas))
         when x.next_tipo in ('salida_wtg','salida_parque','finalizar_parque')
           then array['A-TEC','A-LEC','B-TEC','B-LEC','C-TEC','C-LEC']
         else array[]::text[]
       end as cavidades
from x
left join public.aeros a on a.id = x.maquina_id
where x.tipo = 'entrada_wtg';

commit;

-- Verificación (correr aparte):
--   select numero, ingreso, salida, inspeccionado, cavidades
--     from public.visitas_aero
--     where parque_id = 'ar_buenaventura'
--       and tecnico_id = (select id from public.tecnicos where usuario = 'javier.sicoli')
--       and fecha >= '2026-07-01' and fecha < '2026-08-01'
--     order by numero, ingreso;
--   -- esperado: WTG 12 y 13 ahora con inspeccionado = true.
