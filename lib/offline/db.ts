// Capa offline — IndexedDB (lib `idb`). Cuatro stores:
//   outbox   mutaciones pendientes de sincronizar (jornadas / eventos / asignaciones)
//   fotos    evidencias JPEG pendientes de subir a Storage (blob por evento)
//   catalogo parques + aeros del parque activo (cacheados para uso offline)
//   sesion   perfil del técnico + asignación activa (cacheados)
//
// Idempotencia: cada fila lleva su `id` de cliente; el vaciado usa `upsert`
// (on conflict id), así reintentar no duplica. Nunca se borra de `outbox` hasta
// confirmar la escritura en Supabase.

import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export const DB_NOMBRE = "iner-checkin";
export const DB_VERSION = 2;

export type Tabla = "asignaciones" | "jornadas" | "eventos";

/** Una mutación encolada. `seq` da orden monótono de vaciado. */
export interface OutboxItem {
  id: string; // uuid (eventos) · jornadaId (jornadas) · asignacionId (asignaciones)
  seq: number;
  tabla: Tabla;
  onConflict: string; // columna(s) de conflicto para el upsert (ej. "id")
  payload: Record<string, unknown>;
  creado_ts: string;
}

/** Evidencia pendiente de subir a Supabase Storage (bucket `evidencias`).
 *  Se sube en sync() DESPUÉS de que su evento salió de la outbox. */
export interface FotoPendiente {
  evento_id: string; // = eventos.id (key del store)
  path: string; // "{tecnico_id}/{evento_id}.jpg" dentro del bucket
  blob: Blob; // JPEG ya comprimido (IndexedDB serializa Blobs nativamente)
  creado_ts: string;
}

interface CheckinDB extends DBSchema {
  outbox: { key: string; value: OutboxItem; indexes: { by_seq: number } };
  fotos: { key: string; value: FotoPendiente };
  catalogo: { key: string; value: unknown };
  sesion: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<CheckinDB>> | null = null;

export function abrirDB(): Promise<IDBPDatabase<CheckinDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CheckinDB>(DB_NOMBRE, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("outbox")) {
          const outbox = db.createObjectStore("outbox", { keyPath: "id" });
          outbox.createIndex("by_seq", "seq");
        }
        if (!db.objectStoreNames.contains("fotos")) {
          db.createObjectStore("fotos", { keyPath: "evento_id" });
        }
        if (!db.objectStoreNames.contains("catalogo")) db.createObjectStore("catalogo");
        if (!db.objectStoreNames.contains("sesion")) db.createObjectStore("sesion");
      },
      // El navegador puede cerrar la conexión de forma anómala (app en segundo
      // plano en el celular, `versionchange` desde otra pestaña, presión de
      // memoria). La promesa cacheada queda inservible y toda transacción falla
      // con "The database connection is closing". Reseteamos el cache para que la
      // próxima abrirDB() reabra una conexión fresca.
      terminated() {
        dbPromise = null;
      },
    });
    // Si la apertura misma falla, no dejar cacheada una promesa rechazada.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** Corre una operación contra la base y, si la conexión se estaba cerrando
 *  (error típico al volver de segundo plano en el celular), la reabre y reintenta
 *  UNA vez. Evita perder la mutación del operador por una conexión muerta. */
async function conDB<T>(fn: (db: IDBPDatabase<CheckinDB>) => Promise<T>): Promise<T> {
  try {
    return await fn(await abrirDB());
  } catch (err) {
    const cerrando =
      err instanceof DOMException &&
      (err.name === "InvalidStateError" || /clos(ing|ed)/i.test(err.message));
    if (!cerrando) throw err;
    dbPromise = null; // fuerza reapertura de una conexión fresca
    return fn(await abrirDB());
  }
}

// Secuencia monótona para ordenar el vaciado (jornada antes que sus eventos).
let contador = 0;
function siguienteSeq(): number {
  return Date.now() * 1000 + (contador++ % 1000);
}

/** Encola una mutación. Si `id` ya existe (p.ej. la jornada del día), la conserva
 *  con su `seq` original salvo `sobrescribir` (para updates como finalizar). */
export async function encolar(
  item: Omit<OutboxItem, "seq" | "creado_ts">,
  sobrescribir = false,
): Promise<void> {
  return conDB(async (db) => {
    const existente = await db.get("outbox", item.id);
    if (existente && !sobrescribir) return;
    await db.put("outbox", {
      ...item,
      seq: existente?.seq ?? siguienteSeq(),
      creado_ts: new Date().toISOString(),
    });
  });
}

/** Ítems pendientes, en orden de creación. */
export async function outboxOrdenado(): Promise<OutboxItem[]> {
  return conDB((db) => db.getAllFromIndex("outbox", "by_seq"));
}

export async function outboxBorrar(id: string): Promise<void> {
  return conDB(async (db) => {
    await db.delete("outbox", id);
  });
}

export async function outboxExiste(id: string): Promise<boolean> {
  return conDB(async (db) => (await db.getKey("outbox", id)) !== undefined);
}

/** Cantidad de mutaciones pendientes de sincronizar (eventos + fotos). */
export async function pendientes(): Promise<number> {
  return conDB(async (db) => (await db.count("outbox")) + (await db.count("fotos")));
}

// ---------- Fotos de evidencia pendientes ----------

export async function fotoEncolar(foto: FotoPendiente): Promise<void> {
  return conDB(async (db) => {
    await db.put("fotos", foto);
  });
}

export async function fotosPendientes(): Promise<FotoPendiente[]> {
  return conDB((db) => db.getAll("fotos"));
}

export async function fotoBorrar(eventoId: string): Promise<void> {
  return conDB(async (db) => {
    await db.delete("fotos", eventoId);
  });
}

// ---------- Cache genérico (catalogo / sesion) ----------

export async function cacheSet(
  store: "catalogo" | "sesion",
  key: string,
  value: unknown,
): Promise<void> {
  return conDB(async (db) => {
    await db.put(store, value, key);
  });
}

export async function cacheGet<T>(
  store: "catalogo" | "sesion",
  key: string,
): Promise<T | undefined> {
  return conDB(async (db) => (await db.get(store, key)) as T | undefined);
}
