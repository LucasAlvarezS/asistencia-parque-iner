-- =====================================================================
-- 0013 — Aeros reales de Argentina (numeración + orden del template) y alta de
-- parques faltantes. Correr una vez en el SQL Editor, DESPUÉS de 0009 (columna
-- aeros.orden). Idempotente.
--
--   · Parques nuevos: se insertan (22).
--   · Todos los parques del template: se reemplazan sus aeros por los reales
--     (numero real + orden del template; nombre 'WTG NN'; id '{parque}_{numero}').
--   · turbinas del parque = cantidad real del template.
-- El delete de aeros falla si hay eventos apuntando a ellos (limpiar pruebas antes).
-- =====================================================================

begin;

-- 1) Parques nuevos (empresa sin asignar; orden continúa a los existentes).
insert into public.parques (id, nombre, pais, empresa_id, turbinas, activo, orden) values
  ('ar_villalonga', 'PE Villalonga', 'argentina', null, 15, true, 16),
  ('ar_villalonga_ii', 'PE Villalonga II', 'argentina', null, 1, true, 17),
  ('ar_san_jorge', 'PE San Jorge', 'argentina', null, 24, true, 18),
  ('ar_rawson_i_ii', 'PE Rawson I y II', 'argentina', null, 43, true, 19),
  ('ar_rawson_iii', 'PE Rawson III', 'argentina', null, 12, true, 20),
  ('ar_pampa_energia', 'PE Pampa Energía', 'argentina', null, 14, true, 21),
  ('ar_puerto_madryn_i', 'PE Puerto Madryn I', 'argentina', null, 20, true, 22),
  ('ar_puerto_madryn_ii', 'PE Puerto Madryn II', 'argentina', null, 42, true, 23),
  ('ar_necochea', 'PE Necochea', 'argentina', null, 11, true, 24),
  ('ar_manantiales', 'PE Manantiales', 'argentina', null, 15, true, 25),
  ('ar_manantiales_ii', 'PE Manantiales II', 'argentina', null, 15, true, 26),
  ('ar_mataco_iii', 'PE Mataco III', 'argentina', null, 8, true, 27),
  ('ar_llano_i', 'PE Llano I', 'argentina', null, 14, true, 28),
  ('ar_llano_ii', 'PE Llano II', 'argentina', null, 17, true, 29),
  ('ar_llano_iii', 'PE Llano III', 'argentina', null, 14, true, 30),
  ('ar_la_banderita', 'PE La Banderita', 'argentina', null, 11, true, 31),
  ('ar_garayalde', 'PE Garayalde', 'argentina', null, 7, true, 32),
  ('ar_corti', 'PE Corti', 'argentina', null, 29, true, 33),
  ('ar_el_mataco', 'PE El Mataco', 'argentina', null, 27, true, 34),
  ('ar_chubut_norte', 'PE Chubut Norte', 'argentina', null, 8, true, 35),
  ('ar_bicentenario', 'PE Bicentenario', 'argentina', null, 28, true, 36),
  ('ar_bicentenario_ii', 'PE Bicentenario II', 'argentina', null, 7, true, 37)
on conflict (id) do update set
  nombre = excluded.nombre, pais = excluded.pais, turbinas = excluded.turbinas,
  activo = excluded.activo, orden = excluded.orden;

-- 2) turbinas reales en los parques existentes (por si difería del valor viejo).
update public.parques set turbinas = 15 where id = 'ar_manque';
update public.parques set turbinas = 6 where id = 'ar_los_olivos';
update public.parques set turbinas = 24 where id = 'ar_buenaventura';
update public.parques set turbinas = 21 where id = 'ar_genoveva_1';
update public.parques set turbinas = 11 where id = 'ar_genoveva_2';
update public.parques set turbinas = 4 where id = 'ar_la_castellana';
update public.parques set turbinas = 25 where id = 'ar_san_luis';
update public.parques set turbinas = 21 where id = 'ar_la_rinconada';
update public.parques set turbinas = 11 where id = 'ar_vivorata';
update public.parques set turbinas = 22 where id = 'ar_olavarria';
update public.parques set turbinas = 31 where id = 'ar_pepe_vi';
update public.parques set turbinas = 18 where id = 'ar_de_la_bahia';
update public.parques set turbinas = 25 where id = 'ar_general_levalle';
update public.parques set turbinas = 36 where id = 'ar_la_elbita';
update public.parques set turbinas = 18 where id = 'ar_llano_iv';

-- 3) Aeros reales por parque (borra 1..N e inserta los del template).
delete from public.aeros where parque_id = 'ar_manque';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_manque_' || numero, 'ar_manque', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[16,17,19,20,21,22,23,24,25,26,27,28,30,31,32]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_los_olivos';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_los_olivos_' || numero, 'ar_los_olivos', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[18,29,33,34,35,36]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_buenaventura';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_buenaventura_' || numero, 'ar_buenaventura', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_genoveva_1';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_genoveva_1_' || numero, 'ar_genoveva_1', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_genoveva_2';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_genoveva_2_' || numero, 'ar_genoveva_2', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_la_castellana';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_la_castellana_' || numero, 'ar_la_castellana', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_san_luis';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_san_luis_' || numero, 'ar_san_luis', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_la_rinconada';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_la_rinconada_' || numero, 'ar_la_rinconada', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_vivorata';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_vivorata_' || numero, 'ar_vivorata', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_olavarria';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_olavarria_' || numero, 'ar_olavarria', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_pepe_vi';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_pepe_vi_' || numero, 'ar_pepe_vi', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_de_la_bahia';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_de_la_bahia_' || numero, 'ar_de_la_bahia', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_general_levalle';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_general_levalle_' || numero, 'ar_general_levalle', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_la_elbita';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_la_elbita_' || numero, 'ar_la_elbita', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_llano_iv';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_llano_iv_' || numero, 'ar_llano_iv', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[44,45,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_villalonga';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_villalonga_' || numero, 'ar_villalonga', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_villalonga_ii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_villalonga_ii_' || numero, 'ar_villalonga_ii', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[16]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_san_jorge';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_san_jorge_' || numero, 'ar_san_jorge', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_rawson_i_ii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_rawson_i_ii_' || numero, 'ar_rawson_i_ii', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_rawson_iii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_rawson_iii_' || numero, 'ar_rawson_iii', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[44,45,46,47,48,49,50,51,52,53,54,55]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_pampa_energia';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_pampa_energia_' || numero, 'ar_pampa_energia', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_puerto_madryn_i';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_puerto_madryn_i_' || numero, 'ar_puerto_madryn_i', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,9,10,11,12,16,17,18,19,22,23,24,25,28,29]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_puerto_madryn_ii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_puerto_madryn_ii_' || numero, 'ar_puerto_madryn_ii', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_necochea';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_necochea_' || numero, 'ar_necochea', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_manantiales';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_manantiales_' || numero, 'ar_manantiales', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_manantiales_ii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_manantiales_ii_' || numero, 'ar_manantiales_ii', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[18,19,20,21,22,23,24,25,26,27,28,29,30,31,32]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_mataco_iii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_mataco_iii_' || numero, 'ar_mataco_iii', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[28,29,30,31,32,33,34,35]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_llano_i';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_llano_i_' || numero, 'ar_llano_i', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_llano_ii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_llano_ii_' || numero, 'ar_llano_ii', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_llano_iii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_llano_iii_' || numero, 'ar_llano_iii', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[34,35,36,37,38,39,40,41,42,43,46,47,48,49]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_la_banderita';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_la_banderita_' || numero, 'ar_la_banderita', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_garayalde';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_garayalde_' || numero, 'ar_garayalde', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_corti';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_corti_' || numero, 'ar_corti', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_el_mataco';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_el_mataco_' || numero, 'ar_el_mataco', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_chubut_norte';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_chubut_norte_' || numero, 'ar_chubut_norte', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_bicentenario';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_bicentenario_' || numero, 'ar_bicentenario', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28]::int[]) with ordinality as t(numero, orden);
delete from public.aeros where parque_id = 'ar_bicentenario_ii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_bicentenario_ii_' || numero, 'ar_bicentenario_ii', numero, 'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[29,30,31,32,33,34,35]::int[]) with ordinality as t(numero, orden);

commit;
