import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        water: "#080812",
        land: "#0f0f1a",
        edge: "#2a2a3e",
        muted: "#8d8da6",
        accent: "#7c8cff",
      },
    },
  },
  plugins: [],
};

export default config;
