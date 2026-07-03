"use client";

// Evidencia STOP/RUN del externo: captura de foto (cámara nativa vía input
// capture) comprimida en cliente, y modal post-registro para compartir la
// foto + comando legado (-stop/-run wtg N) por WhatsApp.

import { useEffect, useRef, useState } from "react";
import { type ModoCompartido, compartirEvidencia } from "@/lib/compartir";
import { comprimirFoto } from "@/lib/imagen";
import { Overlay } from "./Overlay";

export function ModalEvidencia({
  titulo,
  subtitulo,
  textoOk,
  busy,
  onConfirmar,
  onCerrar,
}: {
  titulo: string;
  subtitulo: string;
  textoOk: string;
  busy: boolean;
  onConfirmar: (foto: Blob | null) => void;
  onCerrar: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [confirmarSinFoto, setConfirmarSinFoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function alElegirArchivo(file: File | undefined) {
    if (!file) return;
    setProcesando(true);
    setError(null);
    try {
      const comprimida = await comprimirFoto(file);
      setFoto(comprimida);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(comprimida);
      });
    } catch {
      setError("No se pudo procesar la foto. Probá de nuevo.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Overlay>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-bold">{titulo}</h2>
        <button type="button" onClick={onCerrar} className="text-sm text-iner-gray">
          Cancelar
        </button>
      </div>
      <p className="mb-3 text-sm text-iner-gray">{subtitulo}</p>
      {error && (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void alElegirArchivo(e.target.files?.[0]);
          e.target.value = ""; // permite repetir la misma foto
        }}
      />

      {preview ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Foto de evidencia"
            className="max-h-[40vh] w-full rounded-lg border border-black/10 object-contain"
          />
          <button
            type="button"
            disabled={procesando || busy}
            onClick={() => inputRef.current?.click()}
            className="btn-secondary w-full disabled:opacity-40"
          >
            Repetir foto
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={procesando || busy}
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-iner-green/40 bg-iner-green-50 px-4 py-10 text-base font-bold text-iner-green transition hover:bg-iner-green-50/70 disabled:opacity-50"
        >
          {procesando ? "Procesando…" : "📷 Sacar foto"}
        </button>
      )}

      <button
        type="button"
        disabled={!foto || procesando || busy}
        onClick={() => foto && onConfirmar(foto)}
        className="btn-primary mt-4 w-full disabled:opacity-40"
      >
        {textoOk}
      </button>

      {confirmarSinFoto ? (
        <div className="mt-3 rounded-lg border border-iner-amber bg-iner-amber-50 px-3 py-2">
          <p className="text-sm text-[#9a6200]">
            La foto es la evidencia de la inspección. ¿Registrar igual sin foto?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmarSinFoto(false)}
              className="btn-secondary flex-1 py-2 text-xs"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onConfirmar(null)}
              className="flex-1 rounded-lg bg-iner-amber px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              Registrar sin foto
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmarSinFoto(true)}
          className="mt-3 w-full text-center text-xs text-iner-gray underline disabled:opacity-40"
        >
          Registrar sin foto
        </button>
      )}
    </Overlay>
  );
}

export function ModalCompartir({
  texto,
  blob,
  nombreArchivo,
  onCerrar,
}: {
  texto: string;
  blob: Blob | null;
  nombreArchivo: string;
  onCerrar: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ModoCompartido | "error" | null>(null);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  async function compartir() {
    try {
      setResultado(await compartirEvidencia({ texto, blob, nombreArchivo }));
    } catch {
      setResultado("error");
    }
  }

  return (
    <Overlay>
      <h2 className="text-base font-bold">✓ Registrado</h2>
      <p className="mt-1 text-sm text-iner-gray">
        Compartí la evidencia por WhatsApp con el comando de la planilla.
      </p>
      <div className="mt-3 flex items-center gap-3">
        {preview && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview}
            alt="Evidencia"
            className="h-20 w-20 rounded-lg border border-black/10 object-cover"
          />
        )}
        <pre className="flex-1 overflow-x-auto rounded-lg bg-iner-gray-100 px-3 py-2 text-sm font-semibold text-foreground">
          {texto}
        </pre>
      </div>
      {resultado === "clipboard" && (
        <p className="mt-2 rounded-lg border border-iner-amber bg-iner-amber-50 px-3 py-2 text-xs text-[#9a6200]">
          Texto copiado al portapapeles — adjuntá la foto a mano.
        </p>
      )}
      {resultado === "error" && (
        <p className="mt-2 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700">
          No se pudo compartir en este dispositivo.
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={onCerrar} className="btn-secondary flex-1">
          {resultado === "archivo" || resultado === "texto" ? "Listo" : "Omitir"}
        </button>
        <button type="button" onClick={compartir} className="btn-primary flex-1">
          Compartir
        </button>
      </div>
    </Overlay>
  );
}
