// Vaciado de la cola offline a Supabase. Se dispara al reconectar (ver
// OfflineSync). Vacía la outbox en orden (jornada antes que sus eventos) con
// upsert idempotente (on conflict id); borra de la cola solo al confirmar.
// Después sube las fotos de evidencia a Storage (bucket `evidencias`), solo
// las de eventos que ya salieron de la outbox.

import { createClient } from "@/lib/supabase/client";
import {
  fotoBorrar,
  fotoPalaBorrar,
  fotosPendientes,
  fotosPalasPendientes,
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
let syncSolicitado = false;

/** ¿Hay conectividad? Base para disparar el sync. */
export function estaOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export async function sync(): Promise<SyncResultado> {
  if (enCurso) {
    // registrarEvento() puede disparar un sync antes de que el componente
    // termine de encolar las fotos de palas. Conserva la solicitud para correr
    // otra pasada cuando termine la sincronización actual.
    syncSolicitado = true;
    return { enviados: 0, pendientes: await pendientes() };
  }
  if (!estaOnline()) return { enviados: 0, pendientes: await pendientes() };

  const items = await outboxOrdenado();
  const fotos = await fotosPendientes();
  const fotosPalas = await fotosPalasPendientes();
  if (items.length === 0 && fotos.length === 0 && fotosPalas.length === 0) {
    return { enviados: 0, pendientes: 0 };
  }

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

    // Fotos BSN/ROOT del inspector interno. El evento de salida es la barrera:
    // si aún está en la outbox, la foto no se sube para evitar dejar evidencia
    // en Drive sin el evento correspondiente. El endpoint vuelve a validar
    // sesión y subtipo interno, y Drive hace upsert por nombre.
    for (const foto of fotosPalas) {
      if (await outboxExiste(foto.evento_id)) continue;
      try {
        const form = new FormData();
        form.append("foto", foto.blob, `${foto.id}.jpg`);
        form.append("parque_id", foto.parque_id);
        form.append("wtg", String(foto.wtg));
        form.append("pala", foto.pala);
        form.append("tipo", foto.tipo);

        const res = await fetch("/api/subir-foto", { method: "POST", body: form });
        if (!res.ok) {
          let detalle = `HTTP ${res.status}`;
          try {
            const body = (await res.json()) as { error?: string; detalle?: string };
            detalle = body.detalle ?? body.error ?? detalle;
          } catch {
            // Conserva el estado HTTP si la respuesta no es JSON.
          }
          return { enviados, pendientes: await pendientes(), error: detalle };
        }
        await fotoPalaBorrar(foto.id);
        enviados++;
      } catch {
        // Fallo de red/endpoint: conserva la foto para el siguiente reintento.
        break;
      }
    }
  } finally {
    enCurso = false;
    if (syncSolicitado) {
      syncSolicitado = false;
      queueMicrotask(() => void sync());
    }
  }

  return { enviados, pendientes: await pendientes() };
}
