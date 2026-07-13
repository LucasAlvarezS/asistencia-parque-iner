"use client";

// Chip compacto de viento/ráfaga del parque activo, arriba del check-in. Muestra
// el dato apenas se entra al parque y es tocable para abrir el panel completo.
// Se renderiza solo si el perfil tiene ver_clima (lo decide CheckIn) y el parque
// tiene coordenadas. Reusa lib/clima.ts (fetch + cache offline).

import { useCallback, useEffect, useState } from "react";
import {
  type Clima,
  RAFAGA_ALTA_MS,
  estaOnline,
  fetchClima,
  leerClimaCache,
} from "@/lib/clima";
import { leerAsignacion } from "@/lib/offline/sesion";
import { IconViento } from "./icons";

export function ClimaChip({ onVer }: { onVer: () => void }) {
  const [coords, setCoords] = useState<{ lat: number; lon: number; tz: string } | null>(null);
  const [clima, setClima] = useState<Clima | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const a = await leerAsignacion();
    if (!a || a.lat == null || a.lon == null) {
      setCoords(null);
      setCargando(false);
      return;
    }
    setCoords({ lat: a.lat, lon: a.lon, tz: a.tz });
    setCargando(true);
    if (estaOnline()) {
      try {
        setClima(await fetchClima(a.lat, a.lon, a.tz));
        setCargando(false);
        return;
      } catch {
        // cae al cache
      }
    }
    setClima(await leerClimaCache(a.lat, a.lon));
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
    const onOnline = () => void cargar();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [cargar]);

  // Sin coordenadas del parque → no se muestra nada (no ensucia la vista).
  if (!coords) return null;

  const alta = clima != null && clima.rafaga >= RAFAGA_ALTA_MS;
  const texto = cargando
    ? "Consultando viento…"
    : clima
      ? `${clima.viento} m/s · ráfagas ${clima.rafaga} m/s`
      : "Clima no disponible";

  return (
    <button
      type="button"
      onClick={onVer}
      aria-label="Ver clima del parque"
      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition ${
        alta
          ? "border-iner-amber bg-iner-amber-50 text-[#9a6200] hover:bg-iner-amber/20"
          : "border-iner-green/25 bg-iner-green-50 text-iner-green hover:bg-iner-green/10"
      }`}
    >
      <span className="flex items-center gap-2">
        <IconViento size={18} className="shrink-0" />
        {texto}
        {alta && <span className="text-xs font-bold">· viento fuerte</span>}
      </span>
      <span className="text-xs opacity-70">ver ›</span>
    </button>
  );
}
