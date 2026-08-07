-- =====================================================================
-- 0027 — PE Tchamma (Siemens Gamesa Chile): nombre, empresa y aeros
-- reales (numeración NO contigua, etiqueta WTG unificada).
-- Correr una vez en el SQL Editor. Idempotente.
--
-- El parque 'cl_tchamma' ya existía (0006) con nombre 'Tchamma' y 35
-- turbinas placeholder (aeros 1..35 genéricos, sin numeración real).
-- Se actualiza a la lista definitiva de 35 turbinas (código real TC,
-- numeración no contigua: 1-7, 10-18, 20-21, 24-31, 33-35, 37-42).
-- El código TC## trae el número real de la turbina; se muestra como
-- 'WTG NN' (mismo criterio que el resto de los parques).
-- =====================================================================
begin;

-- 1) Parque: nombre 'PE Tchamma', empresa Siemens Gamesa Chile (turbinas ya en 35).
update public.parques set
  nombre = 'PE Tchamma',
  empresa_id = 'siemens_gamesa_chile',
  turbinas = 35
where id = 'cl_tchamma';

-- 2) Aeros reales (numero = código TC##; nombre 'WTG NN'; id '{parque}_{numero}').
delete from public.aeros where parque_id = 'cl_tchamma';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'cl_tchamma_' || numero, 'cl_tchamma', numero,
       'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[
  1,2,3,4,5,6,7,10,11,12,13,14,15,16,17,18,20,21,
  24,25,26,27,28,29,30,31,33,34,35,37,38,39,40,41,42
]) with ordinality as t(numero, orden);

commit;

-- Verificación (correr aparte):
--   select id, nombre, empresa_id, turbinas from public.parques where id = 'cl_tchamma';
--   select count(*) from public.aeros where parque_id = 'cl_tchamma';  -- esperado: 35
