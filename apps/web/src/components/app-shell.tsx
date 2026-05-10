import { AppNav, type NavItem } from "./app-nav";
import { ThemeToggle } from "./theme-toggle";

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/radar", label: "Radar Review" },
  { href: "/topics", label: "Topics" },
  { href: "/stream", label: "Stream" },
  { href: "/launches", label: "Launches" },
  { href: "/positions", label: "Positions" },
  { href: "/lifecycle", label: "Lifecycle" },
  { href: "/local", label: "Local Development" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const refreshSeconds = process.env.NEXT_PUBLIC_REFRESH_SECONDS ?? "30";
  return (
    <div className="shell-grid">
      <aside className="border-r border-line bg-panel/75 text-ink backdrop-blur-xl max-[980px]:border-b max-[980px]:border-r-0">
        <div className="flex h-full flex-col gap-6 p-4 max-[980px]:gap-4">
          <div className="flex flex-col gap-4 max-[980px]:flex-row max-[980px]:items-start max-[980px]:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Moonshot</div>
              <div className="mt-2 text-lg font-semibold tracking-normal text-ink">Command Center</div>
              <div className="mt-2 max-w-[18rem] text-sm leading-5 text-muted">
                Read-only paper-trading telemetry for meme-relevance launch filtering.
              </div>
            </div>
            <ThemeToggle />
          </div>
          <AppNav items={navItems} />
          <div className="mt-auto border-t border-line pt-4 text-xs leading-5 text-muted max-[980px]:hidden">
            Auto refresh: {refreshSeconds}s
            <br />
            No wallet controls in v1
          </div>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
