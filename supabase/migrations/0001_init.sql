-- =====================================================================
-- INER Check-in — Esquema inicial (Supabase / Postgres)
-- Modelo reconciliado (ver MODELO_RECONCILIADO.md):
--   eventos append-only como base · flujo/planilla = vistas derivadas
--   equipos solo para AR interna · offline 1-2 días (UUID idempotente)
-- Tipos text + CHECK (amigable para sync offline e idempotencia).
-- =====================================================================

-- =====================================================================
-- 1) CATÁLOGOS
-- =====================================================================

-- Países + zona horaria (TZ_POR_PAIS centralizado: fecha de jornada y
-- corte 20:00 de n8n se calculan en la TZ del país del parque).
create table if not exists public.paises (
  id     text primary key check (id in ('argentina','chile','peru','uruguay')),
  nombre text not null,
  tz     text not null            -- IANA, ej. America/Argentina/Buenos_Aires
);

-- Empresas (operadores). Hoy solo Chile agrupa parques por empresa.
create table if not exists public.empresas (
  id     text primary key,
  nombre text not null,
  pais   text not null references public.paises(id)
);

-- Parques. empresa_id NULL donde no aplica (p.ej. Argentina).
create table if not exists public.parques (
  id         text primary key,
  nombre     text not null,
  pais       text not null references public.paises(id),
  empresa_id text references public.empresas(id),
  turbinas   int,
  activo     boolean not null default true,
  orden      int
);

-- Aeros (aerogeneradores) por parque. Fuente de la lista del botón
-- "ingresar aero": el técnico elige el número. Se carga todo el inventario.
create table if not exists public.aeros (
  id        text primary key,        -- '{parque_id}_{numero}'
  parque_id text not null references public.parques(id) on delete cascade,
  numero    int  not null,
  nombre    text,                    -- etiqueta visible (ej. 'WTG 03')
  unique (parque_id, numero)
);
create index if not exists aeros_parque_idx on public.aeros (parque_id, numero);

-- =====================================================================
-- 2) IDENTIDAD
-- =====================================================================

-- Equipos de inspección. Hoy solo Argentina interna (X-C, F-K).
create table if not exists public.equipos (
  id     text primary key,
  nombre text not null,
  pais   text not null references public.paises(id)
);

-- Técnicos (perfil): 1:1 con auth.users. La contraseña la maneja Supabase
-- Auth (NO se guarda acá). equipo_id NULL salvo AR interna.
create table if not exists public.tecnicos (
  id        uuid primary key references auth.users(id) on delete cascade,
  usuario   text unique,          -- nombre de login (ej. 'carlos.naretto'); = parte local del email sintético
  nombre    text,                 -- nombre para la planilla (ej. 'Carlos Naretto')
  subtipo   text check (subtipo in ('interno','inspector_externo')),
  pais      text references public.paises(id),
  equipo_id text references public.equipos(id),
  activo    boolean not null default true,   -- baja lógica sin borrar
  creado_ts timestamptz not null default now()
);
create index if not exists tecnicos_equipo_idx on public.tecnicos (equipo_id);

-- =====================================================================
-- 3) OPERACIÓN
-- =====================================================================

-- Asignaciones: parque activo por técnico. "Finalizar parque" la cierra.
-- Como mucho UNA activa por técnico (índice único parcial).
create table if not exists public.asignaciones (
  id         uuid primary key,                 -- UUID de cliente (idempotente)
  tecnico_id uuid not null references public.tecnicos(id) on delete cascade,
  parque_id  text not null references public.parques(id),
  estado     text not null default 'activa' check (estado in ('activa','finalizada')),
  inicio_ts  timestamptz not null,
  fin_ts     timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists asignaciones_una_activa
  on public.asignaciones (tecnico_id) where estado = 'activa';

-- Jornadas: una por asignación por día. id = '{asignacion_id}_{fecha}'
-- (evita colisión al cambiar de parque el mismo día). fecha en TZ del país.
create table if not exists public.jornadas (
  id           text primary key,
  asignacion_id uuid not null references public.asignaciones(id) on delete cascade,
  tecnico_id   uuid not null references public.tecnicos(id) on delete cascade,
  parque_id    text not null references public.parques(id),
  fecha        date not null,
  subtipo      text check (subtipo in ('interno','inspector_externo')),
  estado       text not null default 'abierta'
               check (estado in ('abierta','cerrada','incompleta','anulada')),
  cierre_tipo  text check (cierre_tipo in ('salida_parque','finalizar_parque','auto_2000')),
  abierta_ts   timestamptz,
  cerrada_ts   timestamptz,
  updated_at   timestamptz not null default now()
);
create index if not exists jornadas_fecha_idx   on public.jornadas (fecha);
create index if not exists jornadas_tecnico_idx on public.jornadas (tecnico_id);

-- Eventos: append-only. id = UUID de cliente → reintentar no duplica.
-- updated_at habilita capturar anulaciones (alto-agua para n8n).
create table if not exists public.eventos (
  id             uuid primary key,
  jornada_id     text not null references public.jornadas(id) on delete cascade,
  tipo           text not null check (tipo in (
                   'entrada_parque','traslado_maquina','entrada_wtg','salida_wtg',
                   'inicio_almuerzo','inicio_standby','salida_parque','finalizar_parque')),
  categoria      text check (categoria in ('productivo','traslado','stand_by','almuerzo')),
  anulado        boolean not null default false,
  ts_dispositivo timestamptz not null,
  ts_servidor    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  maquina_id     text references public.aeros(id),  -- aero elegido (en entrada_wtg)
  motivo         text check (motivo in ('clima','documentacion','programacion_tecnica','otros')),
  motivo_otro    text,
  comentario     text
);
create index if not exists eventos_jornada_ts_idx on public.eventos (jornada_id, ts_dispositivo);
create index if not exists eventos_updated_idx    on public.eventos (updated_at);

-- Bumpea updated_at en cada UPDATE (anulaciones).
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists eventos_touch on public.eventos;
create trigger eventos_touch before update on public.eventos
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- 4) DERIVACIÓN (vistas)
-- =====================================================================

-- TRAMOS — empareja eventos consecutivos no anulados (LEAD), por jornada.
-- salida_parque (cierre de día) y finalizar_parque (cierre de parque) son
-- terminales: no abren tramo, pero sí cierran el tramo previo. security_invoker => RLS app.
create or replace view public.tramos with (security_invoker = on) as
with ord as (
  select e.*, j.fecha, j.tecnico_id, j.parque_id, j.subtipo,
         j.estado as estado_jornada,
         lead(e.ts_dispositivo) over w as fin_ts,
         lead(e.tipo)           over w as tipo_fin
  from public.eventos e
  join public.jornadas j on j.id = e.jornada_id
  where e.anulado = false
  window w as (partition by e.jornada_id order by e.ts_dispositivo)
)
select
  fecha, parque_id, tecnico_id, subtipo, estado_jornada,
  coalesce(categoria, case tipo
    when 'entrada_parque'   then 'traslado'
    when 'traslado_maquina' then 'traslado'
    when 'entrada_wtg'      then 'productivo'
    when 'salida_wtg'       then 'traslado'
    when 'inicio_almuerzo'  then 'almuerzo'
    when 'inicio_standby'   then 'stand_by'
    else 'stand_by' end) as categoria,
  tipo as tipo_inicio, tipo_fin,
  ts_dispositivo as inicio, fin_ts as fin,
  greatest(0, round(extract(epoch from (fin_ts - ts_dispositivo)) / 60.0))::int as duracion_min,
  maquina_id, motivo, motivo_otro, comentario
from ord
where fin_ts is not null                             -- el último evento no abre tramo
  and tipo not in ('salida_parque','finalizar_parque'); -- cierres: terminales

-- eventos_ctx — eventos + contexto (grupo_clave para el ruteo de planilla).
-- grupo_clave: 'equipo:<id>' si AR interna con equipo; si no 'tecnico:<uuid>'.
create or replace view public.eventos_ctx as
select e.*, j.fecha, j.parque_id, j.tecnico_id,
       t.equipo_id, t.subtipo, p.pais, p.nombre as parque_nombre,
       case when t.subtipo = 'interno' and p.pais = 'argentina' and t.equipo_id is not null
            then 'equipo:'  || t.equipo_id
            else 'tecnico:' || j.tecnico_id::text end as grupo_clave
from public.eventos e
join public.jornadas j on j.id = e.jornada_id
join public.tecnicos t on t.id = j.tecnico_id
join public.parques  p on p.id = j.parque_id
where e.anulado = false;

-- visitas_aero — pares entrada_wtg → (siguiente) cierre de máquina/día/parque.
-- inspeccionado = el ingreso tiene una salida_wtg posterior, o lo cierra el fin
-- del día (salida_parque) / del parque (finalizar_parque). Join a aeros para
-- exponer numero/nombre (n8n etiqueta "Nombre WTG" y ubica el slot sin más queries).
create or replace view public.visitas_aero as
with x as (
  select ec.*,
         lead(ec.tipo)           over w as next_tipo,
         lead(ec.ts_dispositivo) over w as next_ts
  from public.eventos_ctx ec
  window w as (partition by ec.jornada_id order by ec.ts_dispositivo)
)
select x.grupo_clave, x.pais, x.parque_id, x.parque_nombre, x.fecha, x.tecnico_id,
       x.maquina_id, a.numero, a.nombre,
       x.ts_dispositivo as ingreso,
       case when x.next_tipo in ('salida_wtg','salida_parque','finalizar_parque')
            then x.next_ts end as salida,
       (x.next_tipo in ('salida_wtg','salida_parque','finalizar_parque')) as inspeccionado
from x
left join public.aeros a on a.id = x.maquina_id
where x.tipo = 'entrada_wtg';

-- reporte_planilla — UNA fila por (grupo, parque, día). Cabecera + visitas
-- como JSON (n8n las expande a columnas WTG 1..N, evitando fijar el ancho).
create or replace view public.reporte_planilla as
with cab as (
  select grupo_clave, pais, parque_id, parque_nombre, fecha,
         max(subtipo) as subtipo, max(equipo_id) as equipo_id,
         min(ts_dispositivo) filter (where tipo = 'entrada_parque')                         as llegada,
         min(ts_dispositivo) filter (where tipo in ('traslado_maquina','entrada_wtg'))      as inicio_actividades,
         min(ts_dispositivo) filter (where tipo = 'inicio_almuerzo')                        as colacion,
         max(ts_dispositivo) filter (where tipo in ('salida_parque','finalizar_parque'))     as termino,
         string_agg(distinct nullif(trim(coalesce(comentario,'')), ''), ' · ')              as comentarios,
         string_agg(distinct case when tipo = 'inicio_standby'
                                  then coalesce(motivo_otro, motivo) end, ' · ')            as standby
  from public.eventos_ctx
  group by grupo_clave, pais, parque_id, parque_nombre, fecha
),
vis as (
  select grupo_clave, parque_id, fecha,
         count(*) filter (where inspeccionado)                          as aeros_inspeccionados,
         3 * count(*) filter (where inspeccionado)                      as palas,
         jsonb_agg(jsonb_build_object(
           'aero', maquina_id, 'numero', numero, 'nombre', nombre,
           'ingreso', ingreso, 'salida', salida)
           order by ingreso)                                            as visitas
  from public.visitas_aero
  group by grupo_clave, parque_id, fecha
)
select c.grupo_clave, c.equipo_id, c.subtipo, c.pais,
       c.parque_id, c.parque_nombre,
       c.fecha,
       extract(day   from c.fecha)::int as dia,
       extract(month from c.fecha)::int as mes,
       extract(year  from c.fecha)::int as anio,
       c.llegada, c.inicio_actividades, c.colacion, c.termino,
       coalesce(v.aeros_inspeccionados, 0) as aeros_inspeccionados,
       coalesce(v.palas, 0)               as palas,
       v.visitas,
       nullif(concat_ws(' · ', c.standby, c.comentarios), '') as observaciones
from cab c
left join vis v
  on v.grupo_clave = c.grupo_clave and v.parque_id = c.parque_id and v.fecha = c.fecha;

-- reporte_resumen — tablero por (grupo, parque): objetivo, avance, productividad.
create or replace view public.reporte_resumen as
with obj as (   -- turbinas objetivo del parque (catálogo)
  select p.id as parque_id, coalesce(p.turbinas, count(a.id))::int as turbinas_objetivo
  from public.parques p
  left join public.aeros a on a.parque_id = p.id
  group by p.id, p.turbinas
),
ins as (        -- inspeccionadas (aeros distintos completados) por grupo/parque
  select grupo_clave, parque_id, pais, parque_nombre,
         count(distinct maquina_id) filter (where inspeccionado) as inspeccionadas
  from public.visitas_aero
  group by grupo_clave, parque_id, pais, parque_nombre
),
dias as (       -- días en sitio vs productivos por grupo/parque
  select ec.grupo_clave, ec.parque_id,
         count(distinct ec.fecha) as dias_sitio,
         count(distinct ec.fecha) filter (
           where exists (select 1 from public.visitas_aero v
                         where v.grupo_clave = ec.grupo_clave and v.parque_id = ec.parque_id
                           and v.fecha = ec.fecha and v.inspeccionado)) as dias_productivos
  from public.eventos_ctx ec
  group by ec.grupo_clave, ec.parque_id
)
select i.grupo_clave, i.pais, i.parque_id, i.parque_nombre,
       o.turbinas_objetivo,
       i.inspeccionadas,
       greatest(0, o.turbinas_objetivo - i.inspeccionadas) as pendientes,
       round(100.0 * i.inspeccionadas / nullif(o.turbinas_objetivo, 0), 2) as pct_avance,
       d.dias_sitio, d.dias_productivos,
       round(100.0 * d.dias_productivos / nullif(d.dias_sitio, 0), 2)      as pct_productividad,
       round(i.inspeccionadas::numeric / nullif(d.dias_productivos, 0), 2) as turb_dia,
       3 * i.inspeccionadas as palas
from ins i
join obj  o on o.parque_id = i.parque_id
join dias d on d.grupo_clave = i.grupo_clave and d.parque_id = i.parque_id;

-- =====================================================================
-- Reporte EXTERNO (formato PLOM) — misma base de eventos, otra proyección.
-- Cadena por aero: esfuerzo_inicio (salida anterior o llegada) → parada_aero
-- (entrada_wtg) → esfuerzo_final/inicio_aero (salida_wtg o cierre del día).
-- =====================================================================
create or replace view public.reporte_externo as
with base as (   -- eventos de externos que forman la cadena, por jornada
  select ec.jornada_id, ec.fecha, ec.grupo_clave, ec.tecnico_id, ec.pais,
         ec.parque_id, ec.parque_nombre, ec.tipo, ec.ts_dispositivo, ec.maquina_id
  from public.eventos_ctx ec
  where ec.subtipo = 'inspector_externo'
    and ec.tipo in ('entrada_parque','entrada_wtg','salida_wtg','salida_parque')
),
seq as (
  select b.*,
         lag(ts_dispositivo)  over w as prev_ts,   -- salida anterior / llegada
         lead(ts_dispositivo) over w as next_ts,
         lead(tipo)           over w as next_tipo
  from base b
  window w as (partition by jornada_id order by ts_dispositivo)
),
cierre as (   -- por jornada: salida de parque y última salida de aero
  select jornada_id,
         max(ts_dispositivo) filter (where tipo = 'salida_parque') as salida_de_parque,
         max(ts_dispositivo) filter (where tipo = 'salida_wtg')    as ultima_salida_wtg
  from base
  group by jornada_id
),
obs as (   -- observación por jornada: standby (motivo) + comentarios (todos los eventos)
  select ec.jornada_id,
         nullif(concat_ws(' · ',
           string_agg(distinct case when ec.tipo = 'inicio_standby'
                                    then coalesce(ec.motivo_otro, ec.motivo) end, ' · '),
           string_agg(distinct nullif(trim(coalesce(ec.comentario,'')), ''), ' · ')
         ), '') as observacion
  from public.eventos_ctx ec
  where ec.subtipo = 'inspector_externo'
  group by ec.jornada_id
)
select
  s.grupo_clave, s.tecnico_id, s.pais, s.parque_id, s.parque_nombre,
  s.fecha,
  extract(day   from s.fecha)::int as dia,
  extract(month from s.fecha)::int as mes,
  extract(year  from s.fecha)::int as anio,
  a.numero as wtg, a.nombre as wtg_nombre,
  s.prev_ts        as esfuerzo_inicio,             -- = salida anterior (o llegada en el 1º)
  s.ts_dispositivo as parada_aero,                 -- = entrada_wtg
  greatest(0, round(extract(epoch from (s.ts_dispositivo - s.prev_ts)) / 60.0))::int as traslado_min,
  case when s.next_tipo in ('salida_wtg','salida_parque') then s.next_ts end as esfuerzo_final,
  case when s.next_tipo in ('salida_wtg','salida_parque') then s.next_ts end as inicio_aero,
  c.salida_de_parque,
  greatest(0, round(extract(epoch from (c.salida_de_parque - c.ultima_salida_wtg)) / 60.0))::int as tiempo_min,
  o.observacion
from seq s
join public.aeros a on a.id = s.maquina_id
left join cierre c on c.jornada_id = s.jornada_id
left join obs    o on o.jornada_id = s.jornada_id
where s.tipo = 'entrada_wtg';

-- reporte_externo_resumen — hoja RESUMEN del externo (por grupo/parque).
create or replace view public.reporte_externo_resumen as
with dias as (
  select ec.grupo_clave, ec.tecnico_id, ec.pais, ec.parque_id, ec.parque_nombre,
         count(distinct ec.fecha) filter (where ec.tipo = 'entrada_wtg') as dias_trabajados,
         count(distinct ec.fecha)                                        as dias_sitio,
         min(ec.fecha) as fecha_inicio, max(ec.fecha) as fecha_termino
  from public.eventos_ctx ec
  where ec.subtipo = 'inspector_externo'
  group by ec.grupo_clave, ec.tecnico_id, ec.pais, ec.parque_id, ec.parque_nombre
),
insp as (
  select v.grupo_clave, v.parque_id,
         count(distinct v.maquina_id) filter (where v.inspeccionado) as wtg
  from public.visitas_aero v
  group by v.grupo_clave, v.parque_id
),
sb as (   -- días completos de standby (con standby y sin ningún entrada_wtg)
  select ec.grupo_clave, ec.parque_id,
         count(distinct ec.fecha) filter (
           where ec.tipo = 'inicio_standby'
             and not exists (select 1 from public.eventos_ctx e2
                             where e2.jornada_id = ec.jornada_id and e2.tipo = 'entrada_wtg')
         ) as standby
  from public.eventos_ctx ec
  where ec.subtipo = 'inspector_externo'
  group by ec.grupo_clave, ec.parque_id
)
select d.grupo_clave, d.tecnico_id, d.pais, d.parque_id, d.parque_nombre,
       d.fecha_inicio, d.fecha_termino, d.dias_trabajados, d.dias_sitio,
       coalesce(i.wtg, 0) as wtg,
       round(coalesce(i.wtg, 0)::numeric / nullif(d.dias_trabajados, 0), 2) as prom_diario,
       coalesce(s.standby, 0) as standby
from dias d
left join insp i on i.grupo_clave = d.grupo_clave and i.parque_id = d.parque_id
left join sb   s on s.grupo_clave = d.grupo_clave and s.parque_id = d.parque_id;

-- =====================================================================
-- 5) ROW LEVEL SECURITY
-- =====================================================================
alter table public.paises       enable row level security;
alter table public.empresas     enable row level security;
alter table public.parques      enable row level security;
alter table public.aeros        enable row level security;
alter table public.equipos      enable row level security;
alter table public.tecnicos     enable row level security;
alter table public.asignaciones enable row level security;
alter table public.jornadas     enable row level security;
alter table public.eventos      enable row level security;

-- Catálogos: lectura pública (datos operativos no sensibles). Escritos por seed
-- con service_role (salta RLS).
drop policy if exists paises_read on public.paises;
create policy paises_read on public.paises for select to anon, authenticated using (true);
drop policy if exists empresas_read on public.empresas;
create policy empresas_read on public.empresas for select to anon, authenticated using (true);
drop policy if exists parques_read on public.parques;
create policy parques_read on public.parques for select to anon, authenticated using (true);
drop policy if exists aeros_read on public.aeros;
create policy aeros_read on public.aeros for select to anon, authenticated using (true);
drop policy if exists equipos_read on public.equipos;
create policy equipos_read on public.equipos for select to anon, authenticated using (true);

-- Técnicos: cada uno su fila; admin (claim app_metadata.rol) lee todo.
drop policy if exists tecnicos_select_own on public.tecnicos;
create policy tecnicos_select_own on public.tecnicos for select to authenticated
  using (id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin');
drop policy if exists tecnicos_insert_self on public.tecnicos;
create policy tecnicos_insert_self on public.tecnicos for insert to authenticated
  with check (id = auth.uid());
drop policy if exists tecnicos_update_own on public.tecnicos;
create policy tecnicos_update_own on public.tecnicos for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Asignaciones: propias o admin; insert/update propios (para finalizar).
drop policy if exists asignaciones_select on public.asignaciones;
create policy asignaciones_select on public.asignaciones for select to authenticated
  using (tecnico_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin');
drop policy if exists asignaciones_insert_own on public.asignaciones;
create policy asignaciones_insert_own on public.asignaciones for insert to authenticated
  with check (tecnico_id = auth.uid());
drop policy if exists asignaciones_update_own on public.asignaciones;
create policy asignaciones_update_own on public.asignaciones for update to authenticated
  using (tecnico_id = auth.uid()) with check (tecnico_id = auth.uid());

-- Jornadas: propias o admin.
drop policy if exists jornadas_select on public.jornadas;
create policy jornadas_select on public.jornadas for select to authenticated
  using (tecnico_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin');
drop policy if exists jornadas_insert_own on public.jornadas;
create policy jornadas_insert_own on public.jornadas for insert to authenticated
  with check (tecnico_id = auth.uid());
drop policy if exists jornadas_update_own on public.jornadas;
create policy jornadas_update_own on public.jornadas for update to authenticated
  using (tecnico_id = auth.uid()) with check (tecnico_id = auth.uid());

-- Eventos: ligados a jornada propia (admin lee todo). UPDATE acotado para anular.
drop policy if exists eventos_select on public.eventos;
create policy eventos_select on public.eventos for select to authenticated
  using (exists (select 1 from public.jornadas j
                 where j.id = jornada_id and j.tecnico_id = auth.uid())
         or (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin');
drop policy if exists eventos_insert_own on public.eventos;
create policy eventos_insert_own on public.eventos for insert to authenticated
  with check (exists (select 1 from public.jornadas j
                      where j.id = jornada_id and j.tecnico_id = auth.uid()));
drop policy if exists eventos_anular_own on public.eventos;
create policy eventos_anular_own on public.eventos for update to authenticated
  using (exists (select 1 from public.jornadas j
                 where j.id = jornada_id and j.tecnico_id = auth.uid()))
  with check (exists (select 1 from public.jornadas j
                      where j.id = jornada_id and j.tecnico_id = auth.uid()));

-- =====================================================================
-- 6) n8n (downstream): vistas de reporte como única superficie de lectura.
-- Las vistas eventos_ctx / visitas_aero / reporte_* NO usan security_invoker →
-- corren con privilegios del owner (postgres) y, por tanto, saltan la RLS. Para
-- que NO filtren todos los eventos a la app, se revoca el acceso por defecto que
-- Supabase concede a anon/authenticated; solo el rol read-only de n8n (y
-- service_role, que ignora grants) las leen.
-- =====================================================================
revoke all on
  public.eventos_ctx, public.visitas_aero,
  public.reporte_planilla, public.reporte_resumen,
  public.reporte_externo, public.reporte_externo_resumen
  from anon, authenticated;

-- Al montar n8n (ver supabase/n8n_role.sql):
--   create role n8n_reader login password '<secreto>' nosuperuser nocreatedb nocreaterole;
--   grant usage on schema public to n8n_reader;
--   grant select on public.reporte_planilla, public.reporte_resumen,
--                   public.reporte_externo, public.reporte_externo_resumen to n8n_reader;
