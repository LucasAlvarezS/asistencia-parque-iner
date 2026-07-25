-- =====================================================================
-- 0024 — Empresas de Argentina: ids definitivos + Vestas
-- Correr una vez en el SQL Editor. Idempotente.
--
-- n8n rutea por `empresa_id`, así que el id importa. Se espeja el patrón de
-- 'siemens_gamesa_chile':
--   · 'siemens' (0022)              → 'siemens_gamesa_argentina'
--   · 'vestas'  (id plano, si existe) → 'vestas_argentina'
-- Se reapuntan las FKs (parques.empresa_id, tecnicos.empresa_id → Franco) a los
-- ids definitivos y se borran los ids viejos (evita el duplicado vestas/vestas_argentina).
-- Todos los parques argentinos SIN empresa pasan a Vestas. Filtrar por
-- pais='argentina' (NO por prefijo id): 'ar_punta_lomitas' es de Perú.
--
-- No toca vistas ni foto_evidencia (Vestas registra sin foto; Arauco/Siemens la
-- tiene prendida, ver 0022). Nombre visible: 'SIEMENS AR' / 'VESTAS AR'.
-- =====================================================================
begin;

-- 1) Empresas con ids definitivos (patrón <fabricante>_<pais>).
insert into public.empresas (id, nombre, pais) values
  ('siemens_gamesa_argentina', 'SIEMENS AR', 'argentina'),
  ('vestas_argentina',         'VESTAS AR',  'argentina')
on conflict (id) do update set nombre = excluded.nombre, pais = excluded.pais;

-- 2) Reapuntar FKs de los ids viejos a los definitivos (Franco incluido).
update public.parques  set empresa_id = 'siemens_gamesa_argentina' where empresa_id = 'siemens';
update public.tecnicos set empresa_id = 'siemens_gamesa_argentina' where empresa_id = 'siemens';
update public.parques  set empresa_id = 'vestas_argentina'         where empresa_id = 'vestas';
update public.tecnicos set empresa_id = 'vestas_argentina'         where empresa_id = 'vestas';

-- 3) Parques argentinos sin empresa → Vestas (deja Arauco en Siemens).
update public.parques set empresa_id = 'vestas_argentina'
  where pais = 'argentina' and empresa_id is null;

-- 4) Borrar los ids viejos (ya sin referencias) → sin duplicados.
delete from public.empresas where id in ('siemens', 'vestas');

commit;

-- Verificación (correr aparte):
--   select id, nombre, pais from public.empresas where pais='argentina';
--   -- esperado SOLO: siemens_gamesa_argentina (SIEMENS AR), vestas_argentina (VESTAS AR).
--   select empresa_id, count(*) from public.parques where pais='argentina' group by empresa_id;
--   -- esperado: siemens_gamesa_argentina → 2 (Arauco); vestas_argentina → el resto.
--   select usuario, empresa_id from public.tecnicos where usuario='franco.battaglia';
--   -- esperado: siemens_gamesa_argentina.
