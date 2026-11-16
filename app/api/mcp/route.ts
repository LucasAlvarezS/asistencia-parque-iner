// Servidor MCP (Streamable HTTP, sin estado) de SOLO LECTURA para consultas en
// lenguaje natural desde ChatGPT/Claude. Ver lib/mcp/consulta.ts y la migración
// 0047_chat_mcp.sql. Autenticación: secreto MCP_SECRET en `Authorization: Bearer`
// o en `?key=` (algunos clientes no permiten cabeceras personalizadas).

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { HERRAMIENTAS, llamarHerramienta } from "@/lib/mcp/herramientas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSIONES = ["2025-06-18", "2025-03-26", "2024-11-05"];

function secretoValido(req: Request): boolean {
  const esperado = process.env.MCP_SECRET;
  if (!esperado) return false;
  const auth = req.headers.get("authorization") ?? "";
  const recibido = auth.startsWith("Bearer ")
    ? auth.slice(7)
    : new URL(req.url).searchParams.get("key");
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function manejar(msg: Rpc): Promise<Record<string, unknown> | null> {
  const id = msg.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

  if (msg.id === undefined) return null; // notificación (p. ej. notifications/initialized)

  switch (msg.method) {
    case "initialize": {
      const pedida = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: {} },
        serverInfo: { name: "iner-checkin-lectura", version: "1.0.0" },
        instructions:
          "Datos de INER Check-in (parques eólicos). Solo lectura. Llama describir_esquema antes de escribir SQL.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: HERRAMIENTAS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const text = await llamarHerramienta(name, args);
        return ok({ content: [{ type: "text", text }] });
      } catch (e) {
        const m = e instanceof Error ? e.message : "error";
        return ok({ isError: true, content: [{ type: "text", text: `Error: ${m}` }] });
      }
    }
    default:
      return err(-32601, `Método no soportado: ${msg.method}`);
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!secretoValido(req)) return NextResponse.json({ error: "no-auth" }, { status: 401 });

  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } },
      { status: 400 },
    );
  }

  if (Array.isArray(body)) {
    const res = (await Promise.all(body.map(manejar))).filter((r) => r !== null);
    return res.length ? NextResponse.json(res) : new Response(null, { status: 202 });
  }
  const res = await manejar(body);
  return res ? NextResponse.json(res) : new Response(null, { status: 202 });
}

// Streamable HTTP sin sesiones ni streams del servidor.
export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
