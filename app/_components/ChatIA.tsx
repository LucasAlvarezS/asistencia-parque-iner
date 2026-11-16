"use client";

// Chat de consultas en lenguaje natural (flag `tecnicos.chat_ia`, migración 0048).
// Envía la conversación a /api/chat, que consulta la base con herramientas de solo
// lectura. Para el resto de los perfiles no renderiza nada. Necesita conexión.

import { useEffect, useRef, useState } from "react";
import { leerPerfil } from "@/lib/offline/sesion";
import { createClient } from "@/lib/supabase/client";
import { IconEnviar } from "./icons";
import { Overlay } from "./Overlay";

const LS_FLAG = "iner_chat_ia";
const LS_HIST = "iner_chat_ia_hist";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatIABoton({ className = "" }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    (async () => {
      const perfil = await leerPerfil();
      if (!perfil) return;
      let flag = localStorage.getItem(LS_FLAG) === perfil.id;
      try {
        const { data, error } = await createClient()
          .from("tecnicos")
          .select("chat_ia")
          .eq("id", perfil.id)
          .maybeSingle();
        if (!error) {
          flag = (data as { chat_ia?: boolean } | null)?.chat_ia === true;
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
        Consultas
      </button>
      {abierto && <ModalChat onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function leerHistorial(): Msg[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_HIST) ?? "[]");
    return Array.isArray(v) ? (v as Msg[]).slice(-20) : [];
  } catch {
    return [];
  }
}

function ModalChat({ onCerrar }: { onCerrar: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>(() => leerHistorial());
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LS_HIST, JSON.stringify(msgs.slice(-20)));
    } catch {
      // almacenamiento no disponible
    }
    fin.current?.scrollIntoView({ block: "end" });
  }, [msgs, enviando]);

  async function enviar() {
    const pregunta = texto.trim();
    if (!pregunta || enviando) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("Necesitas conexión para consultar.");
      return;
    }
    setError(null);
    const nuevos: Msg[] = [...msgs, { role: "user", content: pregunta }];
    setMsgs(nuevos);
    setTexto("");
    setEnviando(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensajes: nuevos }),
      });
      if (!r.ok) {
        setError(
          r.status === 503
            ? "El chat aún no está configurado."
            : "No se pudo responder. Inténtalo de nuevo.",
        );
        return;
      }
      const { respuesta } = (await r.json()) as { respuesta: string };
      setMsgs([...nuevos, { role: "assistant", content: respuesta }]);
    } catch {
      setError("No se pudo responder. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Overlay>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Consultas</h2>
        {msgs.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMsgs([]);
              setError(null);
            }}
            className="text-xs font-semibold text-iner-gray"
          >
            Nueva conversación
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-iner-gray">
        Pregunta en lenguaje natural sobre jornadas, turbinas y standby. Solo lectura.
      </p>

      <div className="mt-3 max-h-[50vh] min-h-[8rem] space-y-2 overflow-y-auto">
        {msgs.length === 0 && (
          <p className="rounded-lg bg-iner-gray-100 px-3 py-2 text-sm text-iner-gray">
            Ejemplos: «¿Entró Javier hoy a parque?», «Resumen del día de ayer», «Resumen FAC de la semana del 9 de noviembre».
          </p>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-8 bg-iner-green text-white"
                : "mr-8 bg-iner-gray-100 text-foreground"
            }`}
          >
            {m.content}
          </div>
        ))}
        {enviando && <p className="text-sm text-iner-gray">Consultando…</p>}
        <div ref={fin} />
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe tu pregunta"
          maxLength={500}
          className="min-w-0 flex-1 rounded-full border border-iner-gray/30 px-4 py-2 text-sm outline-none focus:border-iner-green"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          aria-label="Enviar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-iner-green text-white disabled:opacity-40"
        >
          <IconEnviar size={18} />
        </button>
      </form>

      <button type="button" onClick={onCerrar} className="btn-secondary mt-3 w-full">
        Cerrar
      </button>
    </Overlay>
  );
}
