"use client";

import { useEffect, useState } from "react";
import { pendientes as contarPendientes } from "@/lib/offline/db";
import { IconCloud, IconOffline } from "./icons";

// Indicador de sincronización: online/offline + nº de eventos pendientes.
// Poll ligero (cada 3 s) + eventos online/offline; suficiente para el header.
export function SyncIndicator() {
  const [online, setOnline] = useState(true);
  const [pend, setPend] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const refrescar = async () => {
      setOnline(navigator.onLine);
      setPend(await contarPendientes());
    };
    void refrescar();
    const id = window.setInterval(refrescar, 3000);
    window.addEventListener("online", refrescar);
    window.addEventListener("offline", refrescar);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", refrescar);
      window.removeEventListener("offline", refrescar);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      {online ? (
        <span className="flex items-center gap-1 text-iner-ok">
          <IconCloud size={14} /> En línea
        </span>
      ) : (
        <span className="flex items-center gap-1 text-iner-amber">
          <IconOffline size={14} /> Sin conexión
        </span>
      )}
      {pend > 0 && (
        <span className="rounded-full bg-iner-amber-50 px-2 py-0.5 text-[#9a6200]">
          {pend} pendiente{pend === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
