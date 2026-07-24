-- =====================================================================
-- 0022 — Parques Siemens (Argentina) + foto de evidencia por parque
-- Correr una vez en el SQL Editor. Idempotente. Aplicar ANTES de desplegar
-- el cambio de app que lee `foto_evidencia` (mismo criterio que 0020/palas:
-- la columna debe existir en prod antes de que la app la referencie).
--
--   1) Flag `parques.foto_evidencia`: fuerza STOP/RUN con foto aunque el parque
--      sea de Argentina (donde el externo, por país, registra sin foto). Es el
--      mecanismo para replicar lo de Tomás (externo Chile) acotado por parque.
--   2) Empresa Siemens (Argentina) + 2 parques (Arauco I-II y III-IV) con sus
--      aeros reales (numeración NO contigua) y la foto prendida.
-- =====================================================================
begin;

-- 1) Flag por parque (default false = comportamiento actual del resto).
alter table public.parques
  add column if not exists foto_evidencia boolean not null default false;

comment on column public.parques.foto_evidencia is
  'Fuerza foto de evidencia en STOP/RUN del externo, sin importar el país '
  '(usaFotoEvidencia). Prendido en parques de terceros (ej. Siemens).';

-- 2) Empresa (operador) Siemens en Argentina (hasta ahora empresas solo Chile).
insert into public.empresas (id, nombre, pais) values
  ('siemens', 'Siemens', 'argentina')
on conflict (id) do update set nombre = excluded.nombre, pais = excluded.pais;

-- 3) Parques Siemens. permite_interno/externo quedan en su default (solo externo);
--    foto_evidencia = true.
insert into public.parques
  (id, nombre, pais, empresa_id, turbinas, activo, orden, foto_evidencia) values
  ('ar_arauco_i_ii',  'PE Arauco I y II',   'argentina', 'siemens', 38, true, 38, true),
  ('ar_arauco_iii_iv','PE Arauco III y IV', 'argentina', 'siemens', 19, true, 39, true)
on conflict (id) do update set
  nombre = excluded.nombre, pais = excluded.pais, empresa_id = excluded.empresa_id,
  turbinas = excluded.turbinas, activo = excluded.activo, orden = excluded.orden,
  foto_evidencia = excluded.foto_evidencia;

-- 4) Aeros reales (numero + orden del listado; nombre 'WTG NN'; id '{parque}_{numero}').
delete from public.aeros where parque_id = 'ar_arauco_i_ii';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_arauco_i_ii_' || numero, 'ar_arauco_i_ii', numero,
       'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[
  51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,
  77,88,89,90,91,92,96,97,98,99,100,101,102
]::int[]) with ordinality as t(numero, orden);

delete from public.aeros where parque_id = 'ar_arauco_iii_iv';
insert into public.aeros (id, parque_id, numero, nombre, orden)
select 'ar_arauco_iii_iv_' || numero, 'ar_arauco_iii_iv', numero,
       'WTG ' || lpad(numero::text, 2, '0'), orden
from unnest(array[
  103,112,113,114,115,116,117,124,125,126,131,132,133,134,135,136,142,152,153
]::int[]) with ordinality as t(numero, orden);

commit;

-- Verificación (correr aparte):
--   select id, nombre, empresa_id, turbinas, foto_evidencia, permite_externo
--     from public.parques where empresa_id = 'siemens' order by orden;
--   select parque_id, count(*) from public.aeros
--     where parque_id in ('ar_arauco_i_ii','ar_arauco_iii_iv') group by 1;  -- 38 y 19
