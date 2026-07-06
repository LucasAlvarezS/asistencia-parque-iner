// Detalle offline de los eventos del día, para armar el resumen detallado de la
// jornada SIN conexión. La outbox borra los eventos al sincronizar y
// `jornada_eventos` (ver estado.ts) guarda solo los tipos: acá se persiste, en un
// cache separado para no tocar la máquina de estados, lo mínimo que necesita el
// resumen (tipo, hora, aero, motivo). Se reinicia al cambiar de jornada y se
// limpia al finalizar el parque / cerrar sesión (igual que el resto del día).

import type { EventoResumen } from "@/lib/compartir";
import { cacheGet, cacheSet } from "./db";

interface DetalleCache {
  jornadaId: string;
  eventos: EventoResumen[];
}

/** Eventos detallados de esa jornada (vacío si es otra jornada o no hay). */
export async function leerEventosDetalle(jornadaId: string): Promise<EventoResumen[]> {
  const c = await cacheGet<DetalleCache>("sesion", "jornada_detalle");
  return c && c.jornadaId === jornadaId ? c.eventos : [];
}

/** Agrega un evento al detalle del día (reinicia si cambió de jornada). */
export async function pushEventoDetalle(
  jornadaId: string,
  evento: EventoResumen,
): Promise<void> {
  const eventos = [...(await leerEventosDetalle(jornadaId)), evento];
  await cacheSet("sesion", "jornada_detalle", { jornadaId, eventos });
}

export async function limpiarDetalle(): Promise<void> {
  await cacheSet("sesion", "jornada_detalle", null);
}
