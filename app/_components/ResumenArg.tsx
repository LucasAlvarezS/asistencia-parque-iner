"use client";

// Botón "Resumen Arg" + modal para el técnico jefe (flag `tecnicos.ver_resumen_arg`,
// migración 0045). Arma el resumen diario de VESTAS AR (turbinas por operador /
// equipo) para copiarlo y enviarlo. Para el resto de los perfiles no renderiza
// nada. Necesita conexión: los datos de otros operadores no se guardan en el
// dispositivo.

import { useCallback, useEffect, useState } from "react";
import { copiarTexto } from "@/lib/compartir";
import { leerPerfil } from "@/lib/offline/sesion";
import {
  type FilaResumenArg,
  fechaDMY,
  hoyYMD,
  sumarDias,
  textoResumenArg,
} from "@/lib/resumenArg";
import { createClient } from "@/lib/supabase/client";
import { Overlay } from "./Overlay";

const LS_FLAG = "iner_ver_resumen_arg";

type Estado = "cargando" | "offline" | "error" | "ok";

export function ResumenArgBoton({ className = "" }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    (async () => {
      const perfil = await leerPerfil();
      if (!perfil) return;
      // Flag: online manda la base; offline, lo último conocido.
      let flag = localStorage.getItem(LS_FLAG) === perfil.id;
      try {
        const { data, error } = await createClient()
          .from("tecnicos")
          .select("ver_resumen_arg")
          .eq("id", perfil.id)
          .maybeSingle();
        if (!error) {
          flag = (data as { ver_resumen_arg?: boolean } | null)?.ver_resumen_arg === true;
          if (flag) localStorage.setItem(LS_FLAG, perfil.id);
          else localStorage.removeItem(LS_FLAG);
        }
      } catch {
        // sin red: se usa el valor recordado
      }
      setVisible(flag);
    })();
  }, []);

  if (!visible) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`rounded-full bg-white px-3 py-1 text-xs font-bold text-iner-green transition hover:bg-white/90 ${className}`}
      >
        Resumen Arg
      </button>
      {abierto && <ModalResumenArg onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function ModalResumenArg({ onCerrar }: { onCerrar: () => void }) {
  const hoy = hoyYMD();
  const [fecha, setFecha] = useState(hoy);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [filas, setFilas] = useState<FilaResumenArg[]>([]);
  const [copiado, setCopiado] = useState<boolean | null>(null);

  const cargar = useCallback(async (f: string) => {
    setCopiado(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setEstado("offline");
      return;
    }
    setEstado("cargando");
    try {
      const { data, error } = await createClient().rpc("resumen_arg", { p_fecha: f });
      if (error) {
        console.error("[resumen-arg]", error);
        setEstado("error");
        return;
      }
      setFilas((data ?? []) as FilaResumenArg[]);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }, []);

  useEffect(() => {
    void cargar(fecha);
  }, [cargar, fecha]);

  const texto = textoResumenArg(fecha, filas);
  const abiertas = filas.filter((f) => f.jornada_abierta);
  const flecha =
    "rounded-full bg-iner-gray-100 px-3 py-1 text-sm font-bold text-iner-gray transition hover:bg-iner-gray/20 disabled:opacity-30";

  return (
    <Overlay>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Resumen Arg</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Día anterior"
            onClick={() => setFecha((f) => sumarDias(f, -1))}
            className={flecha}
          >
            ◀
          </button>
          <span className="text-sm font-semibold tabular-nums">{fechaDMY(fecha)}</span>
          <button
            type="button"
            aria-label="Día siguiente"
            onClick={() => setFecha((f) => sumarDias(f, 1))}
            disabled={fecha >= hoy}
            className={flecha}
          >
            ▶
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-iner-gray">
        Turbinas del día por operador de VESTAS AR. Copia el resumen para enviarlo.
      </p>

      {estado === "cargando" && <p className="mt-3 text-sm text-iner-gray">Cargando…</p>}
      {estado === "offline" && (
        <p className="mt-3 rounded-lg border border-iner-gray/30 bg-iner-gray-100 px-3 py-2 text-sm text-iner-gray">
          Necesitas conexión para generar el resumen.
        </p>
      )}
      {estado === "error" && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo generar el resumen. Inténtalo de nuevo.
        </p>
      )}
      {estado === "ok" && (
        <>
          <pre className="mt-3 max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-lg bg-iner-gray-100 px-3 py-3 text-sm text-foreground">
            {filas.length > 0 ? texto : "Sin operadores con actividad ese día."}
          </pre>
          {abiertas.length > 0 && (
            <p className="mt-2 rounded-lg border border-iner-amber bg-iner-amber-50 px-3 py-2 text-xs text-[#9a6200]">
              ⚠ Jornada sin cerrar:{" "}
              {abiertas.map((f) => `${f.operador ?? "—"} (${f.parque})`).join(", ")}. El conteo
              puede cambiar.
            </p>
          )}
          {copiado === false && (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700">
              No se pudo copiar. Mantén apretado el texto para copiarlo a mano.
            </p>
          )}
        </>
      )}

      <div className="mt-4 flex gap-3">
        <button type="button" onClick={onCerrar} className="btn-secondary flex-1">
          Cerrar
        </button>
        <button
          type="button"
          disabled={estado !== "ok" || filas.length === 0}
          onClick={async () => setCopiado(await copiarTexto(texto))}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          {copiado ? "✓ Copiado" : "Copiar resumen"}
        </button>
      </div>
    </Overlay>
  );
}
