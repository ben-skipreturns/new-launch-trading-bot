import Link from "next/link";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/launches", label: "Launches" },
  { href: "/topics", label: "Topics" },
  { href: "/positions", label: "Positions" },
  { href: "/local", label: "Local Development" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const refreshSeconds = process.env.NEXT_PUBLIC_REFRESH_SECONDS ?? "30";
  return (
    <div className="shell-grid">
      <aside className="border-r border-line bg-ink text-white max-[980px]:border-b max-[980px]:border-r-0">
        <div className="flex h-full flex-col gap-8 p-5 max-[980px]:gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Moonshot</div>
            <div className="mt-2 text-xl font-semibold tracking-normal">Command Center</div>
            <div className="mt-2 max-w-[18rem] text-sm leading-5 text-white/60">
              Read-only paper-trading telemetry for meme-relevance launch filtering.
            </div>
          </div>
          <nav className="flex flex-col gap-1 max-[980px]:flex-row max-[980px]:flex-wrap max-[980px]:overflow-visible">
            {navItems.map((item) => (
              <Link
                className="rounded-md px-3 py-2 text-sm font-medium text-white/78 transition hover:bg-white/10 hover:text-white"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-white/10 pt-4 text-xs leading-5 text-white/48 max-[980px]:hidden">
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
