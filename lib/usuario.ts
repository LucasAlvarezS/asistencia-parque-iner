// El técnico entra con un NOMBRE DE USUARIO (ej. "carlos.naretto"), no un correo.
// Supabase Auth identifica cada cuenta con un email, pero NO necesita ser real ni
// existir (con "Confirm email" apagado en Supabase). Por eso mapeamos el usuario a
// un email sintético con un dominio interno fijo, oculto al técnico.
//
// Al crear la cuenta en Supabase se usa el mismo patrón: `carlos.naretto@checkin.iner`.

export const USUARIO_DOMINIO = "checkin.iner";

/** Normaliza el usuario y lo convierte al email sintético para Supabase Auth. */
export function usuarioAEmail(usuario: string): string {
  const u = usuario.trim().toLowerCase();
  if (!u) return u;
  // Si por costumbre alguien escribe el email completo, se respeta.
  return u.includes("@") ? u : `${u}@${USUARIO_DOMINIO}`;
}

/** Extrae el nombre de usuario desde el email sintético (para mostrarlo). */
export function emailAUsuario(email: string): string {
  return email.split("@")[0] || email;
}
