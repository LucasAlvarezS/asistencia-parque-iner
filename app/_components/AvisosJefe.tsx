"use client";

// Tarjeta "Avisos de operadores" para el técnico jefe (flag `tecnicos.recibe_avisos`,
// migración 0044). Suscribe el dispositivo a Web Push para recibir, con la
// pantalla bloqueada, cuándo cada operador entra al parque e inicia su primera
// turbina. Para el resto de los perfiles no renderiza nada.
//
// iPhone: solo funciona con la app instalada en la pantalla de inicio (iOS 16.4 o superior),
// y el permiso se pide con un toque (requestPermission debe ser lo primero
// del click). El flag se consulta online y se recuerda en localStorage, así
// no depende del perfil cacheado en el login.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerPerfil } from "@/lib/offline/sesion";

type Estado =
  | "oculto"
  | "instalar" // iPhone en Safari: hay que agregarla a inicio
  | "no-soportado"
  | "actualizar" // hay un service worker nuevo esperando (sin manejador push aún)
  | "inactivo"
  | "activando"
  | "activo"
  | "bloqueado"
  | "error";

const LS_FLAG = "iner_recibe_avisos";
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function claveAUint8(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const b64 = (base64Url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function esIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function esStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function guardarSuscripcion(tecnicoId: string, sub: PushSubscription): Promise<void> {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("suscripcion-incompleta");
  const { error } = await createClient()
    .from("push_suscripciones")
    .upsert(
      {
        endpoint: j.endpoint,
        tecnico_id: tecnicoId,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        user_agent: navigator.userAgent.slice(0, 300),
        visto_ts: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
  if (error) throw error;
}

export function AvisosJefe({ className = "" }: { className?: string }) {
  const [estado, setEstado] = useState<Estado>("oculto");
  const [tecnicoId, setTecnicoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const evaluar = useCallback(async () => {
    const perfil = await leerPerfil();
    if (!perfil) return setEstado("oculto");
    setTecnicoId(perfil.id);

    // Flag: online manda la base; offline, lo último conocido.
    let flag = localStorage.getItem(LS_FLAG) === perfil.id;
    try {
      const { data, error } = await createClient()
        .from("tecnicos")
        .select("recibe_avisos")
        .eq("id", perfil.id)
        .maybeSingle();
      if (!error) {
        flag = data?.recibe_avisos === true;
        if (flag) localStorage.setItem(LS_FLAG, perfil.id);
        else localStorage.removeItem(LS_FLAG);
      }
    } catch {
      // sin red: se usa el valor recordado
    }
    if (!flag) return setEstado("oculto");

    const soporta =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!soporta) return setEstado(esIOS() && !esStandalone() ? "instalar" : "no-soportado");

    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return setEstado("no-soportado");
    if (reg.waiting) return setEstado("actualizar");

    if (Notification.permission === "denied") return setEstado("bloqueado");
    const sub = await reg.pushManager.getSubscription();
    if (Notification.permission === "granted" && sub) {
      // Refresca la suscripción en la base (iOS a veces la rota).
      try {
        await guardarSuscripcion(perfil.id, sub);
      } catch {
        // sin red: queda la que ya estaba guardada
      }
      return setEstado("activo");
    }
    setEstado("inactivo");
  }, []);

  useEffect(() => {
    void evaluar();
  }, [evaluar]);

  async function activar() {
    if (!tecnicoId) return;
    setMensaje(null);
    // Primero el permiso, directo en el gesto del usuario (requisito de iOS).
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
      return;
    }
    setEstado("activando");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: claveAUint8(VAPID_PUBLIC),
        }));
      await guardarSuscripcion(tecnicoId, sub);
      setEstado("activo");
    } catch (err) {
      console.error("[avisos] no se pudo activar", err);
      setMensaje("No se pudieron activar los avisos. Revisa la conexión e inténtalo de nuevo.");
      setEstado("error");
    }
  }

  async function probar() {
    setMensaje("Enviando aviso de prueba…");
    try {
      const r = await fetch("/api/avisos/prueba", { method: "POST" });
      if (r.ok) setMensaje("Aviso enviado. Debería llegarte en unos segundos.");
      else if (r.status === 404) {
        setMensaje("Este teléfono no está registrado. Vuelve a activar los avisos.");
        setEstado("inactivo");
      } else setMensaje("No se pudo enviar el aviso de prueba.");
    } catch {
      setMensaje("Sin conexión: no se pudo enviar el aviso de prueba.");
    }
  }

  if (estado === "oculto") return null;

  const caja = "rounded-xl border px-3 py-2 text-sm";
  return (
    <div className={`${caja} border-iner-green/25 bg-iner-green-50 text-iner-green ${className}`}>
      <p className="font-bold">🔔 Avisos de operadores</p>

      {estado === "instalar" && (
        <p className="mt-1">
          Para recibir avisos en el iPhone, instala la app: en Safari toca{" "}
          <strong>Compartir → Agregar a inicio</strong> y ábrela desde ese ícono.
        </p>
      )}
      {estado === "no-soportado" && (
        <p className="mt-1">Este navegador no admite avisos. Abre la app instalada en el teléfono.</p>
      )}
      {estado === "actualizar" && (
        <p className="mt-1">
          Hay una actualización pendiente. Cierra la app por completo y vuelve a abrirla para
          activar los avisos.
        </p>
      )}
      {estado === "bloqueado" && (
        <p className="mt-1">
          Los avisos están bloqueados. Actívalos en <strong>Ajustes → Notificaciones → INER
          Check-in</strong>.
        </p>
      )}
      {(estado === "inactivo" || estado === "error" || estado === "activando") && (
        <>
          <p className="mt-1">
            Recibe un aviso cuando cada operador entra al parque y cuando inicia su primera turbina.
          </p>
          <button
            type="button"
            onClick={() => void activar()}
            disabled={estado === "activando"}
            className="mt-2 w-full rounded-lg bg-iner-green px-3 py-2 font-bold text-white transition hover:bg-iner-green-700 disabled:opacity-50"
          >
            {estado === "activando" ? "Activando…" : "Activar avisos"}
          </button>
        </>
      )}
      {estado === "activo" && (
        <p className="mt-1 flex items-center justify-between gap-2">
          <span>✓ Activos en este teléfono</span>
          <button type="button" onClick={() => void probar()} className="text-xs underline">
            Enviar prueba
          </button>
        </p>
      )}
      {mensaje && <p className="mt-1 text-xs">{mensaje}</p>}
    </div>
  );
}
