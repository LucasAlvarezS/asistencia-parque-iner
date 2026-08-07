-- =====================================================================
-- 0026 — PE Calama (Siemens Gamesa Chile): nombre, turbinas reales,
-- aeros reales (WTG 01..36, contiguos) y operador (Tomás Caballero).
-- Correr una vez en el SQL Editor. Idempotente.
--
-- El parque 'cl_calama' ya existía (0006) con nombre 'Calama' y 22
-- turbinas placeholder (aeros 1..22 genéricos, sin numeración real).
-- Se actualiza a la lista definitiva: 36 aeros, WTG 01..36 contiguos.
--
-- Tomás Caballero (externo Chile) queda acotado a Siemens Gamesa Chile
-- (mismo patrón que Franco Battaglia en Argentina, ver 0023): solo verá
-- los parques de esa empresa en el onboarding.
-- =====================================================================
begin;

-- 1) Parque: nombre 'PE Calama', empresa Siemens Gamesa Chile, 36 turbinas.
update public.parques set
  nombre = 'PE Calama',
  empresa_id = 'siemens_gamesa_chile',
  turbinas = 36
where id = 'cl_calama';

-- 2) Aeros reales (WTG 01..36, contiguos; id '{parque}_{numero}').
delete from public.aeros where parque_id = 'cl_calama';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'cl_calama_' || numero, 'cl_calama', numero,
       'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[
  1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,
  19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36
]) with ordinality as t(numero, orden);

-- 3) Operador: Tomás Caballero acotado a Siemens Gamesa Chile.
update public.tecnicos set empresa_id = 'siemens_gamesa_chile'
where usuario = 'tomas.caballero';

commit;

-- Verificación (correr aparte):
--   select id, nombre, empresa_id, turbinas from public.parques where id = 'cl_calama';
--   select count(*) from public.aeros where parque_id = 'cl_calama';  -- esperado: 36
--   select usuario, empresa_id from public.tecnicos where usuario = 'tomas.caballero';
