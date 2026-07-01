"use client";

import { useEffect } from "react";

// Registra el service worker de Serwist (/sw.js) en producción. En desarrollo lo
// desregistra y limpia caché para no servir chunks obsoletos.
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registro silencioso */
      });
    } else {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
    }
  }, []);
  return null;
}
