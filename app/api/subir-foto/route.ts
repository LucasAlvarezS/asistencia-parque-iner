// Endpoint que recibe una foto de pala (BSN o ROOT) del inspector interno y la
// sube a Google Drive (carpeta del parque). Valida la sesión de Supabase y que el
// técnico sea `interno`. El blob viaja como multipart/form-data; el nombre del
// archivo se arma en el server desde `parques.nombre` (fuente de verdad).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { subirFotoDrive } from "@/lib/gdrive";

export const runtime = "nodejs";
const MAX_FOTO_BYTES = 5 * 1024 * 1024;
const TIPOS_IMAGEN = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request): Promise<Response> {
  let supabase;
  let user;
  try {
    supabase = await createClient();
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    return NextResponse.json({ error: "auth-unavailable" }, { status: 503 });
  }
  if (!user) return NextResponse.json({ error: "no-auth" }, { status: 401 });

  // Solo inspector interno.
  const { data: tecnico } = await supabase
    .from("tecnicos")
    .select("subtipo")
    .eq("id", user.id)
    .single();
  if (tecnico?.subtipo !== "interno") {
    return NextResponse.json({ error: "solo-interno" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart-invalido" }, { status: 400 });
  }
  const file = form.get("foto");
  const parqueId = String(form.get("parque_id") ?? "");
  const wtg = String(form.get("wtg") ?? "");
  const pala = String(form.get("pala") ?? "").toUpperCase();
  const tipo = String(form.get("tipo") ?? "").toLowerCase(); // "bsn" | "root"

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "sin-foto" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_FOTO_BYTES) {
    return NextResponse.json({ error: "foto-muy-grande" }, { status: 413 });
  }
  if (file.type && !TIPOS_IMAGEN.has(file.type)) {
    return NextResponse.json({ error: "tipo-imagen-invalido" }, { status: 415 });
  }
  if (!parqueId || !wtg || !["A", "B", "C"].includes(pala) || !["bsn", "root"].includes(tipo)) {
    return NextResponse.json({ error: "datos-invalidos" }, { status: 400 });
  }
  const numeroWtg = Number(wtg);
  if (!Number.isInteger(numeroWtg) || numeroWtg < 1 || numeroWtg > 9999) {
    return NextResponse.json({ error: "wtg-invalido" }, { status: 400 });
  }

  // Nombre del parque desde la base (define carpeta y nombre de archivo).
  const { data: parque } = await supabase
    .from("parques")
    .select("nombre")
    .eq("id", parqueId)
    .single();
  if (!parque?.nombre) {
    return NextResponse.json({ error: "parque-desconocido" }, { status: 400 });
  }

  const prefijo = tipo === "root" ? "ROOT " : "";
  const nombreParque = parque.nombre.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const nombreArchivo = `${prefijo}PALA ${pala} WTG${numeroWtg} ${nombreParque}.jpg`;
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const r = await subirFotoDrive({
      parqueNombre: nombreParque,
      nombreArchivo,
      bytes,
      contentType: "image/jpeg",
    });
    return NextResponse.json({ ok: true, fileId: r.fileId, link: r.webViewLink, nombre: nombreArchivo });
  } catch (error) {
    console.error("[subir-foto] fallo Drive", error);
    return NextResponse.json({ error: "drive-upload" }, { status: 502 });
  }
}
