// Aviso de prueba: el técnico con `recibe_avisos` se manda una notificación a sí
// mismo desde la app, para confirmar que llega con la pantalla bloqueada.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarAviso } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  let supabase;
  let user;
  try {
    supabase = await createClient();
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    return NextResponse.json({ error: "auth-unavailable" }, { status: 503 });
  }
  if (!user) return NextResponse.json({ error: "no-auth" }, { status: 401 });

  const { data: tecnico } = await supabase
    .from("tecnicos")
    .select("recibe_avisos")
    .eq("id", user.id)
    .maybeSingle();
  if (!tecnico?.recibe_avisos) {
    return NextResponse.json({ error: "sin-permiso" }, { status: 403 });
  }

  try {
    const r = await enviarAviso([user.id], {
      title: "Avisos activos",
      body: "Así te llegarán las entradas a parque y las primeras turbinas.",
      tag: "prueba",
    });
    if (r.enviados === 0) return NextResponse.json({ error: "sin-dispositivo", ...r }, { status: 404 });
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    console.error("[avisos/prueba] fallo envío", error);
    return NextResponse.json({ error: "envio" }, { status: 502 });
  }
}
