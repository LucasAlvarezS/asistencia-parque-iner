import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "./_components/PwaRegister";
import { OfflineSync } from "./_components/OfflineSync";

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "INER Check-in",
  description:
    "Registro de jornadas de técnicos en parques eólicos. Funciona offline y sincroniza al recuperar señal.",
  applicationName: "INER Check-in",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "INER Check-in",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#044245",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${montserrat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <PwaRegister />
        <OfflineSync />
        {children}
      </body>
    </html>
  );
}
