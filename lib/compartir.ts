// Compartir/copiar del flujo externo: mensaje de evidencia de WhatsApp por
// evento (foto STOP/RUN) y resumen copiable de fin de día.

import {
  EVENTO_TIPO,
  type EventoTipo,
  STANDBY_MOTIVO,
  STANDBY_MOTIVO_LABEL,
  type StandbyMotivo,
} from "./catalogos";

/** Mensaje de evidencia del evento para compartir por WhatsApp junto a la foto.
 *  Encabezado fijo "INER"; el `*STOP*`/`*RUN*` usa la negrita de WhatsApp.
 *  `tsISO` es el ts local del parque (ahoraISO): la hora/fecha salen por slicing
 *  para respetar la hora de pared del parque aunque el teléfono esté en otra TZ. */
export function textoEvidencia({
  tipo,
  operador,
  parque,
  numeroWtg,
  tsISO,
}: {
  tipo: "stop" | "run";
  operador: string;
  parque: string;
  numeroWtg: number;
  tsISO: string;
}): string {
  const hora = tsISO.slice(11, 16); // HH:MM
  const fecha = `${tsISO.slice(8, 10)}/${tsISO.slice(5, 7)}/${tsISO.slice(0, 4)}`; // DD/MM/YYYY
  return [
    "INER",
    `Operador: ${operador}`,
    `Parque: ${parque}`,
    `*${tipo.toUpperCase()}*`,
    `Turbina: ${numeroWtg}`,
    `Hora: ${hora}`,
    `Fecha: ${fecha}`,
  ].join("\n");
}

export type ModoCompartido = "archivo" | "texto" | "clipboard" | "cancelado";

/** Comparte la evidencia (foto + comando) por el share sheet del sistema
 *  (WhatsApp incluido). Degrada: share con archivo → share solo texto →
 *  clipboard (desktop). Cancelar el share sheet no es un error. */
export async function compartirEvidencia({
  texto,
  blob,
  nombreArchivo,
}: {
  texto: string;
  blob: Blob | null;
  nombreArchivo: string;
}): Promise<ModoCompartido> {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  try {
    if (blob && nav.share && nav.canShare) {
      const file = new File([blob], nombreArchivo, { type: "image/jpeg" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text: texto });
        return "archivo";
      }
    }
    if (nav.share) {
      await nav.share({ text: texto });
      return "texto";
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelado";
    // Share falló por otra razón: cae al clipboard.
  }
  const ok = await copiarTexto(texto);
  if (!ok) throw new Error("No se pudo compartir ni copiar.");
  return "clipboard";
}

/** Copia texto al portapapeles, con fallback para WebViews sin Clipboard API. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// ---------- Resumen detallado de la jornada (por día) ----------
// Reconstruye el desglose STOP/RUN por turbina, los stand-by (motivo + horario) y
// la salida del parque a partir de los eventos del día. Espejo de la vista SQL
// `reporte_externo` (ver 0001_init.sql): la cadena por aero empareja entrada_wtg
// con la salida siguiente (salida_wtg o un cierre de día/parque).

const SIN_HORA = "—";

/** Evento normalizado (ya con hora de pared del parque) para armar el resumen. */
export interface EventoResumen {
  tipo: EventoTipo | string;
  ts: string; // ISO 8601 local del parque
  maquinaId?: string | null;
  numero?: number | null; // WTG, si viene embebido (Supabase); si no, lo resuelve resolverWtg
  motivo?: StandbyMotivo | string | null;
  motivoOtro?: string | null;
}

export interface TurbinaResumen {
  wtg: number | null;
  stop: string; // HH:MM
  run: string; // HH:MM o "—"
}
export interface StandbyResumen {
  etiqueta: string;
  inicio: string; // HH:MM
  fin: string; // HH:MM o "—"
}
export interface ResumenJornada {
  operador: string;
  parque: string;
  fecha: string; // dd/MM/yyyy
  turbinas: TurbinaResumen[];
  standbys: StandbyResumen[];
  salida: string | null; // HH:MM del cierre del día/parque
}

const hhmm = (tsISO: string): string => tsISO.slice(11, 16); // HH:MM
const CIERRAN_AERO: (EventoTipo | string)[] = [
  EVENTO_TIPO.SALIDA_WTG,
  EVENTO_TIPO.SALIDA_PARQUE,
  EVENTO_TIPO.FINALIZAR_PARQUE,
];

/** Etiqueta del stand-by: "Clima -> Lluvia/llovizna" (sub-motivo en motivoOtro),
 *  el texto libre para "Otros", o la etiqueta del motivo en el resto. */
function etiquetaStandby(motivo?: string | null, motivoOtro?: string | null): string {
  const detalle = motivoOtro?.trim();
  if (motivo === STANDBY_MOTIVO.OTROS) return detalle || "Otros";
  const base = motivo
    ? (STANDBY_MOTIVO_LABEL[motivo as StandbyMotivo] ?? motivo)
    : "Stand-by";
  return detalle ? `${base} -> ${detalle}` : base;
}

/** Arma el resumen estructurado de la jornada. `eventos` puede venir sin ordenar;
 *  `resolverWtg` mapea maquina_id → número de WTG cuando el evento no lo trae. */
export function resumenJornadaDesdeEventos(
  eventos: EventoResumen[],
  meta: { operador: string; parque: string; fecha: string },
  resolverWtg?: (maquinaId: string | null | undefined) => number | null,
): ResumenJornada {
  const orden = [...eventos].sort((a, b) => a.ts.localeCompare(b.ts));
  const turbinas: TurbinaResumen[] = [];
  const standbys: StandbyResumen[] = [];
  let salida: string | null = null;

  for (let i = 0; i < orden.length; i++) {
    const e = orden[i];
    const sig = orden[i + 1];
    if (e.tipo === EVENTO_TIPO.ENTRADA_WTG) {
      const cierra = sig != null && CIERRAN_AERO.includes(sig.tipo);
      const wtg = e.numero ?? resolverWtg?.(e.maquinaId) ?? null;
      turbinas.push({ wtg, stop: hhmm(e.ts), run: cierra ? hhmm(sig.ts) : SIN_HORA });
    } else if (e.tipo === EVENTO_TIPO.INICIO_STANDBY) {
      standbys.push({
        etiqueta: etiquetaStandby(e.motivo, e.motivoOtro),
        inicio: hhmm(e.ts),
        fin: sig != null ? hhmm(sig.ts) : SIN_HORA,
      });
    } else if (
      e.tipo === EVENTO_TIPO.SALIDA_PARQUE ||
      e.tipo === EVENTO_TIPO.FINALIZAR_PARQUE
    ) {
      salida = hhmm(e.ts);
    }
  }
  return { ...meta, turbinas, standbys, salida };
}

/** Texto copiable del resumen detallado de la jornada (formato acordado con el equipo). */
export function textoResumenJornada(d: ResumenJornada): string {
  const inspeccionadas = d.turbinas.filter((t) => t.run !== SIN_HORA).length;
  const lineas: string[] = [
    "Iner",
    `Operador: ${d.operador}`,
    `Parque: ${d.parque}`,
    `Turbinas inspeccionadas: ${inspeccionadas}`,
  ];
  for (const t of d.turbinas) {
    lineas.push(`${t.wtg != null ? `WTG ${t.wtg}` : "WTG —"}: STOP: ${t.stop} - RUN: ${t.run}`);
  }
  for (const s of d.standbys) {
    lineas.push(`Stand-By: ${s.etiqueta}`, `Hora inicio: ${s.inicio}`, `Hora fin: ${s.fin}`);
  }
  if (d.salida) lineas.push(`Salida del parque: ${d.salida}`);
  lineas.push(`Fecha: ${d.fecha}`);
  return lineas.join("\n");
}
