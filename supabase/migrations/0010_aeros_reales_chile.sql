-- =====================================================================
-- 0010 — Aeros reales de Chile (numeración + orden + etiqueta del template).
-- Correr una vez en el SQL Editor, DESPUÉS de 0009 (usa la columna aeros.orden).
-- Idempotente.
--
-- Reemplaza los aeros 1..N generados por los reales de cada parque:
--   · numero = número real de la turbina
--   · orden  = posición en el template (with ordinality) → orden del selector
--   · nombre = 'WTG NN' (etiqueta unificada; el template trae AE/AE-/WTG- pero
--              se muestra como WTG en la app y los reportes)
--   · id     = '{parque}_{numero}'
-- El delete es seguro: no hay eventos apuntando a estos aeros (los movimientos
-- de prueba ya se borraron; la FK eventos.maquina_id no cascadea, así que borrar
-- un aero con eventos fallaría y avisaría).
--
-- Por ahora solo estos 3 parques; el resto de Chile sigue con 1..N hasta tener
-- su template. Los conteos coinciden con parques.turbinas (49 / 22 / 12).
-- =====================================================================

begin;

-- Cabo Leones II — 49 aeros, AE01..AE49 (contiguos).
delete from public.aeros where parque_id = 'cl_cabo_leones_2';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'cl_cabo_leones_2_' || numero, 'cl_cabo_leones_2', numero,
       'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[
  1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,
  26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49
]) with ordinality as t(numero, orden);

-- Cabo Leones III Ext — 22 aeros, AE-12..AE-23 + AE-35..AE-44.
delete from public.aeros where parque_id = 'cl_cabo_leones_3_ext';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'cl_cabo_leones_3_ext_' || numero, 'cl_cabo_leones_3_ext', numero,
       'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[
  12,13,14,15,16,17,18,19,20,21,22,23,35,36,37,38,39,40,41,42,43,44
]) with ordinality as t(numero, orden);

-- Cabo Leones I Ext — 12 aeros, WTG-52..WTG-58 + WTG-64..WTG-68.
delete from public.aeros where parque_id = 'cl_cabo_leones_1_ext';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'cl_cabo_leones_1_ext_' || numero, 'cl_cabo_leones_1_ext', numero,
       'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[
  52,53,54,55,56,57,58,64,65,66,67,68
]) with ordinality as t(numero, orden);

commit;

-- Verificación (opcional):
--   select p.nombre, p.turbinas,
--          (select count(*) from public.aeros a where a.parque_id = p.id) as aeros,
--          (select array_agg(a.nombre order by a.orden) from public.aeros a where a.parque_id = p.id) as etiquetas
--   from public.parques p
--   where p.id in ('cl_cabo_leones_2','cl_cabo_leones_3_ext','cl_cabo_leones_1_ext')
--   order by p.orden;
