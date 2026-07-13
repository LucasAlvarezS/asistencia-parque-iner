// Clima (viento + ráfagas) para el check-in. Fuente: Open-Meteo (API libre, sin
// key, con CORS abierto → se llama directo desde el cliente). El último dato se
// cachea en IndexedDB (store `catalogo`) para mostrarlo offline con su hora.

import { cacheGet, cacheSet } from "./offline/db";

export interface ClimaHora {
  hora: string; // "HH:MM" en la TZ del parque
  viento: number; // m/s
  rafaga: number; // m/s
}

export interface Clima {
  actualizado: string; // ISO del momento de fetch (para "dato de las HH:MM")
  viento: number; // m/s a 10 m
  rafaga: number; // m/s a 10 m
  direccion: number; // grados (0 = N)
  horas: ClimaHora[]; // desde la hora actual, próximas horas del día
}

// Umbral de realce (solo color ámbar, sin lógica de negocio). ~50 km/h en m/s.
export const RAFAGA_ALTA_MS = 14;

/** Redondeo a 1 decimal (m/s se muestra con decimales). */
const r1 = (x: number) => Math.round(x * 10) / 10;

const ROSA = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
];

/** Grados → punto cardinal (rosa de 16). */
export function rosaDeLosVientos(grados: number): string {
  return ROSA[Math.round(grados / 22.5) % 16] ?? "—";
}

/** ¿Hay conexión? (mismo criterio que lib/offline/sync.ts). */
export function estaOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

const claveCache = (lat: number, lon: number) =>
  `clima:${lat.toFixed(3)},${lon.toFixed(3)}`;

/** Último clima cacheado para ese parque (o null). */
export async function leerClimaCache(lat: number, lon: number): Promise<Clima | null> {
  return (await cacheGet<Clima>("catalogo", claveCache(lat, lon))) ?? null;
}

/** Consulta Open-Meteo, cachea y devuelve el clima. Requiere conexión. */
export async function fetchClima(lat: number, lon: number, tz: string): Promise<Clima> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "wind_speed_10m,wind_gusts_10m,wind_direction_10m");
  url.searchParams.set("hourly", "wind_speed_10m,wind_gusts_10m");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", tz);
  url.searchParams.set("forecast_days", "1");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
  const j = (await res.json()) as {
    current?: {
      time?: string;
      wind_speed_10m?: number;
      wind_gusts_10m?: number;
      wind_direction_10m?: number;
    };
    hourly?: { time?: string[]; wind_speed_10m?: number[]; wind_gusts_10m?: number[] };
  };

  const cur = j.current ?? {};
  const h = j.hourly ?? {};
  const times = h.time ?? [];
  const vel = h.wind_speed_10m ?? [];
  const raf = h.wind_gusts_10m ?? [];
  const horaActual = (cur.time ?? "").slice(0, 13); // "YYYY-MM-DDTHH"

  const horas: ClimaHora[] = times
    .map((t, i) => ({ t, viento: r1(vel[i] ?? 0), rafaga: r1(raf[i] ?? 0) }))
    .filter((x) => x.t.slice(0, 13) >= horaActual) // de la hora actual en adelante
    .slice(0, 8)
    .map((x) => ({ hora: x.t.slice(11, 16), viento: x.viento, rafaga: x.rafaga }));

  const clima: Clima = {
    actualizado: new Date().toISOString(),
    viento: r1(cur.wind_speed_10m ?? 0),
    rafaga: r1(cur.wind_gusts_10m ?? 0),
    direccion: Math.round(cur.wind_direction_10m ?? 0),
    horas,
  };
  await cacheSet("catalogo", claveCache(lat, lon), clima);
  return clima;
}
