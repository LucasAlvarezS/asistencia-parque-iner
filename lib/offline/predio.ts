// Predios (0046): varios parques en un mismo terreno (ej. PE Manantiales I y II).
// El operador entra al predio y alterna entre sus parques turbina a turbina. Cada
// parque tiene SU asignación y SU jornada del día (`{asignacion_id}_{fecha}`), así
// los reportes quedan separados por parque sin tocar las vistas.
//
// La app sigue trabajando con UNA asignación "actual" (la de `leerAsignacion`) y
// con los slots del día de siempre (jornada_activa, jornada_eventos, …). Cambiar
// de parque guarda los slots del parque que se deja y restaura los del otro.

import { EVENTO_TIPO, TZ_POR_PAIS } from "@/lib/catalogos";
import { createClient } from "@/lib/supabase/client";
import { fechaHoy } from "@/lib/tiempo";
import { cacheGet, cacheSet } from "./db";
import { leerEventosDetalle } from "./detalleJornada";
import { estadoDesdeEventos, getTiposJornada } from "./estado";
import { type EventoParaSiembra, inspeccionadosDesdeEventos, sembrarInspeccionados } from "./inspeccionados";
import { registrarEvento } from "./registrarEvento";
import {
  type AeroCache,
  type AsignacionCache,
  type ParqueCache,
  guardarAeros,
  guardarAsignacion,
  leerAsignacion,
} from "./sesion";

export interface PredioCache {
  nombre: string;
  asignaciones: AsignacionCache[]; // una por parque del predio (incluye la actual)
}

export const guardarPredio = (p: PredioCache | null) => cacheSet("sesion", "predio", p);
export const leerPredio = () => cacheGet<PredioCache | null>("sesion", "predio");

/** Slots del día que dependen de la jornada (cada uno guarda su jornadaId). */
const SLOTS = [
  "jornada_activa",
  "jornada_eventos",
  "jornada_detalle",
  "aero_actual",
  "tecnico_acompanante",
] as const;
const keySlots = (asignacionId: string) => `predio_slots:${asignacionId}`;

type ParqueFila = Pick<
  ParqueCache,
  "id" | "nombre" | "pais" | "turbinas" | "lat" | "lon" | "foto_evidencia" | "predio"
>;

export function asignacionCacheDe(
  a: { id: string; inicio_ts: string },
  p: ParqueFila,
): AsignacionCache {
  return {
    id: a.id,
    parque_id: p.id,
    parque_nombre: p.nombre,
    pais: p.pais,
    tz: TZ_POR_PAIS[p.pais],
    inicio_ts: a.inicio_ts,
    turbinas: p.turbinas ?? null,
    lat: p.lat ?? null,
    lon: p.lon ?? null,
    foto_evidencia: p.foto_evidencia ?? false,
  };
}

/** Baja y cachea los aeros del parque (necesita red). */
export async function cachearAeros(parqueId: string): Promise<void> {
  const { data } = await createClient()
    .from("aeros")
    .select("id, numero, nombre")
    .eq("parque_id", parqueId)
    .order("orden")
    .order("numero");
  await guardarAeros(parqueId, (data ?? []) as AeroCache[]);
}

/** Siembra el acumulado de inspeccionados de la asignación desde el server
 *  (dispositivo nuevo o cache borrado con la asignación en curso). */
export async function sembrarAsignacion(asignacionId: string): Promise<void> {
  const { data: evs } = await createClient()
    .from("eventos")
    .select("tipo, maquina_id, palas, ts_dispositivo, jornada_id, jornadas!inner(asignacion_id)")
    .eq("jornadas.asignacion_id", asignacionId)
    .in("tipo", ["entrada_wtg", "salida_wtg", "salida_parque", "finalizar_parque"])
    .order("ts_dispositivo");
  if (evs) {
    await sembrarInspeccionados(
      asignacionId,
      inspeccionadosDesdeEventos(evs as unknown as EventoParaSiembra[]),
    );
  }
}

/** Deja `destino` como asignación actual: guarda los slots del día de la que se
 *  deja y restaura los de `destino`. No registra eventos. */
export async function activarAsignacion(destino: AsignacionCache): Promise<void> {
  const actual = await leerAsignacion();
  if (actual?.id === destino.id) {
    await guardarAsignacion(destino);
    return;
  }
  if (actual) {
    const snap: Record<string, unknown> = {};
    for (const s of SLOTS) snap[s] = await cacheGet("sesion", s);
    await cacheSet("sesion", keySlots(actual.id), snap);
  }
  const snapDestino = (await cacheGet<Record<string, unknown>>("sesion", keySlots(destino.id))) ?? {};
  for (const s of SLOTS) await cacheSet("sesion", s, snapDestino[s] ?? null);
  await guardarAsignacion(destino);
}

/** Estado del día de una asignación del predio (sin activarla). */
async function estadoDe(asignacionId: string, tz: string) {
  const actual = await leerAsignacion();
  const jornadaId = `${asignacionId}_${fechaHoy(tz)}`;
  if (actual?.id === asignacionId) {
    return estadoDesdeEventos(await getTiposJornada(jornadaId));
  }
  const snap = await cacheGet<Record<string, { jornadaId?: string; tipos?: string[] } | null>>(
    "sesion",
    keySlots(asignacionId),
  );
  const ev = snap?.jornada_eventos;
  const tipos = ev && ev.jornadaId === jornadaId ? (ev.tipos ?? []) : [];
  return estadoDesdeEventos(tipos as Parameters<typeof estadoDesdeEventos>[0]);
}

/** Cambia al otro parque del predio. Si el día ya empezó en el parque actual y el
 *  destino todavía no tiene jornada hoy, le registra la entrada a la MISMA hora de
 *  la entrada real al predio (las dos planillas muestran la llegada verdadera). */
export async function cambiarParqueDelPredio(destino: AsignacionCache): Promise<void> {
  const actual = await leerAsignacion();
  if (!actual || actual.id === destino.id) return;
  const jornadaActual = `${actual.id}_${fechaHoy(actual.tz)}`;
  const estado = estadoDesdeEventos(await getTiposJornada(jornadaActual));
  if (estado.enTurbina) throw new Error("Cierra la turbina abierta antes de cambiar de parque.");
  if (estado.enStandby) throw new Error("Termina el stand-by antes de cambiar de parque.");
  if (estado.enTraslado) throw new Error("Registra la subida a la turbina o espera para cambiar de parque.");

  const entrada = (await leerEventosDetalle(jornadaActual)).find(
    (e) => e.tipo === EVENTO_TIPO.ENTRADA_PARQUE,
  );
  const enDia = estado.enParque && !estado.diaCerrado && entrada;

  await activarAsignacion(destino);
  const estadoDestino = await estadoDe(destino.id, destino.tz);
  if (enDia && !estadoDestino.enParque && !estadoDestino.diaCerrado) {
    await registrarEvento({ tipo: EVENTO_TIPO.ENTRADA_PARQUE, tsOverride: entrada.ts });
  }
}

/** Jornada del día de los OTROS parques del predio que sigue abierta. */
export async function hermanosConDiaAbierto(): Promise<AsignacionCache[]> {
  const [predio, actual] = await Promise.all([leerPredio(), leerAsignacion()]);
  if (!predio || !actual) return [];
  const abiertos: AsignacionCache[] = [];
  for (const a of predio.asignaciones) {
    if (a.id === actual.id) continue;
    const e = await estadoDe(a.id, a.tz);
    if (e.enParque && !e.diaCerrado) abiertos.push(a);
  }
  return abiertos;
}

/** Cierra el día (salida_parque) en `hermano` a la hora `ts` y vuelve a la
 *  asignación actual. Devuelve los eventos del día del hermano (para su resumen). */
export async function cerrarDiaHermano(
  hermano: AsignacionCache,
  ts: string,
): Promise<{ eventos: Awaited<ReturnType<typeof leerEventosDetalle>>; ts: string }> {
  const actual = await leerAsignacion();
  await activarAsignacion(hermano);
  try {
    const jornadaId = `${hermano.id}_${fechaHoy(hermano.tz)}`;
    const eventos = await leerEventosDetalle(jornadaId);
    const res = await registrarEvento({ tipo: EVENTO_TIPO.SALIDA_PARQUE, tsOverride: ts });
    return { eventos, ts: res.ts };
  } finally {
    if (actual) await activarAsignacion(actual);
  }
}

/** Tras finalizar un parque del predio: lo saca de la lista y deja activo el
 *  siguiente. Devuelve true si queda algún parque del predio en curso. */
export async function seguirConOtroParqueDelPredio(finalizadaId: string): Promise<boolean> {
  const predio = await leerPredio();
  if (!predio) return false;
  const restantes = predio.asignaciones.filter((a) => a.id !== finalizadaId);
  await cacheSet("sesion", keySlots(finalizadaId), null);
  if (restantes.length === 0) {
    await guardarPredio(null);
    return false;
  }
  await guardarPredio({ ...predio, asignaciones: restantes });
  await activarAsignacion(restantes[0]);
  return true;
}

/** Hidrata las asignaciones activas del server (onboarding / reconciliación).
 *  Varias activas solo pasan dentro de un mismo predio (trigger 0046). Deja como
 *  actual la que ya estaba en cache si sigue activa; si no, la primera. */
export async function hidratarAsignaciones(
  activas: { id: string; parque_id: string; inicio_ts: string }[],
  parques: ParqueFila[],
): Promise<boolean> {
  const caches: { a: AsignacionCache; predio: string | null }[] = [];
  for (const act of activas) {
    const p = parques.find((x) => x.id === act.parque_id);
    if (!p) continue;
    caches.push({ a: asignacionCacheDe(act, p), predio: p.predio ?? null });
  }
  if (caches.length === 0) return false;
  // Orden del catálogo (Manantiales I antes que II).
  caches.sort(
    (x, y) =>
      parques.findIndex((p) => p.id === x.a.parque_id) -
      parques.findIndex((p) => p.id === y.a.parque_id),
  );
  for (const { a } of caches) {
    await cachearAeros(a.parque_id);
    await sembrarAsignacion(a.id);
  }
  const previa = await leerAsignacion();
  const actual = caches.find((c) => c.a.id === previa?.id) ?? caches[0];
  const nombrePredio = actual.predio;
  const delPredio = nombrePredio ? caches.filter((c) => c.predio === nombrePredio) : [];
  await guardarPredio(
    delPredio.length > 1 ? { nombre: nombrePredio!, asignaciones: delPredio.map((c) => c.a) } : null,
  );
  await activarAsignacion(actual.a);
  return true;
}

/** Con red: alinea el predio cacheado con las asignaciones activas del server
 *  (ej. el supervisor sumó el segundo parque con la app ya abierta). Devuelve
 *  true si cambió algo. */
export async function refrescarPredio(tecnicoId: string): Promise<boolean> {
  const supabase = createClient();
  const { data: activas, error } = await supabase
    .from("asignaciones")
    .select("id, parque_id, inicio_ts")
    .eq("tecnico_id", tecnicoId)
    .eq("estado", "activa");
  if (error || !activas || activas.length === 0) return false;
  const { data: parques } = await supabase
    .from("parques")
    .select("id, nombre, pais, turbinas, lat, lon, foto_evidencia, predio, orden")
    .in("id", activas.map((a) => a.parque_id))
    .order("orden");
  if (!parques) return false;
  const antes = await leerPredio();
  const idsAntes = (antes?.asignaciones ?? []).map((a) => a.id).sort().join(",");
  const actual = await leerAsignacion();
  const pActual = parques.find((p) => p.id === actual?.parque_id);
  const delPredio = pActual?.predio
    ? activas.filter((a) => parques.find((p) => p.id === a.parque_id)?.predio === pActual.predio)
    : [];
  const idsDespues = (delPredio.length > 1 ? delPredio : []).map((a) => a.id).sort().join(",");
  if (idsAntes === idsDespues) return false;
  if (delPredio.length <= 1) {
    await guardarPredio(null);
    return true;
  }
  return hidratarAsignaciones(delPredio, parques as ParqueFila[]);
}
