import Link from "next/link";
import type React from "react";
import { EmptyState } from "../../components/empty-state";
import { ErrorPanel } from "../../components/error-panel";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { getRawLaunchPage } from "../../lib/data";
import { formatAge, formatDate, formatSol, shortMint } from "../../lib/format";
import type { RawLaunchListItem } from "../../lib/types";

export const dynamic = "force-dynamic";

const pageSizes = [25, 50, 100];

export default async function StreamPage({ searchParams }: { searchParams?: Promise<{ page?: string; pageSize?: string }> }) {
  const params = await searchParams;
  const page = parsePositiveInt(params?.page, 1);
  const pageSize = pageSizes.includes(parsePositiveInt(params?.pageSize, 25)) ? parsePositiveInt(params?.pageSize, 25) : 25;
  const launches = await getRawLaunchPage(page, pageSize);

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
              href={`/stream?page=1&pageSize=${size}`}
              key={size}
            >
              {size}
            </Link>
          ))}
        </div>
      </header>

      <ErrorPanel message={launches.ok ? undefined : launches.error} />

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
          <PageLink disabled={!launches.data.hasPrevious} href={`/stream?page=${Math.max(1, launches.data.page - 1)}&pageSize=${launches.data.pageSize}`}>
            Previous
          </PageLink>
          <PageLink disabled={!launches.data.hasNext} href={`/stream?page=${launches.data.page + 1}&pageSize=${launches.data.pageSize}`}>
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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function formatCompact(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, notation: "compact" }).format(value);
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
