// Iconos SVG mínimos (stroke currentColor) para la UI.
export type IconProps = { size?: number; className?: string };

// Base común para los iconos de motivos (evita repetir atributos del svg).
function IconBase({
  size = 18,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconInstall({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function IconCloud({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6.5 19Z" />
    </svg>
  );
}

export function IconOffline({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m2 2 20 20" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 12.9a10 10 0 0 1 5.2-2.7" />
      <path d="M19 12.9a10 10 0 0 0-3-2.3" />
    </svg>
  );
}

// ---------- Motivos de stand-by (nivel 1) ----------

/** Clima — sol tras una nube. */
export function IconClima(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="16" cy="7" r="2.5" />
      <path d="M16 2.5v1" />
      <path d="M20.5 7h-1" />
      <path d="m19.2 3.8-.7.7" />
      <path d="M14.5 15a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 5.5 15Z" />
    </IconBase>
  );
}

/** Inducción — birrete (capacitación). */
export function IconInduccion(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M12 4 2 9l10 5 10-5-10-5Z" />
      <path d="M6 11v4c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-4" />
      <path d="M22 9v5" />
    </IconBase>
  );
}

/** Programación +45min — cronómetro. */
export function IconProgramacion(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 10v3l2 1.5" />
      <path d="M9 2h6" />
      <path d="M12 2v2" />
    </IconBase>
  );
}

/** Término de parque — bandera de meta. */
export function IconBandera(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </IconBase>
  );
}

/** Día stand by — calendario. */
export function IconCalendario(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </IconBase>
  );
}

/** 1 hora de máquina — llave (mantenimiento). */
export function IconLlave(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.8 2.8-2.3-2.3 2.8-2.8Z" />
    </IconBase>
  );
}

/** Otros — lápiz (texto libre). */
export function IconLapiz(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </IconBase>
  );
}

// ---------- Sub-motivos de clima ----------

/** Velocidad del viento. */
export function IconViento(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h14a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16h7" />
    </IconBase>
  );
}

/** Lluvia / llovizna. */
export function IconLluvia(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M16 13a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.3A3.2 3.2 0 0 0 6 13Z" />
      <path d="M8 17v2" />
      <path d="M12 17v3" />
      <path d="M16 17v2" />
    </IconBase>
  );
}

/** Niebla. */
export function IconNiebla(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M3 8h14" />
      <path d="M7 12h14" />
      <path d="M3 16h13" />
    </IconBase>
  );
}

/** Nieve — copo. */
export function IconNieve(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="m5.6 5.6 12.8 12.8" />
      <path d="m18.4 5.6-12.8 12.8" />
    </IconBase>
  );
}

/** Granizo — nube con piedras. */
export function IconGranizo(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M16 12a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.3A3.2 3.2 0 0 0 6 12Z" />
      <path d="M8 17v.01" />
      <path d="M12 19v.01" />
      <path d="M16 17v.01" />
    </IconBase>
  );
}

/** Poca luz — sol tenue. */
export function IconPocaLuz(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5" />
      <path d="M12 19.5V21" />
      <path d="M3 12h1.5" />
      <path d="M19.5 12H21" />
      <path d="m5.6 5.6 1 1" />
      <path d="m17.4 17.4 1 1" />
    </IconBase>
  );
}
