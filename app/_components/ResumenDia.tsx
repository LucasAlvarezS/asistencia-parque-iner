"use client";

// Resumen copiable de fin de día. Recibe el texto ya armado (externo: STOP/RUN;
// interno: Traslado/Subida/Salida por WTG). Se muestra tras cerrar el día
// (salida_parque) o el parque (finalizar_parque). En un predio (0046) la salida
// cierra todos sus parques: llegan los otros resúmenes en `otros` y el operador
// elige cuál copiar.

import { useEffect, useState } from "react";
import { copiarTexto } from "@/lib/compartir";
import { IconCheck } from "./icons";
import { Overlay } from "./Overlay";

const SEGUNDOS_DESHACER = 10;

export interface ResumenParque {
  titulo: string; // nombre del parque
  texto: string;
}

export function ModalResumenDia({
  texto,
  titulo,
  otros = [],
  esFinal,
  onCerrar,
  onDeshacer,
}: {
  texto: string;
  titulo?: string; // nombre del parque actual (solo se muestra con `otros`)
  otros?: ResumenParque[]; // resúmenes de los otros parques del predio
  esFinal: boolean; // finalizar_parque: al cerrar vuelve al onboarding
  onCerrar: () => void;
  // Solo se pasa para "Salida de parque" (nunca para finalizar_parque): ventana
  // corta para deshacer, tipo "deshacer envío" — no reabre el día más tarde.
  onDeshacer?: () => void;
}) {
  const [copiado, setCopiado] = useState<boolean | null>(null);
  const [segundos, setSegundos] = useState(SEGUNDOS_DESHACER);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [elegido, setElegido] = useState(0);

  useEffect(() => {
    if (!onDeshacer || segundos <= 0) return;
    const id = window.setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [onDeshacer, segundos]);

  const puedeDeshacer = !!onDeshacer && segundos > 0 && !deshaciendo;
  const resumenes: ResumenParque[] = [{ titulo: titulo ?? "Parque", texto }, ...otros];
  const actual = resumenes[Math.min(elegido, resumenes.length - 1)];

  return (
    <Overlay>
      <h2 className="text-base font-bold">
        {esFinal ? "Parque finalizado" : "Jornada cerrada"}
      </h2>
      <p className="mt-1 text-sm text-iner-gray">
        {resumenes.length > 1
          ? "Elige el parque y copia su resumen para reportarlo."
          : "Copia el resumen del día para reportarlo."}
      </p>
      {resumenes.length > 1 && (
        <div
          role="tablist"
          aria-label="Resumen por parque"
          className="mt-3 flex gap-1 rounded-xl border border-iner-green/25 bg-white p-1"
        >
          {resumenes.map((r, i) => (
            <button
              key={r.titulo + i}
              type="button"
              role="tab"
              aria-selected={i === elegido}
              onClick={() => {
                setElegido(i);
                setCopiado(null);
              }}
              className={`flex-1 truncate rounded-lg px-2 py-2 text-sm font-bold transition ${
                i === elegido ? "bg-iner-green text-white" : "text-iner-green hover:bg-iner-green-50"
              }`}
            >
              {r.titulo}
            </button>
          ))}
        </div>
      )}
      <pre className="mt-3 max-h-[45vh] overflow-auto rounded-lg bg-iner-gray-100 px-3 py-3 text-sm text-foreground">
        {actual.texto}
      </pre>
      {copiado === false && (
        <p className="mt-2 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700">
          No se pudo copiar. Manten apretado el texto para copiarlo a mano.
        </p>
      )}
      {puedeDeshacer && (
        <button
          type="button"
          onClick={async () => {
            setDeshaciendo(true);
            await onDeshacer?.();
          }}
          className="mt-3 w-full rounded-lg border border-iner-amber bg-iner-amber-50 px-3 py-2 text-sm font-bold text-[#9a6200] transition hover:bg-iner-amber/20"
        >
          Deshacer salida ({segundos}s)
        </button>
      )}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={onCerrar} className="btn-secondary flex-1">
          Cerrar
        </button>
        <button
          type="button"
          onClick={async () => setCopiado(await copiarTexto(actual.texto))}
          className="btn-primary flex flex-1 items-center justify-center gap-1.5"
        >
          {copiado ? (
            <>
              <IconCheck size={16} />
              Copiado
            </>
          ) : (
            "Copiar resumen"
          )}
        </button>
      </div>
    </Overlay>
  );
}
