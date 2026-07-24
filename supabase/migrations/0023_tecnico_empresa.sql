-- =====================================================================
-- 0023 — Técnico acotado a una empresa: `tecnicos.empresa_id`
-- Correr una vez en el SQL Editor. Idempotente. Aplicar ANTES de desplegar
-- el cambio de app (el login pasa a leer `empresa_id`; sin la columna, rompe).
--
-- Cuando un técnico tiene `empresa_id`, el onboarding le muestra SOLO los parques
-- de esa empresa (además del filtro por país/subtipo). null = ve todos (default,
-- comportamiento actual). Se usa para operadores de terceros: Franco Battaglia
-- (externo AR) solo ve los parques de Siemens (Arauco I-II y III-IV).
-- =====================================================================
begin;

alter table public.tecnicos
  add column if not exists empresa_id text references public.empresas(id);

comment on column public.tecnicos.empresa_id is
  'Si está seteado, el técnico solo ve parques de esa empresa (onboarding). '
  'null = ve todos los de su país/subtipo. Ver Onboarding.tsx.';

-- Franco: operador de Siemens en Argentina → solo parques de Siemens.
update public.tecnicos set empresa_id = 'siemens' where usuario = 'franco.battaglia';

commit;

-- Verificación (correr aparte):
--   select usuario, subtipo, pais, empresa_id from public.tecnicos
--     where usuario = 'franco.battaglia';
