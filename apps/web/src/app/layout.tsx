import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/app-shell";
import { AutoRefresh } from "../components/auto-refresh";

export const metadata: Metadata = {
  title: "Moonshot Command Center",
  description: "Read-only command center for the Solana new-launch paper trader"
};

const themeInitScript = `
(() => {
  try {
    const storageKey = "moonshot-theme";
    const valid = new Set(["system", "light", "dark"]);
    const cookiePreference = document.cookie
      .split("; ")
      .find((row) => row.startsWith(storageKey + "="))
      ?.split("=")[1];
    const stored = window.localStorage.getItem(storageKey) || cookiePreference;
    const preference = valid.has(stored) ? stored : "system";
    const resolved = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
  } catch {
    const cookiePreference = document.cookie
      .split("; ")
      .find((row) => row.startsWith("moonshot-theme="))
      ?.split("=")[1];
    const resolved = cookiePreference === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = cookiePreference || "system";
    document.documentElement.style.colorScheme = resolved;
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const refreshSeconds = Number(process.env.NEXT_PUBLIC_REFRESH_SECONDS ?? 30);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AutoRefresh seconds={Number.isFinite(refreshSeconds) && refreshSeconds > 0 ? refreshSeconds : 30} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
