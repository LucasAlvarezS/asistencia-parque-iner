"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ESTADO_ASIGNACION } from "@/lib/catalogos";
import {
  guardarAsignacion,
  leerAsignacion,
  leerPerfil,
  limpiarSesion,
} from "@/lib/offline/sesion";
import { CheckIn } from "./_components/CheckIn";
import { Clima } from "./_components/Clima";
import { Hero } from "./_components/Hero";
import { Jornadas } from "./_components/Jornadas";
import { Login } from "./_components/Login";
import { Onboarding } from "./_components/Onboarding";

type Estado = "cargando" | "login" | "onboarding" | "checkin";

// Gate de navegación (cliente): ¿sesión o perfil cacheado? → ¿asignación activa
// cacheada? → check-in. Offline manda el cache local (login persistente): la
// sesión de Supabase solo se exige cuando hay red.
export default function Page() {
  const [estado, setEstado] = useState<Estado>("cargando");
  // Vista de jornadas pasadas: ortogonal al gate (se abre desde check-in u
  // onboarding y al volver conserva la pantalla de origen).
  const [verJornadas, setVerJornadas] = useState(false);
  // Panel de clima: ortogonal al gate, igual que verJornadas (solo se ofrece a
  // perfiles con ver_clima desde el check-in).
  const [verClima, setVerClima] = useState(false);

  const evaluar = useCallback(async () => {
    const supabase = createClient();
    const [perfil, asignacion] = await Promise.all([leerPerfil(), leerAsignacion()]);

    // getSession() puede devolver null por un refresh de token fallido con señal
    // débil: en el parque `navigator.onLine` da falso positivo (interfaz de red
    // arriba, sin internet real), así que NO se puede usar como criterio de
    // offline. Con perfil cacheado el operador NUNCA debe caer a login por un
    // getSession() nulo — la app opera offline y el sync re-autentica al volver
    // la conexión (sin sesión, el sync deja la cola intacta y reintenta luego).
    let conSesion = false;
    try {
      conSesion = !!(await supabase.auth.getSession()).data.session;
    } catch {
      // Sin red / refresh fallido: decide el cache local.
    }

    if (!perfil) {
      // Sin perfil cacheado no se puede operar: al login (con sesión rehidrata el
      // perfil; sin sesión, autentica). Único camino al login.
      setEstado("login");
      return;
    }

    // Revalida la asignación cacheada contra el server (evita quedar en un parque
    // ya finalizado/borrado por fuera). Solo con sesión y red y si el server
    // responde sin error: offline o ante fallo transitorio, se respeta el cache.
    if (asignacion && conSesion && navigator.onLine) {
      try {
        const { data: activa, error } = await supabase
          .from("asignaciones")
          .select("id")
          .eq("id", asignacion.id)
          .eq("estado", ESTADO_ASIGNACION.ACTIVA)
          .maybeSingle();
        if (!error && !activa) {
          await guardarAsignacion(null);
          setEstado("onboarding");
          return;
        }
      } catch {
        // Fallo transitorio de red: se respeta el cache.
      }
    }
    setEstado(asignacion ? "checkin" : "onboarding");
  }, []);

  // Escape del onboarding: vuelve al login limpiando la sesión local (aunque el
  // signOut remoto falle sin red, el gate cae en login porque el perfil ya no está).
  const salirAlLogin = useCallback(async () => {
    try {
      await createClient().auth.signOut();
    } catch {
      // Sin conexión: igual se limpia el cache local.
    }
    await limpiarSesion();
    void evaluar();
  }, [evaluar]);

  useEffect(() => {
    void evaluar();
  }, [evaluar]);

  if (estado === "cargando") {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Hero subtitulo="Cargando…" />
        </div>
      </main>
    );
  }

  if (estado === "login") return <Login onLogged={() => void evaluar()} />;

  if (verJornadas) return <Jornadas onBack={() => setVerJornadas(false)} />;

  if (verClima) return <Clima onBack={() => setVerClima(false)} />;

  if (estado === "onboarding")
    return (
      <Onboarding
        onReady={() => setEstado("checkin")}
        onSalir={() => void salirAlLogin()}
        onVerJornadas={() => setVerJornadas(true)}
      />
    );
  return (
    <CheckIn
      onFinalizado={() => setEstado("onboarding")}
      onLogout={() => void evaluar()}
      onVerJornadas={() => setVerJornadas(true)}
      onVerClima={() => setVerClima(true)}
    />
  );
}
