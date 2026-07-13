-- =====================================================================
-- 0019 — Clima (viento + ráfagas) en el check-in. Correr una vez en el SQL
-- Editor. Idempotente.
--
-- Dos cosas:
--   1) Coordenadas lat/lon por parque (para consultar Open-Meteo). Viajan en el
--      cache offline; solo el dato del clima requiere red, no saber dónde está.
--   2) Flag ver_clima por técnico: el feature arranca como PILOTO, visible solo
--      para Tomás Caballero (externo Chile). La RLS de tecnicos ya limita a cada
--      técnico a su propia fila, así que el flag es por-usuario sin tocar policies.
-- =====================================================================

-- 1) Coordenadas por parque (nullable; la policy de lectura pública ya las expone).
alter table public.parques
  add column if not exists lat double precision,
  add column if not exists lon double precision;

-- Coordenadas de los parques de Chile (los que ve Tomás en el piloto). El resto
-- de países queda para el rollout general.
-- TODO: completar lat/lon reales de cada parque.
-- update public.parques set lat = -00.0000, lon = -00.0000 where id = 'cl_el_arrayan';
update public.parques set lat = -28.946336, lon = -71.444322 where id = 'cl_cabo_leones_1_ext';
update public.parques set lat = -28.919019, lon = -71.494744 where id = 'cl_cabo_leones_3_ext';
update public.parques set lat = -28.946808, lon = -71.444256 where id = 'cl_cabo_leones_2';
-- update public.parques set lat = -00.0000, lon = -00.0000 where id = 'cl_tchamma';
-- update public.parques set lat = -00.0000, lon = -00.0000 where id = 'cl_la_estrella';
-- update public.parques set lat = -00.0000, lon = -00.0000 where id = 'cl_calama';
-- update public.parques set lat = -00.0000, lon = -00.0000 where id = 'cl_llanos_del_viento';

-- 2) Flag del piloto por técnico.
alter table public.tecnicos
  add column if not exists ver_clima boolean not null default false;

-- Habilitar el clima para los perfiles del piloto.
update public.tecnicos set ver_clima = true where usuario in ('lucas.alvarez', 'tomas.caballero');
