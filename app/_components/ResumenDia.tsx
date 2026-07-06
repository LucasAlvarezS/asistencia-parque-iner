"use client";

// Resumen copiable de fin de día del externo: desglose STOP/RUN por turbina,
// stand-by (motivo + horario) y salida del parque. Se muestra tras cerrar el día
// (salida_parque) o el parque (finalizar_parque).

import { useState } from "react";
import { type ResumenJornada, copiarTexto, textoResumenJornada } from "@/lib/compartir";
import { Overlay } from "./Overlay";

export function ModalResumenDia({
  datos,
  esFinal,
  onCerrar,
}: {
  datos: ResumenJornada;
  esFinal: boolean; // finalizar_parque: al cerrar vuelve al onboarding
  onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState<boolean | null>(null);
  const texto = textoResumenJornada(datos);

  return (
    <Overlay>
      <h2 className="text-base font-bold">
        {esFinal ? "Parque finalizado" : "Jornada cerrada"}
      </h2>
      <p className="mt-1 text-sm text-iner-gray">
        Copiá el resumen del día para reportarlo.
      </p>
      <pre className="mt-3 max-h-[45vh] overflow-auto rounded-lg bg-iner-gray-100 px-3 py-3 text-sm text-foreground">
        {texto}
      </pre>
      {copiado === false && (
        <p className="mt-2 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700">
          No se pudo copiar. Mantené apretado el texto para copiarlo a mano.
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={onCerrar} className="btn-secondary flex-1">
          Cerrar
        </button>
        <button
          type="button"
          onClick={async () => setCopiado(await copiarTexto(texto))}
          className="btn-primary flex-1"
        >
          {copiado ? "✓ Copiado" : "Copiar resumen"}
        </button>
      </div>
    </Overlay>
  );
}
