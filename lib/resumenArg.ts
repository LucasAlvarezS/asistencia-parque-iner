// "Resumen Arg": texto diario de VESTAS AR que envía el técnico jefe.
// Las filas las calcula la función `resumen_arg(fecha)` de la base (0045).

export interface FilaResumenArg {
  grupo_clave: string;
  operador: string | null;
  parque: string;
  interna: boolean;
  inspeccionadas: number;
  reinspecciones: number;
  jornada_abierta: boolean;
}

/** YYYY-MM-DD → DD/MM/YYYY. */
export const fechaDMY = (f: string): string =>
  `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

/** Fecha local del dispositivo como YYYY-MM-DD. */
export function hoyYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Suma `dias` a una fecha YYYY-MM-DD (por componentes, sin correr por zona horaria). */
export function sumarDias(f: string, dias: number): string {
  const [y, m, d] = f.split("-").map(Number);
  const x = new Date(y, m - 1, d + dias);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/**
 * Resumen Arg 03/11/2026
 *
 * Franco Battaglia
 * PE OLAVARRIA
 * Turbinas inspeccionadas: 6
 *
 * Carlos y Xavier
 * PE PEPE VI (interna)
 * Turbinas inspeccionadas: 0
 *
 * Las reinspecciones suman al total y se detallan entre paréntesis:
 * "Turbinas inspeccionadas: 8 (reinspección: 2)".
 */
export function textoResumenArg(fecha: string, filas: FilaResumenArg[]): string {
  const bloques = filas.map((f) => {
    const total = f.inspeccionadas + f.reinspecciones;
    const reinsp = f.reinspecciones > 0 ? ` (reinspección: ${f.reinspecciones})` : "";
    return [
      f.operador ?? "—",
      `${f.parque}${f.interna ? " (interna)" : ""}`,
      `Turbinas inspeccionadas: ${total}${reinsp}`,
    ].join("\n");
  });
  return [`Resumen Arg ${fechaDMY(fecha)}`, ...bloques].join("\n\n");
}
