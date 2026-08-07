-- =====================================================================
-- 0028 — PE Cabo Leones II + parques chilenos ya construidos (aeros
-- reales cargados) → empresa Siemens Gamesa Chile.
-- Correr una vez en el SQL Editor. Idempotente.
--
-- Cabo Leones II ya tenía sus 49 aeros reales (AE01..AE49, contiguos,
-- cargados en 0010) — coincide con la lista pasada por el usuario, así
-- que solo se renombra y se le asigna la empresa; los aeros no cambian.
--
-- El resto de "parques hechos" en Chile (con numeración real de aeros,
-- no el placeholder 1..N) también pasan a Siemens Gamesa Chile:
--   · cl_cabo_leones_1_ext y cl_cabo_leones_3_ext (aeros reales en 0010).
--   · cl_calama y cl_tchamma ya quedaron en Siemens Gamesa Chile (0026/0027).
-- El Arrayan, La Estrella y Llanos Del Viento siguen con aeros placeholder
-- (1..N genérico, sin numeración real) → quedan sin empresa hasta tener
-- su listado real, ver 0010.
-- =====================================================================
begin;

update public.parques set
  nombre = 'PE Cabo Leones II',
  empresa_id = 'siemens_gamesa_chile'
where id = 'cl_cabo_leones_2';

update public.parques set empresa_id = 'siemens_gamesa_chile'
where id in ('cl_cabo_leones_1_ext', 'cl_cabo_leones_3_ext');

commit;

-- Verificación (correr aparte):
--   select id, nombre, empresa_id, turbinas from public.parques
--     where pais = 'chile' order by orden;
--   -- esperado empresa_id = 'siemens_gamesa_chile' en: cl_cabo_leones_1_ext,
--   -- cl_cabo_leones_3_ext, cl_cabo_leones_2, cl_tchamma, cl_calama.
