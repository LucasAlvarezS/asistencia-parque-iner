-- =====================================================================
-- 0009 — Columna `orden` en aeros + reclasificación de Punta Lomitas a Perú.
-- Correr una vez en el SQL Editor de Supabase. Idempotente.
--
--   1) `aeros.orden`: define el orden de aparición en el selector de turbina
--      (el recorrido del template, que NO siempre coincide con el orden
--      numérico). Se backfillea con el número para los parques ya cargados, así
--      el resto de los países sigue mostrándose por número mientras no tengan
--      template propio.
--   2) Punta Lomitas es un parque de PERÚ (Ica); estaba mal clasificado como
--      Argentina. Se corrige `pais`. Se conserva el id `ar_punta_lomitas`
--      (renombrarlo implicaría recrear parque + 57 aeros por la FK sin
--      on update cascade).
--
-- Los números/orden reales de los parques de Chile se cargan aparte (0010),
-- cuando estén los templates.
-- =====================================================================

begin;

-- 1) Orden de recorrido (nullable) + backfill = numero.
alter table public.aeros add column if not exists orden int;
update public.aeros set orden = numero where orden is null;

-- 2) Punta Lomitas → Perú.
update public.parques set pais = 'peru' where id = 'ar_punta_lomitas';

commit;

-- Verificación (opcional):
--   select pais from public.parques where id = 'ar_punta_lomitas';   -- peru
--   select count(*) from public.aeros where orden is null;           -- 0
