-- =====================================================================
-- 0018 — fin_standby: el stand-by pasa a ser un período abierto→cerrado.
-- Correr una vez en el SQL Editor. Idempotente.
--
-- La app registra `fin_standby` al cerrar el stand-by ("Terminar stand-by" con
-- hora = ahora; "Retirarme del parque" con hora = salida establecida 17:00). La
-- duración inicio→fin la calculan las vistas por lead() sin lógica nueva:
-- `fin_standby` queda como el evento que cierra el tramo de `inicio_standby`.
--
-- Solo se agrega el valor al CHECK de eventos.tipo (mismo patrón que 0007 con
-- eventos_motivo_check). El constraint es el inline de 0001 (eventos_tipo_check).
-- =====================================================================

alter table public.eventos drop constraint if exists eventos_tipo_check;
alter table public.eventos add constraint eventos_tipo_check check (tipo in (
  'entrada_parque','traslado_maquina','entrada_wtg','salida_wtg',
  'inicio_almuerzo','inicio_standby','fin_standby','salida_parque','finalizar_parque'));
