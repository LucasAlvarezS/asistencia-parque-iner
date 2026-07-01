"use client";

import { useEffect } from "react";
import { sync } from "@/lib/offline/sync";

// Vacía la cola offline en cuanto hay conexión, de forma fiable: al montar, al
// volver el evento "online", al recuperar foco/visibilidad y con un reintento
// periódico (navigator.onLine y el evento "online" no siempre disparan).
// sync() no hace nada si la cola está vacía o no hay conexión, así que es barato.
export function OfflineSync() {
  useEffect(() => {
    let cancelado = false;
    const intentar = () => {
      if (!cancelado) void sync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") intentar();
    };

    intentar(); // al montar
    window.addEventListener("online", intentar);
    window.addEventListener("focus", intentar);
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(intentar, 20000);

    return () => {
      cancelado = true;
      window.removeEventListener("online", intentar);
      window.removeEventListener("focus", intentar);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, []);
  return null;
}
