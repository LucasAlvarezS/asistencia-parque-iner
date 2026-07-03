// Vaciado de la cola offline a Supabase. Se dispara al reconectar (ver
// OfflineSync). Vacía la outbox en orden (jornada antes que sus eventos) con
// upsert idempotente (on conflict id); borra de la cola solo al confirmar.
// Después sube las fotos de evidencia a Storage (bucket `evidencias`), solo
// las de eventos que ya salieron de la outbox.

import { createClient } from "@/lib/supabase/client";
import {
  fotoBorrar,
  fotosPendientes,
  outboxBorrar,
  outboxExiste,
  outboxOrdenado,
  pendientes,
} from "./db";

export interface SyncResultado {
  enviados: number;
  pendientes: number;
  error?: string;
}

let enCurso = false;

/** ¿Hay conectividad? Base para disparar el sync. */
export function estaOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export async function sync(): Promise<SyncResultado> {
  if (enCurso || !estaOnline()) return { enviados: 0, pendientes: await pendientes() };

  const items = await outboxOrdenado();
  const fotos = await fotosPendientes();
  if (items.length === 0 && fotos.length === 0) return { enviados: 0, pendientes: 0 };

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  // Sin sesión no se puede escribir (RLS por auth.uid()); se reintenta tras login.
  if (!session) {
    return { enviados: 0, pendientes: await pendientes(), error: "sin-sesion" };
  }

  enCurso = true;
  let enviados = 0;
  try {
    for (const item of items) {
      try {
        const { error } = await supabase
          .from(item.tabla)
          .upsert(item.payload, { onConflict: item.onConflict });
        if (error) {
          // Error de validación/RLS: no se arregla reintentando ya mismo. Se corta
          // y se reintenta luego (evita loops). La cola conserva el ítem.
          return { enviados, pendientes: await pendientes(), error: error.message };
        }
        await outboxBorrar(item.id);
        enviados++;
      } catch {
        // Fallo de red: cortar y reintentar más tarde. La cola nunca se pierde.
        break;
      }
    }

    // Fotos de evidencia: recién cuando su evento ya está en Supabase (si el
    // evento sigue encolado, se saltea para no dejar evidencia huérfana).
    for (const foto of fotos) {
      if (await outboxExiste(foto.evento_id)) continue;
      try {
        const { error } = await supabase.storage
          .from("evidencias")
          .upload(foto.path, foto.blob, { upsert: true, contentType: "image/jpeg" });
        if (error) {
          return { enviados, pendientes: await pendientes(), error: error.message };
        }
        await fotoBorrar(foto.evento_id);
        enviados++;
      } catch {
        break; // fallo de red: reintentar más tarde
      }
    }
  } finally {
    enCurso = false;
  }

  return { enviados, pendientes: await pendientes() };
}
