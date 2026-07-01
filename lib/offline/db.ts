// Capa offline — IndexedDB (lib `idb`). Tres stores:
//   outbox   mutaciones pendientes de sincronizar (jornadas / eventos / asignaciones)
//   catalogo parques + aeros del parque activo (cacheados para uso offline)
//   sesion   perfil del técnico + asignación activa (cacheados)
//
// Idempotencia: cada fila lleva su `id` de cliente; el vaciado usa `upsert`
// (on conflict id), así reintentar no duplica. Nunca se borra de `outbox` hasta
// confirmar la escritura en Supabase.

import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export const DB_NOMBRE = "iner-checkin";
export const DB_VERSION = 1;

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

interface CheckinDB extends DBSchema {
  outbox: { key: string; value: OutboxItem; indexes: { by_seq: number } };
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
        if (!db.objectStoreNames.contains("catalogo")) db.createObjectStore("catalogo");
        if (!db.objectStoreNames.contains("sesion")) db.createObjectStore("sesion");
      },
    });
  }
  return dbPromise;
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
  const db = await abrirDB();
  const existente = await db.get("outbox", item.id);
  if (existente && !sobrescribir) return;
  await db.put("outbox", {
    ...item,
    seq: existente?.seq ?? siguienteSeq(),
    creado_ts: new Date().toISOString(),
  });
}

/** Ítems pendientes, en orden de creación. */
export async function outboxOrdenado(): Promise<OutboxItem[]> {
  const db = await abrirDB();
  return db.getAllFromIndex("outbox", "by_seq");
}

export async function outboxBorrar(id: string): Promise<void> {
  const db = await abrirDB();
  await db.delete("outbox", id);
}

export async function outboxExiste(id: string): Promise<boolean> {
  const db = await abrirDB();
  return (await db.getKey("outbox", id)) !== undefined;
}

/** Cantidad de mutaciones pendientes de sincronizar. */
export async function pendientes(): Promise<number> {
  const db = await abrirDB();
  return db.count("outbox");
}

// ---------- Cache genérico (catalogo / sesion) ----------

export async function cacheSet(
  store: "catalogo" | "sesion",
  key: string,
  value: unknown,
): Promise<void> {
  const db = await abrirDB();
  await db.put(store, value, key);
}

export async function cacheGet<T>(
  store: "catalogo" | "sesion",
  key: string,
): Promise<T | undefined> {
  const db = await abrirDB();
  return (await db.get(store, key)) as T | undefined;
}
