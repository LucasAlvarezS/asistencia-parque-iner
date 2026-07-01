import withSerwistInit from "@serwist/next";

// Serwist genera el service worker desde app/sw.ts hacia public/sw.js.
// El precache del app-shell permite arranque offline (PWA).
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // En desarrollo el SW se deshabilita para no cachear entre recargas.
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSerwist(nextConfig);
