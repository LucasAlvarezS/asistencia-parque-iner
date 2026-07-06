// Compartir/copiar del flujo externo: mensaje de evidencia de WhatsApp por
// evento (foto STOP/RUN) y resumen copiable de fin de día.

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

/** Texto del resumen de fin de día del externo (formato acordado con PLOM). */
export function textoResumenDia({
  tecnico,
  parque,
  fecha,
  numeros,
  restantes,
}: {
  tecnico: string;
  parque: string;
  fecha: string; // dd/MM/yyyy
  numeros: number[]; // WTG inspeccionados (acumulado de la asignación)
  restantes: number;
}): string {
  const sangria = " ".repeat("Aerogeneradores inspeccionados: ".length);
  const lista =
    numeros.length === 0
      ? "—"
      : numeros.map((n, i) => (i === 0 ? `WTG ${n}` : `${sangria}WTG ${n}`)).join("\n");
  return [
    `Técnico: ${tecnico}`,
    `Parque: ${parque}`,
    `Fecha: ${fecha}`,
    `Aerogeneradores inspeccionados: ${lista}`,
    "",
    `Aerogeneradores Restantes: ${restantes}`,
  ].join("\n");
}
