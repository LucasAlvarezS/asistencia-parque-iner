// Reset de contraseñas de técnicos ya existentes en Supabase Auth.
// Para cada usuario de scripts/tecnicos.json: busca su cuenta por email
// (usuario@checkin.iner) y le setea una contraseña nueva. Si el técnico trae
// `password` no nulo en el JSON, usa esa; si está en null, genera una temporal
// (`Iner-xxxxxx`) y la imprime al final para repartir.
//
// Uso:
//   node --env-file=.env scripts/reset-passwords.mjs            (todos)
//   node --env-file=.env scripts/reset-passwords.mjs matias.ramos carlos.naretto
//
// Requiere en el entorno: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// No modifica el perfil (public.tecnicos), solo la contraseña de Auth. Idempotente.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const USUARIO_DOMINIO = "checkin.iner";
const usuarioAEmail = (u) => {
  const s = String(u).trim().toLowerCase();
  return s.includes("@") ? s : `${s}@${USUARIO_DOMINIO}`;
};

// Contraseña temporal legible (sin caracteres ambiguos), fácil de tipear en el celular.
const ALFA = "abcdefghijkmnpqrstuvwxyz23456789";
function generarPassword() {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFA[randomInt(ALFA.length)];
  return `Iner-${s}`;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Corré:  node --env-file=.env scripts/reset-passwords.mjs",
  );
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
let tecnicos;
try {
  tecnicos = JSON.parse(readFileSync(join(__dirname, "tecnicos.json"), "utf8"));
} catch {
  console.error(
    "No pude leer scripts/tecnicos.json. Copiá tecnicos.example.json y completá la lista.",
  );
  process.exit(1);
}
if (!Array.isArray(tecnicos) || tecnicos.length === 0) {
  console.error("tecnicos.json debe ser un arreglo con al menos un técnico.");
  process.exit(1);
}

// Filtro opcional por CLI: solo estos usuarios (normalizados). Sin args → todos.
const filtro = new Set(process.argv.slice(2).map((a) => a.trim().toLowerCase()));
if (filtro.size > 0) {
  tecnicos = tecnicos.filter((t) => filtro.has(String(t.usuario).trim().toLowerCase()));
  if (tecnicos.length === 0) {
    console.error("Ningún usuario del filtro coincide con scripts/tecnicos.json.");
    process.exit(1);
  }
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Busca el id de un usuario de Auth por email (paginando). */
async function buscarIdPorEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  return null;
}

let resueltos = 0;
let fallidos = 0;
const nuevas = []; // {usuario, password} para repartir

for (const t of tecnicos) {
  const usuario = t.usuario;
  if (!usuario) {
    console.error("✗ (sin usuario) — falta 'usuario', se saltea.");
    fallidos++;
    continue;
  }
  const email = usuarioAEmail(usuario);
  const password = t.password || generarPassword();

  try {
    const id = await buscarIdPorEmail(email);
    if (!id) {
      console.error(`✗ ${usuario} — no existe en Auth (creá la cuenta con crear-tecnicos.mjs).`);
      fallidos++;
      continue;
    }
    const { error } = await supabase.auth.admin.updateUserById(id, { password });
    if (error) throw error;

    console.log(`✓ reseteado ${usuario} (${email})`);
    nuevas.push({ usuario, password });
    resueltos++;
  } catch (err) {
    console.error(`✗ ${usuario} — ${err.message ?? err}`);
    fallidos++;
  }
}

if (nuevas.length > 0) {
  console.log("\n== Contraseñas nuevas (repartir y pedir cambio en el primer ingreso) ==");
  for (const g of nuevas) console.log(`   ${g.usuario.padEnd(20)} ${g.password}`);
}

console.log(`\nListo. Reseteados: ${resueltos} · Fallidos: ${fallidos}`);
process.exit(fallidos > 0 ? 1 : 0);
