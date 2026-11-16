"use client";

// Centro de notificaciones del técnico jefe (flag `tecnicos.recibe_avisos`,
// migraciones 0044 + 0049). Campana con contador de no leídos y lista de los
// avisos recibidos (entrada a parque, primera turbina y stand-by de cada operador,
// solo parques de VESTAS). Para
// el resto de los perfiles no renderiza nada. Necesita conexión.

import { useCallback, useEffect, useState } from "react";
import { leerPerfil } from "@/lib/offline/sesion";
import { createClient } from "@/lib/supabase/client";
import { IconCampana } from "./icons";
import { Overlay } from "./Overlay";

const LS_FLAG = "iner_recibe_avisos";
const DIAS = 7;
const REFRESCO_MS = 60_000;

interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  creado_ts: string;
  leido_ts: string | null;
}

type Estado = "cargando" | "offline" | "error" | "ok";

function desdeISO(): string {
  return new Date(Date.now() - DIAS * 86_400_000).toISOString();
}

/** "Hoy", "Ayer" o DD/MM según la fecha local del dispositivo. */
function etiquetaDia(ts: string): string {
  const d = new Date(ts);
  const hoy = new Date();
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((dia(hoy) - dia(d)) / 86_400_000);
  if (dif === 0) return "Hoy";
  if (dif === 1) return "Ayer";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function CentroAvisosBoton({ className = "" }: { className?: string }) {
  const [tecnicoId, setTecnicoId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [sinLeer, setSinLeer] = useState(0);

  useEffect(() => {
    (async () => {
      const perfil = await leerPerfil();
      if (!perfil) return;
      setTecnicoId(perfil.id);
      // Flag: online manda la base; offline, lo último conocido (lo recuerda AvisosJefe).
      let flag = localStorage.getItem(LS_FLAG) === perfil.id;
      try {
        const { data, error } = await createClient()
          .from("tecnicos")
          .select("recibe_avisos")
          .eq("id", perfil.id)
          .maybeSingle();
        if (!error) flag = (data as { recibe_avisos?: boolean } | null)?.recibe_avisos === true;
      } catch {
        // sin red: se usa el valor recordado
      }
      setVisible(flag);
    })();
  }, []);

  const contar = useCallback(async () => {
    if (!tecnicoId || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    try {
      const { count, error } = await createClient()
        .from("avisos")
        .select("id", { count: "exact", head: true })
        .eq("tecnico_id", tecnicoId)
        .is("leido_ts", null)
        .gte("creado_ts", desdeISO());
      if (!error) setSinLeer(count ?? 0);
    } catch {
      // sin red: se conserva el último contador
    }
  }, [tecnicoId]);

  useEffect(() => {
    if (!visible || abierto) return;
    void contar();
    const t = setInterval(() => void contar(), REFRESCO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void contar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [visible, abierto, contar]);

  if (!visible || !tecnicoId) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={sinLeer > 0 ? `Notificaciones, ${sinLeer} sin leer` : "Notificaciones"}
        className={`btn-barra ${className}`}
      >
        <IconCampana size={16} />
        Avisos
        {sinLeer > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-iner-amber px-1 text-[10px] font-bold leading-none text-iner-green">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>
      {abierto && (
        <ModalAvisos
          tecnicoId={tecnicoId}
          onCerrar={() => {
            setAbierto(false);
            setSinLeer(0);
          }}
        />
      )}
    </>
  );
}

function ModalAvisos({ tecnicoId, onCerrar }: { tecnicoId: string; onCerrar: () => void }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    (async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return setEstado("offline");
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("avisos")
          .select("id, tipo, titulo, cuerpo, creado_ts, leido_ts")
          .eq("tecnico_id", tecnicoId)
          .gte("creado_ts", desdeISO())
          .order("creado_ts", { ascending: false })
          .limit(100);
        if (error) {
          console.error("[centro-avisos]", error);
          return setEstado("error");
        }
        const filas = (data ?? []) as Aviso[];
        setAvisos(filas);
        setEstado("ok");
        // Al abrir, todo lo mostrado queda leído (la lista conserva el resaltado de esta vez).
        if (filas.some((a) => !a.leido_ts)) {
          await supabase
            .from("avisos")
            .update({ leido_ts: new Date().toISOString() })
            .eq("tecnico_id", tecnicoId)
            .is("leido_ts", null);
        }
      } catch {
        setEstado("error");
      }
    })();
  }, [tecnicoId]);

  // Agrupa por día conservando el orden (más reciente primero).
  const grupos: { dia: string; items: Aviso[] }[] = [];
  for (const a of avisos) {
    const dia = etiquetaDia(a.creado_ts);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.items.push(a);
    else grupos.push({ dia, items: [a] });
  }

  return (
    <Overlay>
      <h2 className="text-base font-bold">Notificaciones</h2>
      <p className="mt-1 text-xs text-iner-gray">
        Entradas a parque, primera turbina y stand-by de los operadores de Vestas. Últimos {DIAS} días.
      </p>

      {estado === "cargando" && <p className="mt-3 text-sm text-iner-gray">Cargando…</p>}
      {estado === "offline" && (
        <p className="mt-3 rounded-lg border border-iner-gray/30 bg-iner-gray-100 px-3 py-2 text-sm text-iner-gray">
          Necesitas conexión para ver las notificaciones.
        </p>
      )}
      {estado === "error" && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar las notificaciones. Inténtalo de nuevo.
        </p>
      )}
      {estado === "ok" && avisos.length === 0 && (
        <p className="mt-3 rounded-lg bg-iner-gray-100 px-3 py-2 text-sm text-iner-gray">
          Sin notificaciones en los últimos {DIAS} días.
        </p>
      )}
      {estado === "ok" && avisos.length > 0 && (
        <div className="mt-3 max-h-[55vh] space-y-3 overflow-y-auto">
          {grupos.map((g) => (
            <section key={g.dia}>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-iner-gray">
                {g.dia}
              </p>
              <ul className="space-y-1.5">
                {g.items.map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      a.leido_ts
                        ? "border-black/10 bg-white"
                        : "border-iner-green/25 bg-iner-green-50"
                    }`}
                  >
                    <p className={a.leido_ts ? "font-semibold" : "font-bold text-iner-green"}>
                      {a.titulo}
                    </p>
                    <p className="text-xs text-iner-gray">{a.cuerpo}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <button type="button" onClick={onCerrar} className="btn-secondary mt-4 w-full">
        Cerrar
      </button>
    </Overlay>
  );
}
