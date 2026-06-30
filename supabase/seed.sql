-- =====================================================================
-- INER Check-in — Seed
-- Países (+TZ) · empresas (6, Chile) · parques (22: 7 CL + 15 AR) ·
-- aeros generados desde parques.turbinas. Equipos AR interna (X-C, F-K).
-- Idempotente (on conflict do update). PE/UY sin parques aún (intencional).
-- =====================================================================

-- Países + zona horaria (TZ_POR_PAIS).
insert into public.paises (id, nombre, tz) values
  ('argentina', 'Argentina', 'America/Argentina/Buenos_Aires'),
  ('chile',     'Chile',     'America/Santiago'),
  ('peru',      'Perú',      'America/Lima'),
  ('uruguay',   'Uruguay',   'America/Montevideo')
on conflict (id) do update set nombre = excluded.nombre, tz = excluded.tz;

-- Empresas (operadores) — solo Chile.
insert into public.empresas (id, nombre, pais) values
  ('enel_green_power',     'ENEL Green Power Chile', 'chile'),
  ('engie_chile',          'Engie Chile',            'chile'),
  ('ibereolica_chile',     'Ibereólica Chile',       'chile'),
  ('innergex_chile',       'Innergex Chile',         'chile'),
  ('nordex_chile',         'Nordex Chile',           'chile'),
  ('siemens_gamesa_chile', 'Siemens Gamesa Chile',   'chile')
on conflict (id) do update set nombre = excluded.nombre, pais = excluded.pais;

-- Parques. Chile (7) con empresa_id; Argentina (15) sin empresa.
insert into public.parques (id, nombre, pais, empresa_id, turbinas, activo, orden) values
  -- Chile
  ('cl_los_buenos_aires', 'PE Los Buenos Aires',       'chile', 'enel_green_power',     12, true, 1),
  ('cl_monte_redondo',    'PE Monte Redondo',          'chile', 'engie_chile',          24, true, 2),
  ('cl_atacama',          'PE Atacama',                'chile', 'ibereolica_chile',     29, true, 3),
  ('cl_cuel',             'CUEL',                      'chile', 'innergex_chile',       22, true, 4),
  ('cl_sarco',            'SARCO',                     'chile', 'innergex_chile',       50, true, 5),
  ('cl_puelche_sur',      'Parque Eólico Puelche Sur', 'chile', 'nordex_chile',         32, true, 6),
  ('cl_el_arrayan',       'PE EL Arrayan',             'chile', 'siemens_gamesa_chile', 51, true, 7),
  -- Argentina
  ('ar_buenaventura',     'PE Buenaventura',           'argentina', null, 48, true, 1),
  ('ar_de_la_bahia',      'PE DE LA BAHIA',            'argentina', null, 18, true, 2),
  ('ar_general_levalle',  'PE GENERAL LEVALLE',        'argentina', null, 25, true, 3),
  ('ar_genoveva_1',       'PE Genoveva1',              'argentina', null, 21, true, 4),
  ('ar_genoveva_2',       'PE Genoveva2',              'argentina', null, 11, true, 5),
  ('ar_la_castellana',    'PE La Castellana',          'argentina', null,  4, true, 6),
  ('ar_la_elbita',        'PE LA ELBITA',              'argentina', null, 36, true, 7),
  ('ar_la_rinconada',     'PE La Rinconada',           'argentina', null, 21, true, 8),
  ('ar_llano_iv',         'PE LLANO IV',               'argentina', null, 18, true, 9),
  ('ar_los_olivos',       'PE Los Olivos',             'argentina', null,  6, true, 10),
  ('ar_manque',           'PE MANQUE',                 'argentina', null, 15, true, 11),
  ('ar_olavarria',        'PE OLAVARRIA',              'argentina', null, 22, true, 12),
  ('ar_pepe_vi',          'PE PEPE VI',                'argentina', null, 31, true, 13),
  ('ar_san_luis',         'PE San Luis',               'argentina', null, 50, true, 14),
  ('ar_vivorata',         'PE VIVORATA',               'argentina', null, 11, true, 15)
on conflict (id) do update set
  nombre = excluded.nombre, pais = excluded.pais,
  empresa_id = excluded.empresa_id, turbinas = excluded.turbinas,
  activo = excluded.activo, orden = excluded.orden;

-- Aeros: se generan 1..turbinas por parque (id '{parque}_{n}', nombre 'WTG NN').
-- Reemplazar luego por el inventario real si los aeros tienen nombres propios.
insert into public.aeros (id, parque_id, numero, nombre)
select p.id || '_' || g, p.id, g, 'WTG ' || lpad(g::text, 2, '0')
from public.parques p
cross join lateral generate_series(1, coalesce(p.turbinas, 0)) as g
on conflict (id) do update set
  parque_id = excluded.parque_id, numero = excluded.numero, nombre = excluded.nombre;

-- Equipos de inspección interna (Argentina).
insert into public.equipos (id, nombre, pais) values
  ('ar_x_c',     'Equipo X-C',  'argentina'),
  ('ar_f_k',     'Equipo F-K',  'argentina')
on conflict (id) do update set nombre = excluded.nombre, pais = excluded.pais;
