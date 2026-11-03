// Webhook que llama el trigger `avisar_jefe` (migración 0044, vía pg_net) cuando
// un operador registra su entrada al parque o su primera turbina del día. Arma
// el texto y lo envía como push a los técnicos con `recibe_avisos` (piloto:
// Tomás Caballero), excepto al propio autor del evento.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarAviso } from "@/lib/push";

export const runtime = "nodejs";

// Si el evento llegó a la base más de esto después de ocurrir (trabajo offline),
// el aviso lo aclara para que no se lea como algo recién pasado.
const RETRASO_AVISO_MIN = 15;

function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.AVISOS_SECRET;
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hora(ts: string, tz: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

export async function POST(req: Request): Promise<Response> {
  if (!secretoValido(req.headers.get("x-avisos-secret"))) {
    return NextResponse.json({ error: "no-auth" }, { status: 401 });
  }

  let body: { evento_id?: string; tipo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json-invalido" }, { status: 400 });
  }
  const tipo = body.tipo;
  if (!body.evento_id || (tipo !== "entrada_parque" && tipo !== "primera_wtg")) {
    return NextResponse.json({ error: "datos-invalidos" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("eventos")
    .select("id, jornada_id, ts_dispositivo, ts_servidor, maquina_id, anulado")
    .eq("id", body.evento_id)
    .maybeSingle();
  if (!ev || ev.anulado) return NextResponse.json({ ok: true, omitido: "sin-evento" });

  const { data: jornada } = await admin
    .from("jornadas")
    .select("tecnico_id, parque_id")
    .eq("id", ev.jornada_id)
    .maybeSingle();
  if (!jornada) return NextResponse.json({ ok: true, omitido: "sin-jornada" });

  const [{ data: tecnico }, { data: parque }, { data: aero }, { data: jefes }] = await Promise.all([
    admin.from("tecnicos").select("nombre, usuario").eq("id", jornada.tecnico_id).maybeSingle(),
    admin.from("parques").select("nombre, pais").eq("id", jornada.parque_id).maybeSingle(),
    ev.maquina_id
      ? admin.from("aeros").select("numero, nombre").eq("id", ev.maquina_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("tecnicos").select("id").eq("recibe_avisos", true).eq("activo", true),
  ]);

  const destinatarios = (jefes ?? []).map((j) => j.id).filter((id) => id !== jornada.tecnico_id);
  if (destinatarios.length === 0) return NextResponse.json({ ok: true, omitido: "sin-destinatarios" });

  const { data: pais } = parque?.pais
    ? await admin.from("paises").select("tz").eq("id", parque.pais).maybeSingle()
    : { data: null };
  const tz = pais?.tz ?? "America/Argentina/Buenos_Aires";

  const operador = tecnico?.nombre ?? tecnico?.usuario ?? "Un operador";
  const nombreParque = parque?.nombre ?? jornada.parque_id;
  const wtg = aero ? (aero.nombre ?? `WTG ${aero.numero}`) : "una turbina";

  const title =
    tipo === "entrada_parque" ? `${operador} ingresó al parque` : `${operador} inició ${wtg}`;
  let texto = `${nombreParque} · ${hora(ev.ts_dispositivo, tz)}`;
  const retrasoMin =
    (new Date(ev.ts_servidor).getTime() - new Date(ev.ts_dispositivo).getTime()) / 60000;
  if (retrasoMin > RETRASO_AVISO_MIN) {
    texto += ` · registrado sin señal, llegó ${hora(ev.ts_servidor, tz)}`;
  }

  try {
    const r = await enviarAviso(destinatarios, {
      title,
      body: texto,
      tag: `${ev.jornada_id}:${tipo}`,
      url: "/",
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    console.error("[avisos] fallo envío", error);
    return NextResponse.json({ error: "envio" }, { status: 502 });
  }
}
