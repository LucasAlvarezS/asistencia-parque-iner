import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// Tipado del scope del service worker + inyección de manifest de precache que
// hace @serwist/next en build (self.__SW_MANIFEST).
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // conservador: no activar sobre técnicos con jornada offline (STACK.md §5)
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  // Sin red y sin runtime cache, cualquier navegación cae al "/" precacheado
  // (app de una sola página): la PWA abre offline en vez del error del browser.
  fallbacks: {
    entries: [
      {
        url: "/",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// ---------- Avisos push (técnico jefe, ver app/api/avisos) ----------
// iOS exige que TODO push muestre una notificación (userVisibleOnly): si no, Safari
// revoca la suscripción. Por eso siempre se muestra algo, aunque el payload falle.
interface AvisoPush {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let aviso: AvisoPush = {};
  try {
    aviso = (event.data?.json() as AvisoPush) ?? {};
  } catch {
    aviso = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(aviso.title ?? "INER Check-in", {
      body: aviso.body ?? "",
      tag: aviso.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: aviso.url ?? "/" },
    }),
  );
});

// Tocar la notificación: enfoca la app si ya está abierta; si no, la abre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? "/";
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const abierta = ventanas[0];
      if (abierta) {
        await abierta.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
