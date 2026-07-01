// Alta reproducible de técnicos: crea la cuenta en Supabase Auth
// (usuario@checkin.iner, email_confirm sí) + la fila en public.tecnicos.
//
// Uso:
//   1) Copiá scripts/tecnicos.example.json → scripts/tecnicos.json y completá la lista.
//   2) node --env-file=.env.local scripts/crear-tecnicos.mjs
//
// Requiere en el entorno: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// Idempotente: si el usuario ya existe, reusa su id y actualiza el perfil (no duplica).

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
      "Corré:  node --env-file=.env.local scripts/crear-tecnicos.mjs",
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

let creados = 0;
let actualizados = 0;
let fallidos = 0;
const generadas = []; // {usuario, password} de cuentas nuevas con clave autogenerada

for (const t of tecnicos) {
  const { usuario, nombre, subtipo, pais, equipo_id } = t;
  if (!usuario) {
    console.error("✗ (sin usuario) — falta 'usuario', se saltea.");
    fallidos++;
    continue;
  }
  const password = t.password || generarPassword();
  const passwordGenerada = !t.password;
  const email = usuarioAEmail(usuario);

  try {
    let id;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { usuario },
    });
    if (error) {
      // Ya existe: reusar su id y actualizar el perfil.
      if (/registered|exist/i.test(error.message)) {
        id = await buscarIdPorEmail(email);
        if (!id) throw new Error(`existe pero no lo encontré: ${error.message}`);
      } else {
        throw error;
      }
    } else {
      id = data.user.id;
    }

    const { error: perfilError } = await supabase.from("tecnicos").upsert(
      {
        id,
        usuario: String(usuario).trim().toLowerCase(),
        nombre: nombre ?? usuario,
        subtipo: subtipo ?? null,
        pais: pais ?? null,
        equipo_id: equipo_id ?? null,
      },
      { onConflict: "id" },
    );
    if (perfilError) throw perfilError;

    if (data?.user) {
      console.log(`✓ creado    ${usuario} (${email})`);
      creados++;
      if (passwordGenerada) generadas.push({ usuario, password });
    } else {
      console.log(`↻ actualizado ${usuario} (${email})`);
      actualizados++;
    }
  } catch (err) {
    console.error(`✗ ${usuario} — ${err.message ?? err}`);
    fallidos++;
  }
}

if (generadas.length > 0) {
  console.log("\n== Contraseñas temporales generadas (repartir y luego cambiar) ==");
  for (const g of generadas) console.log(`   ${g.usuario.padEnd(20)} ${g.password}`);
}

console.log(`\nListo. Creados: ${creados} · Actualizados: ${actualizados} · Fallidos: ${fallidos}`);
process.exit(fallidos > 0 ? 1 : 0);
