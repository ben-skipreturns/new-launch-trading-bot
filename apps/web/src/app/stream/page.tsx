import Link from "next/link";
import type React from "react";
import { EmptyState } from "../../components/empty-state";
import { ErrorPanel } from "../../components/error-panel";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { getRawLaunchPage } from "../../lib/data";
import { formatAge, formatDate, formatSol, shortMint } from "../../lib/format";
import type { RawLaunchListItem, RawLaunchStatusFilter, StreamHealthListItem } from "../../lib/types";

export const dynamic = "force-dynamic";

const pageSizes = [25, 50, 100];
const statusFilters: Array<{ label: string; value: RawLaunchStatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Raw", value: "raw" },
  { label: "Matched", value: "matched" },
  { label: "Scored", value: "scored" }
];
const hourFilters = [
  { label: "1h", value: "1" },
  { label: "6h", value: "6" },
  { label: "24h", value: "24" },
  { label: "7d", value: "168" },
  { label: "All", value: "" }
];

export default async function StreamPage({
  searchParams
}: {
  searchParams?: Promise<{ page?: string; pageSize?: string; status?: string; source?: string; hours?: string }>;
}) {
  const params = await searchParams;
  const page = parsePositiveInt(params?.page, 1);
  const pageSize = pageSizes.includes(parsePositiveInt(params?.pageSize, 25)) ? parsePositiveInt(params?.pageSize, 25) : 25;
  const status = parseStatusFilter(params?.status);
  const source = params?.source?.trim() || undefined;
  const hours = params?.hours ? parsePositiveInt(params.hours, 0) || undefined : undefined;
  const launches = await getRawLaunchPage(page, pageSize, { status, source, hours });
  const href = (updates: Record<string, string | number | undefined>) =>
    streamHref({ page, pageSize, status, source, hours: hours ? String(hours) : undefined }, updates);

  return (
    <div className="page-wrap space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Raw launch feed</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Stream</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Persisted token create events from fixture or PumpApi stream tests before enrichment, meme matching, scoring, or paper trading.
          </p>
        </div>
        <div className="theme-control flex rounded-lg p-1">
          {pageSizes.map((size) => (
            <Link
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                launches.data.pageSize === size ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
              href={href({ page: 1, pageSize: size })}
              key={size}
            >
              {size}
            </Link>
          ))}
        </div>
      </header>

      <ErrorPanel message={launches.ok ? undefined : launches.error} />

      <section className="panel rounded-md p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="theme-control flex rounded-lg p-1">
            {statusFilters.map((filter) => (
              <Link
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  status === filter.value ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
                href={href({ page: 1, status: filter.value })}
                key={filter.value}
              >
                {filter.label}
              </Link>
            ))}
          </div>
          <div className="theme-control flex rounded-lg p-1">
            {hourFilters.map((filter) => (
              <Link
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  String(hours ?? "") === filter.value ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
                href={href({ page: 1, hours: filter.value || undefined })}
                key={filter.label}
              >
                {filter.label}
              </Link>
            ))}
          </div>
          {launches.data.sources.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                className={`rounded-md border border-line px-3 py-1.5 text-sm font-semibold transition ${
                  !source ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
                href={href({ page: 1, source: undefined })}
              >
                All sources
              </Link>
              {launches.data.sources.map((item) => (
                <Link
                  className={`rounded-md border border-line px-3 py-1.5 text-sm font-semibold transition ${
                    source === item ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink"
                  }`}
                  href={href({ page: 1, source: item })}
                  key={item}
                >
                  {item}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-5 gap-3 max-[1280px]:grid-cols-3 max-[760px]:grid-cols-2 max-[520px]:grid-cols-1">
        <MetricCard title="Total launches" value={formatCompact(launches.data.stats.total)} detail="Persisted create events" tone="accent" />
        <MetricCard title="Raw only" value={formatCompact(launches.data.stats.rawOnly)} detail="Not matched or scored" />
        <MetricCard title="Matched" value={formatCompact(launches.data.stats.matched)} detail="Has meme match" tone="watch" />
        <MetricCard title="Scored" value={formatCompact(launches.data.stats.scored)} detail="Has score snapshot" tone="good" />
        <MetricCard
          title="Latest launch"
          value={launches.data.stats.latestCreatedAt ? formatAge(launches.data.stats.latestCreatedAt) : "-"}
          detail={formatDate(launches.data.stats.latestCreatedAt)}
        />
      </section>

      {launches.data.streamHealth.length > 0 ? (
        <section className="grid grid-cols-5 gap-3 max-[1280px]:grid-cols-3 max-[760px]:grid-cols-2 max-[520px]:grid-cols-1">
          {launches.data.streamHealth.slice(0, 5).map((run) => (
            <StreamHealthCard key={run.id} run={run} />
          ))}
        </section>
      ) : null}

      <section className="panel overflow-hidden rounded-md">
        {launches.data.items.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Creator</th>
                  <th>Initial</th>
                  <th>Curve / MC</th>
                  <th>URI</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {launches.data.items.map((launch) => (
                  <StreamRow key={launch.mint} launch={launch} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="No raw launches found" body="Run stream-test with --persist to store token create events." />
          </div>
        )}
      </section>

      <nav className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">
          Showing {launches.data.items.length ? (launches.data.page - 1) * launches.data.pageSize + 1 : 0}-
          {Math.min(launches.data.page * launches.data.pageSize, launches.data.total)} of {launches.data.total}
        </div>
        <div className="flex gap-2">
          <PageLink disabled={!launches.data.hasPrevious} href={href({ page: Math.max(1, launches.data.page - 1) })}>
            Previous
          </PageLink>
          <PageLink disabled={!launches.data.hasNext} href={href({ page: launches.data.page + 1 })}>
            Next
          </PageLink>
        </div>
      </nav>
    </div>
  );
}

function StreamRow({ launch }: { launch: RawLaunchListItem }) {
  return (
    <tr>
      <td className="min-w-[210px]">
        <Link className="font-semibold text-ink hover:text-accent" href={`/launches/${launch.mint}`}>
          {launch.symbol ?? launch.name ?? shortMint(launch.mint)}
        </Link>
        {launch.name && launch.symbol ? <div className="mt-0.5 text-sm text-muted">{launch.name}</div> : null}
        <div className="mono-cell mt-0.5 text-muted">{shortMint(launch.mint)}</div>
      </td>
      <td>
        <div className="flex flex-wrap gap-1.5">
          {launch.hasScore ? <StatusBadge label="scored" tone="buy" /> : <StatusBadge label="raw" />}
          {launch.hasMemeMatch ? <StatusBadge label="matched" tone="watch" /> : null}
        </div>
      </td>
      <td>
        <div className="font-medium text-ink">{launch.source}</div>
        <div className="text-xs text-muted">{launch.pool}</div>
      </td>
      <td className="mono-cell max-w-[160px] truncate text-muted">{launch.creator ? shortMint(launch.creator) : "-"}</td>
      <td>
        <div>{formatSol(launch.initialBuySol, 4)}</div>
        <div className="text-xs text-muted">{formatCompact(launch.initialBuyTokens)} tokens</div>
      </td>
      <td>
        <div>{formatSol(launch.vSolInBondingCurve, 2)} curve</div>
        <div className="text-xs text-muted">{formatSol(launch.marketCapSol, 2)} MC</div>
      </td>
      <td className="max-w-[260px] truncate">{formatUri(launch.uri)}</td>
      <td>
        <div>{formatAge(launch.createdAt)}</div>
        <div className="text-xs text-muted">{formatDate(launch.createdAt)}</div>
      </td>
    </tr>
  );
}

function StreamHealthCard({ run }: { run: StreamHealthListItem }) {
  const tone = run.status === "completed" ? "buy" : run.status === "running" ? "watch" : run.status === "error" || run.status === "stale" ? "reject" : undefined;
  return (
    <div className="panel rounded-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{run.source}</div>
          <div className="mt-1 text-lg font-semibold text-ink">{formatAge(run.startedAt)}</div>
        </div>
        <StatusBadge label={run.status} tone={tone} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <HealthMetric label="Events" value={formatCompact(run.eventsRead)} />
        <HealthMetric label="Launches" value={formatCompact(run.launchesRead)} />
        <HealthMetric label="Launch/min" value={formatNumber(run.launchesPerMinute, 2)} />
        <HealthMetric label="Event/min" value={formatNumber(run.eventsPerMinute, 2)} />
        <HealthMetric label="Parser rejects" value={formatCompact(run.parserRejects)} />
        <HealthMetric label="Reject rate" value={formatPercent(run.parserRejectRate)} />
        <HealthMetric label="Dupes" value={formatPercent(run.duplicateRate)} />
        <HealthMetric label="Reconnects" value={formatCompact(run.reconnects)} />
      </div>
      <div className="mt-3 text-xs text-muted">Last event {run.lastEventAt ? formatAge(run.lastEventAt) : "-"}</div>
      {run.errorText ? <div className="mt-2 line-clamp-2 text-xs text-reject">{run.errorText}</div> : null}
    </div>
  );
}

function HealthMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-muted/70 px-2.5 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-0.5 font-semibold text-ink">{value}</div>
    </div>
  );
}

function PageLink({ children, disabled, href }: { children: React.ReactNode; disabled: boolean; href: string }) {
  if (disabled) {
    return (
      <span className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-muted opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-ink hover:border-accent/50" href={href}>
      {children}
    </Link>
  );
}

function parseStatusFilter(value: string | undefined): RawLaunchStatusFilter {
  return value === "raw" || value === "matched" || value === "scored" ? value : "all";
}

function streamHref(
  current: { page: number; pageSize: number; status: RawLaunchStatusFilter; source?: string; hours?: string },
  updates: Record<string, string | number | undefined>
): string {
  const next = new URLSearchParams();
  const merged = { ...current, ...updates };
  if (merged.page && Number(merged.page) > 1) next.set("page", String(merged.page));
  if (merged.pageSize && Number(merged.pageSize) !== 25) next.set("pageSize", String(merged.pageSize));
  if (merged.status && merged.status !== "all") next.set("status", String(merged.status));
  if (merged.source) next.set("source", String(merged.source));
  if (merged.hours) next.set("hours", String(merged.hours));
  const suffix = next.toString();
  return suffix ? `/stream?${suffix}` : "/stream";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function formatCompact(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, notation: "compact" }).format(value);
}

function formatNumber(value: number | undefined, maximumFractionDigits = 2): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, style: "percent" }).format(value);
}

function formatUri(uri: string | undefined) {
  if (!uri) return "-";
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return (
      <a className="text-accent hover:underline" href={uri} rel="noreferrer" target="_blank">
        {uri}
      </a>
    );
  }
  return <span className="text-muted">{uri}</span>;
}
