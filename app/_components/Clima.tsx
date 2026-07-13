"use client";

// Panel de clima (viento + ráfagas) del parque activo. Acceso discreto desde el
// header del check-in (solo para perfiles con ver_clima). Online: consulta
// Open-Meteo; offline: muestra el último dato cacheado con su hora. No toca el
// flujo del check-in (overlay ortogonal, patrón de Jornadas).

import { useCallback, useEffect, useState } from "react";
import {
  type Clima,
  RAFAGA_ALTA_MS,
  estaOnline,
  fetchClima,
  leerClimaCache,
  rosaDeLosVientos,
} from "@/lib/clima";
import { type AsignacionCache, leerAsignacion } from "@/lib/offline/sesion";
import { IconViento } from "./icons";

type Estado = "cargando" | "sin-coords" | "offline" | "error" | "ok";

const horaCorta = (iso: string): string =>
  new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

export function Clima({ onBack }: { onBack: () => void }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [clima, setClima] = useState<Clima | null>(null);
  const [desdeCache, setDesdeCache] = useState(false);
  const [asignacion, setAsignacion] = useState<AsignacionCache | null>(null);

  const cargar = useCallback(async () => {
    const a = (await leerAsignacion()) ?? null;
    setAsignacion(a);
    if (!a || a.lat == null || a.lon == null) {
      setEstado("sin-coords");
      return;
    }
    if (estaOnline()) {
      setEstado("cargando");
      try {
        setClima(await fetchClima(a.lat, a.lon, a.tz));
        setDesdeCache(false);
        setEstado("ok");
        return;
      } catch {
        // cae al cache de abajo
      }
    }
    const cache = await leerClimaCache(a.lat, a.lon);
    if (cache) {
      setClima(cache);
      setDesdeCache(true);
      setEstado("ok");
    } else {
      setEstado(estaOnline() ? "error" : "offline");
    }
  }, []);

  useEffect(() => {
    void cargar();
    const onOnline = () => void cargar();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [cargar]);

  return (
    <main className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-iner-green px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-white/60">Clima del parque</p>
          <p className="truncate text-sm font-bold">{asignacion?.parque_nombre ?? "—"}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 transition hover:bg-white/20"
        >
          Volver
        </button>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 p-4">
        {estado === "cargando" && (
          <p className="py-10 text-center text-sm text-iner-gray">Consultando el clima…</p>
        )}

        {estado === "sin-coords" && (
          <p className="rounded-lg border border-iner-amber bg-iner-amber-50 px-3 py-3 text-sm text-[#9a6200]">
            Este parque todavía no tiene ubicación configurada, así que no se puede mostrar el clima.
          </p>
        )}

        {estado === "offline" && (
          <p className="rounded-lg border border-black/10 bg-white px-3 py-3 text-sm text-iner-gray">
            Sin conexión y sin datos guardados. Volvé a intentar cuando tengas señal.
          </p>
        )}

        {estado === "error" && (
          <p className="rounded-lg border border-iner-amber bg-iner-amber-50 px-3 py-3 text-sm text-[#9a6200]">
            No se pudo obtener el clima. Probá de nuevo en un momento.
          </p>
        )}

        {estado === "ok" && clima && (
          <>
            {desdeCache && (
              <p className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-iner-gray">
                Sin conexión — mostrando el dato de las {horaCorta(clima.actualizado)}.
              </p>
            )}

            <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <IconViento size={28} className="shrink-0 text-iner-green" />
                <div>
                  <p className="text-3xl font-extrabold text-foreground">
                    {clima.viento} <span className="text-base font-semibold text-iner-gray">m/s</span>
                  </p>
                  <p className="text-xs text-iner-gray">
                    Viento · dirección {rosaDeLosVientos(clima.direccion)}
                  </p>
                </div>
              </div>
              <div
                className={`mt-4 rounded-xl px-4 py-3 ${
                  clima.rafaga >= RAFAGA_ALTA_MS
                    ? "bg-iner-amber-50 text-[#9a6200]"
                    : "bg-iner-green-50 text-iner-green"
                }`}
              >
                <p className="text-sm font-semibold">
                  Ráfagas: <strong>{clima.rafaga} m/s</strong>
                  {clima.rafaga >= RAFAGA_ALTA_MS && " · viento fuerte"}
                </p>
              </div>
            </div>

            {clima.horas.length > 0 && (
              <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-iner-gray">
                  Próximas horas
                </p>
                <ul className="divide-y divide-black/5">
                  {clima.horas.map((h) => (
                    <li key={h.hora} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-semibold text-foreground">{h.hora}</span>
                      <span className="text-iner-gray">
                        {h.viento} m/s · ráfaga{" "}
                        <strong className={h.rafaga >= RAFAGA_ALTA_MS ? "text-[#9a6200]" : "text-foreground"}>
                          {h.rafaga}
                        </strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={() => void cargar()}
              disabled={!estaOnline()}
              className="btn-secondary w-full disabled:opacity-40"
            >
              Actualizar
            </button>
          </>
        )}
      </div>
    </main>
  );
}
