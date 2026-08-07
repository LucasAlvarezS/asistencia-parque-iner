-- =====================================================================
-- 0030 — Fix nombre de aeros en PE Arauco III y IV (y I y II): el
-- 'WTG ' || lpad(numero::text, 2, '0') de 0022 trunca números de 3
-- dígitos (lpad achica el string si supera el largo pedido), así que
-- 103 -> "WTG 10" y 112/113/114/115/116/117 -> "WTG 11" (colisión).
-- Correr una vez en el SQL Editor. Idempotente.
--
-- Fix: nombre = 'WTG ' || numero::text (sin padding), único por número
-- real (código AG-NNN / ARA-NNN del inventario). Ya aplicado en vivo vía
-- REST para ar_arauco_iii_iv; esta migración lo deja versionado y cubre
-- también ar_arauco_i_ii (mismos números >=100 truncados).
-- =====================================================================
begin;

update public.aeros set nombre = 'WTG ' || numero::text
where parque_id in ('ar_arauco_i_ii', 'ar_arauco_iii_iv');

commit;

-- Verificación (correr aparte):
--   select numero, nombre from public.aeros
--     where parque_id = 'ar_arauco_iii_iv' order by orden;
--   -- esperado: WTG 103, WTG 112, ..., WTG 153, todos únicos.
