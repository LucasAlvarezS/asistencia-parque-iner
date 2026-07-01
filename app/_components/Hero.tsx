import Image from "next/image";

// Cabecera INER: logo mono sobre verde. Usada en login y onboarding.
export function Hero({ subtitulo }: { subtitulo: string }) {
  return (
    <div className="rounded-t-2xl bg-iner-green px-6 py-8 text-center">
      <Image
        src="/logo-iner-mono.png"
        alt="INER"
        width={160}
        height={100}
        className="mx-auto h-auto w-auto"
        priority
      />
      <h1 className="mt-4 text-lg font-bold text-white">INER Check-in</h1>
      <p className="mt-1 text-sm text-white/70">{subtitulo}</p>
    </div>
  );
}
