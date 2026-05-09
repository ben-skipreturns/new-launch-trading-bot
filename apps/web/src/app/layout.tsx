import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/app-shell";
import { AutoRefresh } from "../components/auto-refresh";

export const metadata: Metadata = {
  title: "Moonshot Command Center",
  description: "Read-only command center for the Solana new-launch paper trader"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const refreshSeconds = Number(process.env.NEXT_PUBLIC_REFRESH_SECONDS ?? 30);
  return (
    <html lang="en">
      <body>
        <AutoRefresh seconds={Number.isFinite(refreshSeconds) && refreshSeconds > 0 ? refreshSeconds : 30} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
