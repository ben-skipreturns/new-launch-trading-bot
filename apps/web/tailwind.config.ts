import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--color-background) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        "panel-muted": "rgb(var(--color-panel-muted) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        buy: "rgb(var(--color-buy) / <alpha-value>)",
        watch: "rgb(var(--color-watch) / <alpha-value>)",
        reject: "rgb(var(--color-reject) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        risk: "rgb(var(--color-risk) / <alpha-value>)",
        code: "rgb(var(--color-code) / <alpha-value>)",
        "code-text": "rgb(var(--color-code-text) / <alpha-value>)"
      },
      boxShadow: {
        panel: "var(--shadow-panel)"
      }
    }
  },
  plugins: []
};

export default config;
