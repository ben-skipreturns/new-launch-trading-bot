import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f6f7f9",
        ink: "#17191f",
        muted: "#69707d",
        panel: "#ffffff",
        line: "#d8dde6",
        buy: "#0f8f5f",
        watch: "#b26a00",
        reject: "#a43d3d",
        accent: "#2558d4"
      },
      boxShadow: {
        panel: "0 1px 2px rgba(23, 25, 31, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
