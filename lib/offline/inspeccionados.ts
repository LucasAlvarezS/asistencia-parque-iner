// Acumulado offline de aeros inspeccionados por asignación, para el resumen
// copiable de fin de día del externo. Criterio "inspeccionado" (espejo de la
// vista SQL `visitas_aero`): un STOP (entrada_wtg) cuenta cuando llega su RUN
// (salida_wtg) o el día/parque se cierra con el aero abierto.
//
// Se alimenta al registrar cada evento (registrarEvento) y se siembra desde
// Supabase en el onboarding (dispositivo nuevo con asignación preexistente).
// Vive en el store `sesion` bajo `inspeccionados:{asignacion_id}` y sobrevive
// al logout (igual que la outbox); se limpia al finalizar el parque.

import { EVENTO_TIPO } from "@/lib/catalogos";
import { cacheGet, cacheSet } from "./db";

const keyInspeccionados = (asignacionId: string) => `inspeccionados:${asignacionId}`;

/** Ids de aero (`aeros.id`) ya inspeccionados en la asignación. */
export async function leerInspeccionados(asignacionId: string): Promise<string[]> {
  return (await cacheGet<string[]>("sesion", keyInspeccionados(asignacionId))) ?? [];
}

/** Suma un aero al acumulado (idempotente). */
export async function agregarInspeccionado(
  asignacionId: string,
  maquinaId: string,
): Promise<void> {
  const actuales = await leerInspeccionados(asignacionId);
  if (actuales.includes(maquinaId)) return;
  await cacheSet("sesion", keyInspeccionados(asignacionId), [...actuales, maquinaId]);
}

/** Une lo del server con lo local (no pisa lo registrado offline sin sync). */
export async function sembrarInspeccionados(
  asignacionId: string,
  ids: string[],
): Promise<void> {
  const actuales = await leerInspeccionados(asignacionId);
  await cacheSet(
    "sesion",
    keyInspeccionados(asignacionId),
    [...new Set([...actuales, ...ids])],
  );
}

export async function limpiarInspeccionados(asignacionId: string): Promise<void> {
  await cacheSet("sesion", keyInspeccionados(asignacionId), null);
}

// ---------- Aero abierto (STOP sin RUN) ----------
// `jornada_eventos` solo guarda tipos; acá se persiste QUÉ aero quedó abierto
// para poder acreditarlo al RUN o al cierre del día.

interface AeroActual {
  jornadaId: string;
  maquinaId: string;
}

export async function guardarAeroActual(
  jornadaId: string,
  maquinaId: string | null,
): Promise<void> {
  await cacheSet(
    "sesion",
    "aero_actual",
    maquinaId ? ({ jornadaId, maquinaId } satisfies AeroActual) : null,
  );
}

/** Aero con STOP abierto en esa jornada (null si no hay o es de otra jornada). */
export async function leerAeroActual(jornadaId: string): Promise<string | null> {
  const a = await cacheGet<AeroActual | null>("sesion", "aero_actual");
  return a && a.jornadaId === jornadaId ? a.maquinaId : null;
}

// ---------- Siembra desde el server ----------

export interface EventoParaSiembra {
  tipo: string;
  maquina_id: string | null;
  jornada_id: string;
  ts_dispositivo: string;
}

/** Ids de aero inspeccionados según la secuencia de eventos de la asignación
 *  (mismo criterio que `visitas_aero`): dentro de cada jornada, un entrada_wtg
 *  cuenta si el siguiente evento de la cadena es salida_wtg o un cierre.
 *  Caso raro preexistente: un inicio_standby entre STOP y RUN corta la cadena
 *  también en la vista SQL, así que acá se ignoran los tipos fuera de cadena. */
export function inspeccionadosDesdeEventos(eventos: EventoParaSiembra[]): string[] {
  const cadena = eventos
    .filter((e) =>
      [
        EVENTO_TIPO.ENTRADA_WTG,
        EVENTO_TIPO.SALIDA_WTG,
        EVENTO_TIPO.SALIDA_PARQUE,
        EVENTO_TIPO.FINALIZAR_PARQUE,
      ].includes(e.tipo as never),
    )
    .sort((a, b) =>
      a.jornada_id === b.jornada_id
        ? a.ts_dispositivo.localeCompare(b.ts_dispositivo)
        : a.jornada_id.localeCompare(b.jornada_id),
    );

  const ids = new Set<string>();
  for (let i = 0; i < cadena.length; i++) {
    const e = cadena[i];
    if (e.tipo !== EVENTO_TIPO.ENTRADA_WTG || !e.maquina_id) continue;
    const sig = cadena[i + 1];
    if (sig && sig.jornada_id === e.jornada_id && sig.tipo !== EVENTO_TIPO.ENTRADA_WTG) {
      ids.add(e.maquina_id);
    }
  }
  return [...ids];
}
