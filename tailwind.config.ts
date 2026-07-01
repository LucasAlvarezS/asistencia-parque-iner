import type { Config } from "tailwindcss";

// Identidad visual INER: verde #044245 · gris #707070 · ámbar #FFA700.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        iner: {
          green: "#044245",
          "green-700": "#053538",
          "green-50": "#e6efef",
          gray: "#707070",
          "gray-100": "#f2f2f2",
          amber: "#FFA700",
          "amber-50": "#fff6e5",
          ok: "#2f8f46",
          "ok-50": "#e9f5ec",
        },
        background: "#f4f6f6",
        foreground: "#1a1f1f",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Montserrat", "Arial", "Helvetica", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
