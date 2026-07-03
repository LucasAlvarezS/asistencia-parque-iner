-- =====================================================================
-- 0005 — Evidencias STOP/RUN: foto por evento + bucket de Storage
-- Correr una vez en el SQL Editor de Supabase. Idempotente.
--
-- Contexto (rediseño del flujo externo):
--   El técnico externo ya NO registra `traslado_maquina`. Su flujo pasa a ser
--   STOP (entrada_wtg = parada del aero, inicio de inspección) → RUN
--   (salida_wtg = arranque del aero, fin de inspección) → STOP siguiente.
--   El traslado se DERIVA: RUN anterior → STOP siguiente (primer aero:
--   entrada_parque → primer STOP).
--
--   `reporte_externo` (0003) NO cambia: su lag() sobre la cadena de eventos ya
--   cae en el `salida_wtg` anterior / `entrada_parque` cuando no hay
--   `traslado_maquina` (el "fallback" documentado en 0003 pasa a ser el
--   comportamiento primario). Los datos históricos con traslado conservan su
--   semántica. n8n/Sheets no cambian.
--
--   En STOP y RUN el técnico saca una foto de evidencia (pantalla del aero),
--   comprimida en el cliente (~100-300 KB JPEG) y subida al bucket privado
--   `evidencias` con path `{tecnico_id}/{evento_id}.jpg`. El evento la
--   referencia en `eventos.foto_path` (null si registró sin foto).
-- =====================================================================

-- 1) Referencia de la foto en el evento (path dentro del bucket `evidencias`).
alter table public.eventos add column if not exists foto_path text;

-- 2) Bucket privado de evidencias (solo JPEG, máx 5 MB por objeto).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- 3) Policies: cada técnico opera solo su carpeta ({auth.uid()}/...).
--    UPDATE es necesaria porque el sync sube con upsert (reintento idempotente).
drop policy if exists evidencias_insert_own on storage.objects;
create policy evidencias_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists evidencias_update_own on storage.objects;
create policy evidencias_update_own on storage.objects for update to authenticated
  using (bucket_id = 'evidencias'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'evidencias'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists evidencias_select_own on storage.objects;
create policy evidencias_select_own on storage.objects for select to authenticated
  using (bucket_id = 'evidencias'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin'));
