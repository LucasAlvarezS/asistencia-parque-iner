// Herramientas de solo lectura compartidas por el servidor MCP (app/api/mcp) y el
// chat de la app (app/api/chat). Toda consulta pasa por lib/mcp/consulta.ts.

import {
  consultarSql,
  describirEsquema,
  resumenDia,
  resumenFac,
} from "@/lib/mcp/consulta";

const FECHA = { type: "string", description: "Fecha AAAA-MM-DD" };
const SOLO_LECTURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export const HERRAMIENTAS = [
  {
    name: "describir_esquema",
    description:
      "Lista las vistas consultables (chat_*), sus columnas y las reglas de negocio. Llámala primero si dudas de cómo contar turbinas, jornadas o standby.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Esquema y reglas", ...SOLO_LECTURA },
  },
  {
    name: "consultar_sql",
    description:
      "Ejecuta UNA consulta SELECT (PostgreSQL) sobre las vistas chat_jornadas, chat_eventos, chat_visitas, chat_turbinas, chat_standbys y chat_parques. Máximo 200 filas. Solo lectura.",
    inputSchema: {
      type: "object",
      properties: { sql: { type: "string", description: "Consulta SELECT o WITH...SELECT" } },
      required: ["sql"],
      additionalProperties: false,
    },
    annotations: { title: "Consulta SQL", ...SOLO_LECTURA },
  },
  {
    name: "resumen_dia",
    description:
      "Resumen del día de VESTAS Argentina: por operador y parque, turbinas inspeccionadas (primera inspección), reinspecciones y si la jornada sigue abierta (conteo parcial).",
    inputSchema: {
      type: "object",
      properties: { fecha: FECHA },
      required: ["fecha"],
      additionalProperties: false,
    },
    annotations: { title: "Resumen del día", ...SOLO_LECTURA },
  },
  {
    name: "resumen_fac",
    description:
      "Resumen FAC semanal de VESTAS Argentina (sin Arauco ni Chile): por parque, total, inspeccionadas, pendientes, semana anterior y turbinas por día lunes a sábado. Pasa el LUNES de la semana.",
    inputSchema: {
      type: "object",
      properties: { lunes: { type: "string", description: "Lunes de la semana, AAAA-MM-DD" } },
      required: ["lunes"],
      additionalProperties: false,
    },
    annotations: { title: "Resumen FAC", ...SOLO_LECTURA },
  },
] as const;

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function textoResultado(filas: unknown[], truncado: boolean): string {
  const nota = truncado ? "\n(Resultado truncado a 200 filas; acota la consulta.)" : "";
  return JSON.stringify({ filas: filas.length, datos: filas }, null, 0) + nota;
}

export async function llamarHerramienta(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "describir_esquema":
      return describirEsquema();
    case "consultar_sql": {
      const r = await consultarSql(String(args.sql ?? ""));
      return textoResultado(r.filas, r.truncado);
    }
    case "resumen_dia": {
      const f = String(args.fecha ?? "");
      if (!RE_FECHA.test(f)) throw new Error("fecha debe ser AAAA-MM-DD");
      const r = await resumenDia(f);
      return textoResultado(r.filas, r.truncado);
    }
    case "resumen_fac": {
      const f = String(args.lunes ?? "");
      if (!RE_FECHA.test(f)) throw new Error("lunes debe ser AAAA-MM-DD");
      if (new Date(`${f}T00:00:00Z`).getUTCDay() !== 1) throw new Error("la fecha no es lunes");
      const r = await resumenFac(f);
      return textoResultado(r.filas, r.truncado);
    }
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}

