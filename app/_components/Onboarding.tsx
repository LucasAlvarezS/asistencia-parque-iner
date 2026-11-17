"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ESTADO_ASIGNACION,
  PAIS_LABEL,
  type Pais,
  columnaParquePermitida,
} from "@/lib/catalogos";
import {
  type ParqueCache,
  type PaisesConfig,
  guardarPaisesConfig,
  guardarParques,
  leerParques,
  leerPerfil,
} from "@/lib/offline/sesion";
import { hidratarAsignaciones } from "@/lib/offline/predio";
import { AvisosJefe } from "./AvisosJefe";
import { Hero } from "./Hero";
import { Overlay } from "./Overlay";

// Lo recuerda AvisosJefe con el id del técnico que tiene `recibe_avisos` (jefe).
const LS_JEFE = "iner_recibe_avisos";

export function Onboarding({
  onReady,
  onSalir,
  onVerJornadas,
}: {
  onReady: () => void;
  onSalir: () => void;
  onVerJornadas: () => void;
}) {
  const [parques, setParques] = useState<ParqueCache[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nombreTecnico, setNombreTecnico] = useState<string | null>(null);
  // Parque tocado, a la espera de confirmación: un toque suelto (p. ej. al
  // moverse la pantalla mientras carga) ya no crea una asignación.
  const [pendiente, setPendiente] = useState<ItemParque | null>(null);
  // El jefe entra a esta pantalla sobre todo para ir a Jornadas: el botón va arriba.
  const [esJefe, setEsJefe] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const supabase = createClient();
        const perfil = await leerPerfil();
        if (vivo) setNombreTecnico(perfil?.nombre ?? null);
        try {
          if (vivo && perfil) setEsJefe(localStorage.getItem(LS_JEFE) === perfil.id);
        } catch {
          // sin almacenamiento: botón en su lugar de siempre
        }

        // Config por país (data-driven): la cachea para el check-in offline.
        const { data: paisesData } = await supabase
          .from("paises")
          .select("id, permite_interno, permite_externo, usa_almuerzo, usa_equipos");
        if (paisesData) {
          const cfg: PaisesConfig = {};
          for (const p of paisesData) {
            cfg[p.id as keyof PaisesConfig] = {
              permite_interno: p.permite_interno,
              permite_externo: p.permite_externo,
              usa_almuerzo: p.usa_almuerzo,
              usa_equipos: p.usa_equipos,
            };
          }
          await guardarPaisesConfig(cfg);
        }

        // Parques del país del técnico (si el perfil trae país; si no, todos) y
        // de su flujo: la interna y la externa no visitan los mismos parques.
        let q = supabase
          .from("parques")
          .select("id, nombre, pais, empresa_id, turbinas, lat, lon, foto_evidencia, predio")
          .eq("activo", true)
          .eq(columnaParquePermitida(perfil?.subtipo ?? null), true);
        if (perfil?.pais) q = q.eq("pais", perfil.pais);
        // Técnico acotado a una empresa (operador de terceros): solo esos parques.
        if (perfil?.empresa_id) q = q.eq("empresa_id", perfil.empresa_id);
        const { data, error } = await q.order("pais").order("orden");
        if (error) throw error;
        const lista = (data ?? []) as ParqueCache[];
        if (!vivo) return;
        setParques(lista);
        await guardarParques(lista);

        // Reconcilia: si ya hay asignaciones activas en el server (p.ej. dispositivo
        // nuevo), las reusa y entra directo al check-in (evita doble activa, C4).
        // Varias activas solo pasan dentro de un mismo predio (0046).
        if (perfil) {
          const { data: act } = await supabase
            .from("asignaciones")
            .select("id, parque_id, inicio_ts")
            .eq("tecnico_id", perfil.id)
            .eq("estado", ESTADO_ASIGNACION.ACTIVA);
          if (act?.length && (await hidratarAsignaciones(act, lista))) {
            if (vivo) onReady();
            return;
          }
        }
      } catch {
        const cache = await leerParques();
        if (cache?.length) setParques(cache);
        else if (vivo)
          setError("Necesitás conexión la primera vez para cargar los parques.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [onReady]);

  /** Crea la asignación del parque elegido (o una por cada parque del predio) y
   *  entra al check-in. */
  async function elegir(item: ItemParque) {
    setPendiente(null);
    setError(null);
    setCreando(item.clave);
    try {
      if (!navigator.onLine) throw new Error("Elegir un parque requiere conexión.");
      const perfil = await leerPerfil();
      if (!perfil) throw new Error("Perfil no disponible; vuelve a iniciar sesión.");
      const supabase = createClient();

      const inicio_ts = new Date().toISOString();
      const filas = item.parques.map((p) => ({
        id: crypto.randomUUID(),
        tecnico_id: perfil.id,
        parque_id: p.id,
        estado: ESTADO_ASIGNACION.ACTIVA,
        inicio_ts,
      }));
      const { error } = await supabase.from("asignaciones").insert(filas);
      if (error) throw error;
      await hidratarAsignaciones(filas, parques);
      onReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la asignación.");
    } finally {
      setCreando(null);
    }
  }

  const paises = [...new Set(parques.map((p) => p.pais))] as Pais[];
  const items = itemsDeParques(parques);

  const botonJornadas = (clase: string) => (
    <button type="button" onClick={onVerJornadas} className={`btn-secondary w-full ${clase}`}>
      Ver jornadas
    </button>
  );

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Hero subtitulo="Elegí el parque a inspeccionar" />
        <div className="rounded-b-2xl border border-t-0 border-black/10 bg-white p-4 shadow-sm">
          {nombreTecnico && (
            <p className="mb-3 rounded-lg bg-iner-green-50 px-3 py-2 text-sm text-iner-green">
              Sesión iniciada como: <strong>{nombreTecnico}</strong>
            </p>
          )}
          <AvisosJefe className="mb-3" />
          {esJefe && botonJornadas("mb-4")}
          {error && (
            <p className="mb-3 rounded-lg border border-iner-amber bg-iner-amber-50 px-3 py-2 text-sm text-[#9a6200]">
              {error}
            </p>
          )}

          {cargando ? (
            <p className="py-8 text-center text-sm text-iner-gray">Cargando parques…</p>
          ) : parques.length === 0 && !error ? (
            <p className="py-8 text-center text-sm text-iner-gray">
              No hay parques asignados a tu perfil. Comunícate con tu supervisor.
            </p>
          ) : (
            <div className="space-y-4">
              {paises.map((pais) => (
                <div key={pais}>
                  <p className="mb-1 px-1 text-xs font-bold uppercase tracking-wide text-iner-gray">
                    {PAIS_LABEL[pais] ?? pais}
                  </p>
                  <ul className="divide-y divide-black/5 overflow-hidden rounded-lg border border-black/10">
                    {items
                      .filter((it) => it.pais === pais)
                      .map((it) => (
                        <li key={it.clave}>
                          <button
                            type="button"
                            disabled={creando !== null}
                            onClick={() => setPendiente(it)}
                            className="flex w-full items-center justify-between px-3 py-3 text-left transition hover:bg-iner-green-50 disabled:opacity-50"
                          >
                            <span className="min-w-0">
                              <span className="block font-semibold text-foreground">
                                {it.nombre}
                              </span>
                              {it.parques.length > 1 && (
                                <span className="block truncate text-xs text-iner-gray">
                                  {it.parques.map((p) => p.nombre).join(" · ")}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-xs text-iner-gray">
                              {creando === it.clave
                                ? "Creando…"
                                : it.turbinas != null
                                  ? `${it.turbinas} WTG`
                                  : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {!esJefe && botonJornadas("mt-4")}

          <button
            type="button"
            onClick={onSalir}
            className="mt-3 w-full text-center text-xs text-iner-gray underline"
          >
            Cerrar sesión y volver al inicio
          </button>
        </div>
      </div>

      {pendiente && (
        <Overlay>
          <h2 className="text-base font-bold">¿Iniciar en {pendiente.nombre}?</h2>
          <p className="mt-1 text-sm text-iner-gray">
            {pendiente.parques.length > 1
              ? `Quedarás asignado a ${pendiente.parques.map((p) => p.nombre).join(" y ")}.`
              : "Quedarás asignado a este parque hasta finalizarlo."}
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setPendiente(null)} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void elegir(pendiente)}
              className="flex-1 rounded-lg bg-iner-green px-3 py-2 font-bold text-white transition hover:bg-iner-green-700"
            >
              Iniciar
            </button>
          </div>
        </Overlay>
      )}
    </main>
  );
}

/** Opción de la lista: un parque suelto o un predio (varios parques juntos). */
interface ItemParque {
  clave: string;
  nombre: string;
  pais: Pais;
  turbinas: number | null;
  parques: ParqueCache[];
}

function itemsDeParques(parques: ParqueCache[]): ItemParque[] {
  const items: ItemParque[] = [];
  const porPredio = new Map<string, ItemParque>();
  for (const p of parques) {
    if (!p.predio) {
      items.push({ clave: p.id, nombre: p.nombre, pais: p.pais, turbinas: p.turbinas, parques: [p] });
      continue;
    }
    const clave = `predio:${p.pais}:${p.predio}`;
    const it = porPredio.get(clave);
    if (it) {
      it.parques.push(p);
      it.turbinas = it.turbinas != null && p.turbinas != null ? it.turbinas + p.turbinas : null;
    } else {
      const nuevo: ItemParque = { clave, nombre: p.predio, pais: p.pais, turbinas: p.turbinas, parques: [p] };
      porPredio.set(clave, nuevo);
      items.push(nuevo);
    }
  }
  return items;
}
