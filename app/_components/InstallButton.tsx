"use client";

import { useEffect, useState } from "react";
import { IconInstall } from "./icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true;
    if (standalone) {
      setInstalado(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalado(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) setIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (instalado) return null;

  if (deferred) {
    return (
      <button
        type="button"
        onClick={async () => {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice.outcome === "accepted") setInstalado(true);
          setDeferred(null);
        }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-iner-amber bg-iner-amber-50 px-4 py-2.5 text-sm font-semibold text-[#9a6200] transition hover:bg-iner-amber/20"
      >
        <IconInstall size={16} />
        Instalar app en el dispositivo
      </button>
    );
  }

  if (iosHint) {
    return (
      <p className="mt-3 rounded-lg bg-iner-gray-100 px-3 py-2 text-center text-xs text-iner-gray">
        Para instalar: toca <strong>Compartir</strong> y luego{" "}
        <strong>Agregar a pantalla de inicio</strong>.
      </p>
    );
  }

  return null;
}
