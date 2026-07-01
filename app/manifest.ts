import type { MetadataRoute } from "next";

// PWA instalable. Servido en /manifest.webmanifest (App Router genera la ruta).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "INER Check-in",
    short_name: "INER Check-in",
    description:
      "Registro de jornadas de técnicos en parques eólicos. Completa el check-in en terreno desde tu celular, offline.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#044245",
    theme_color: "#044245",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
