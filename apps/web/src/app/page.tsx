import Link from "next/link";
import { EmptyState } from "../components/empty-state";
import { ErrorPanel } from "../components/error-panel";
import { MetricCard } from "../components/metric-card";
import { DecisionBadge, RiskBadge, StatusBadge } from "../components/status-badge";
import { getDashboardSummary } from "../lib/data";
import { formatAge, formatDate, formatPct, formatScore, formatSol, shortMint } from "../lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const summary = await getDashboardSummary();
  const data = summary.data;

  return (
    <div className="page-wrap space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Paper trading telemetry</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Dashboard</h1>
        </div>
        <div className="text-right text-sm text-muted">
          Generated {formatAge(data.generatedAt)}
          <br />
          {formatDate(data.generatedAt)}
        </div>
      </header>

      <ErrorPanel message={summary.ok ? undefined : summary.error} />

      <section className="grid grid-cols-3 gap-3 max-[1100px]:grid-cols-1">
        <HealthItem label="Raw events" value={data.health.latestRawEventAt} />
        <HealthItem label="Scores" value={data.health.latestScoreAt} />
        <HealthItem label="Trend observations" value={data.health.latestTrendObservationAt} />
      </section>

      <section className="metric-grid">
        <MetricCard title="Active topics" value={String(data.metrics.activeTopics)} detail="Meme topics in trend cache" tone="accent" />
        <MetricCard title="Recent candidates" value={String(data.metrics.recentCandidates)} detail="Latest scored launches" />
        <MetricCard title="Open positions" value={String(data.metrics.openPositions)} detail={`${data.metrics.closedPositions} closed`} tone="good" />
        <MetricCard title="Filled orders" value={`${data.metrics.filledBuys}/${data.metrics.filledSells}`} detail="buy / sell fills" />
        <MetricCard title="Realized PnL" value={formatSol(data.metrics.realizedPnlSol)} detail="Closed and partial exits" tone={data.metrics.realizedPnlSol >= 0 ? "good" : "bad"} />
        <MetricCard title="Open value" value={formatSol(data.metrics.estimatedOpenValueSol)} detail="Mark based on latest score price" tone="watch" />
      </section>

      <section className="grid grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] gap-4 max-[1180px]:grid-cols-1">
        <div className="panel overflow-hidden rounded-md">
          <SectionHeader title="Recent candidates" href="/launches" />
          {data.recentCandidates.length ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Decision</th>
                    <th>Meme</th>
                    <th>Risk</th>
                    <th>EV</th>
                    <th>Topic</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentCandidates.map((launch) => (
                    <tr key={launch.mint}>
                      <td>
                        <Link className="font-semibold hover:text-accent" href={`/launches/${launch.mint}`}>
                          {launch.symbol ?? launch.name ?? shortMint(launch.mint)}
                        </Link>
                        <div className="mono-cell mt-0.5 text-muted">{shortMint(launch.mint)}</div>
                      </td>
                      <td>
                        <DecisionBadge decision={launch.decision} />
                      </td>
                      <td>{formatScore(launch.memeRelevanceScore)}</td>
                      <td>
                        <RiskBadge riskScore={launch.riskScore} />
                      </td>
                      <td>{formatScore(launch.expectedValueScore)}</td>
                      <td className="max-w-[220px] truncate text-muted">{launch.memeTopic ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="No scored candidates yet" body="Run ingestion or replay to populate score snapshots." />
            </div>
          )}
        </div>

        <div className="panel overflow-hidden rounded-md">
          <SectionHeader title="Active meme topics" href="/topics" />
          {data.activeTopics.length ? (
            <div className="divide-y divide-line/80">
              {data.activeTopics.map((topic) => (
                <div className="p-4" key={topic.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{topic.canonicalPhrase}</div>
                      <div className="mt-1 text-sm text-muted">{topic.topicType.replace("_", " ")}</div>
                    </div>
                    <StatusBadge label={`${topic.matchedLaunches} matches`} tone="open" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <TopicStat label="Vel" value={formatScore(topic.velocityScore)} />
                    <TopicStat label="Novel" value={formatScore(topic.noveltyScore)} />
                    <TopicStat label="Src" value={String(topic.sourceCoverage)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="No active topics" body="Run trend-refresh or ingestion startup to hydrate trend topics." />
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 max-[1180px]:grid-cols-1">
        <div className="panel overflow-hidden rounded-md">
          <SectionHeader title="Open moonbags" href="/positions" />
          {data.openPositions.length ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Moonbag</th>
                    <th>Entry</th>
                    <th>Latest</th>
                    <th>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openPositions.map((position) => (
                    <tr key={position.mint}>
                      <td>
                        <Link className="font-semibold hover:text-accent" href={`/launches/${position.mint}`}>
                          {position.symbol ?? position.name ?? shortMint(position.mint)}
                        </Link>
                        <div className="mono-cell mt-0.5 text-muted">{shortMint(position.mint)}</div>
                      </td>
                      <td>{formatPct(position.moonbagPct)}</td>
                      <td>{formatSol(position.entryPriceSol, 8)}</td>
                      <td>{formatSol(position.latestPriceSol, 8)}</td>
                      <td className={position.estimatedPnlSol >= 0 ? "text-buy" : "text-reject"}>{formatSol(position.estimatedPnlSol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="No open positions" body="Paper buys that pass meme and risk gates will appear here." />
            </div>
          )}
        </div>

        <div className="panel overflow-hidden rounded-md">
          <SectionHeader title="Recent exits" href="/positions" />
          {data.recentExits.length ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mint</th>
                    <th>Reason</th>
                    <th>Amount</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentExits.map((exit) => (
                    <tr key={exit.id}>
                      <td className="mono-cell">{shortMint(exit.mint)}</td>
                      <td>{exit.reason.replaceAll("_", " ")}</td>
                      <td>{formatSol(exit.solAmount)}</td>
                      <td>{formatSol(exit.priceSol, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="No exits recorded" body="Take-profit, stop, timeout, and trailing exits will show here." />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function HealthItem({ label, value }: { label: string; value?: Date }) {
  return (
    <div className="panel flex items-center justify-between gap-4 rounded-md p-4">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="mt-1 text-sm text-muted">{formatDate(value)}</div>
      </div>
      <StatusBadge label={value ? formatAge(value) : "missing"} tone={value ? "open" : "neutral"} />
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>
      <Link className="text-sm font-semibold text-accent hover:text-ink" href={href}>
        View all
      </Link>
    </div>
  );
}

function TopicStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white/70 px-2 py-1.5">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
