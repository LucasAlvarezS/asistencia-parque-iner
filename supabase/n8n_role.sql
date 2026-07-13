-- =====================================================================
-- Rol de solo lectura para n8n (downstream). Solo ve las VISTAS de reporte,
-- nunca las tablas base. Correr en el SQL Editor de Supabase.
-- La PRIMERA vez, reemplazar <PONER-SECRETO> por una contraseña fuerte y
-- guardarla en n8n. Es idempotente: si el rol ya existe, no lo recrea (conserva
-- su contraseña) y solo re-aplica usage + los grants de abajo.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'n8n_reader') then
    create role n8n_reader login password '<PONER-SECRETO>'
      nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;

grant usage on schema public to n8n_reader;

-- Las vistas reporte_* corren con privilegios del owner (no security_invoker) y
-- tienen revoke a anon/authenticated, así que este rol las lee sin tocar las
-- tablas base ni la RLS de la app.
grant select on
  public.reporte_planilla,       -- interno: fila por grupo/parque/día
  public.reporte_resumen,        -- interno: tablero
  public.reporte_externo,        -- externo (PLOM): fila por aero visitado
  public.reporte_externo_resumen, -- externo (PLOM): RESUMEN
  public.resumen_asistencia,     -- externo: Consolidado (una fila por parque) — 0002
  public.resumen_interno,        -- interno: pestaña Resumen (grupo × parque) — 0014
  public.standby_dia             -- interno+externo: minutos de stand-by por grupo/parque/día — 0017
  to n8n_reader;

-- Nota: los grants de resumen_asistencia, resumen_interno y standby_dia los aplican
-- también las migraciones 0002_asistencia_externa.sql, 0014_resumen_interno.sql y
-- 0017_standby_dia.sql (estas líneas dejan constancia).

-- Conexión desde n8n (credencial Postgres):
--   host = <pooler de Supabase>   port = 5432 (modo sesión)   db = postgres
--   user = n8n_reader             password = <PONER-SECRETO>
-- (Settings → Database → Connection string → "Session" pooler, cambiando el usuario.)
