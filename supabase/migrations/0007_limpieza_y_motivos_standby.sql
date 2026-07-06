-- =====================================================================
-- 0007 — Limpieza de movimientos de prueba + nuevo set de motivos de
-- stand-by (Clima con sub-lista) + país de técnicos de Chile.
-- Correr una vez en el SQL Editor de Supabase.
--
--   1) Borra TODOS los movimientos de prueba (eventos, jornadas,
--      asignaciones). Conserva el catálogo (paises, empresas, parques,
--      aeros, equipos) y los técnicos. No toca el bucket de fotos.
--   2) Reemplaza el CHECK de eventos.motivo por el set nuevo. Clima abre
--      una sub-lista en la app (viento, lluvia, niebla, nieve, granizo,
--      poca luz) que se guarda como etiqueta en eventos.motivo_otro
--      (motivo queda 'clima'). Se mantiene 'otros' con texto libre.
--   3) Marca a los técnicos de Chile como externos (Chile no tiene interna)
--      y con pais='chile', para que el onboarding les muestre solo los
--      parques de Chile.
-- =====================================================================

begin;

-- 1) Limpieza de movimientos (orden de FK; asignaciones cascadea a jornadas
--    y estas a eventos, pero se borran los tres explícitos por claridad).
delete from public.eventos;
delete from public.jornadas;
delete from public.asignaciones;

-- 2) Nuevo enum de motivo. Se hace después de la limpieza para que ninguna
--    fila con un motivo viejo ('documentacion'/'programacion_tecnica') viole
--    el CHECK nuevo.
alter table public.eventos drop constraint if exists eventos_motivo_check;
alter table public.eventos add constraint eventos_motivo_check
  check (motivo in (
    'clima','induccion','programacion_45','termino_parque',
    'dia_standby','hora_maquina','otros'
  ));

-- 3) Técnicos de Chile: externos (Chile no tiene interna) y pais='chile'.
--    tecnicos.usuario se guarda en minúsculas, por eso el match con lower().
update public.tecnicos set pais = 'chile', subtipo = 'inspector_externo'
where lower(usuario) in (
  'tomas.caballero',
  'nicolas.caballero',
  'lucas.alvarez',
  'matias.ramos',
  'matias.jofre'
);

commit;

-- Verificación (opcional):
--   select count(*) from public.eventos;       -- 0
--   select count(*) from public.jornadas;       -- 0
--   select count(*) from public.asignaciones;   -- 0
--   select count(*) from public.parques;        -- catálogo intacto
--   select usuario, nombre, pais, subtipo from public.tecnicos order by pais, usuario;
