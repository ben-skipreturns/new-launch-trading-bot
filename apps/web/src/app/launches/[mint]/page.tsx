import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { ErrorPanel } from "../../../components/error-panel";
import { MetricCard } from "../../../components/metric-card";
import { DecisionBadge, RiskBadge, StatusBadge } from "../../../components/status-badge";
import { getLaunchDetail } from "../../../lib/data";
import { formatAge, formatDate, formatPct, formatScore, formatSol, shortMint } from "../../../lib/format";

export const dynamic = "force-dynamic";

export default async function LaunchDetailPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const detail = await getLaunchDetail(mint);
  const data = detail.data;

  if (!data) {
    return (
      <div className="page-wrap space-y-5">
        <Link className="text-sm font-semibold text-accent hover:text-ink" href="/launches">
          Back to launches
        </Link>
        <ErrorPanel message={detail.ok ? undefined : detail.error} />
        <EmptyState title="Launch not found" body="This mint has no score snapshot in the command-center query window." />
      </div>
    );
  }

  const launch = data.launch;
  const features = data.rawFeatures;

  return (
    <div className="page-wrap space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link className="text-sm font-semibold text-accent hover:text-ink" href="/launches">
            Back to launches
          </Link>
          <h1 className="mt-3 truncate text-3xl font-semibold tracking-normal text-ink">
            {launch.symbol ?? launch.name ?? shortMint(launch.mint)}
          </h1>
          <div className="mono-cell mt-2 break-all text-muted">{launch.mint}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DecisionBadge decision={launch.decision} />
          <RiskBadge riskScore={launch.riskScore} />
          {launch.memeTopicType ? <StatusBadge label={launch.memeTopicType.replace("_", " ")} tone="open" /> : null}
        </div>
      </header>

      <ErrorPanel message={detail.ok ? undefined : detail.error} />

      <section className="metric-grid">
        <MetricCard title="Meme relevance" value={formatScore(launch.memeRelevanceScore)} detail={launch.memeTopic ?? "No matched topic"} tone="accent" />
        <MetricCard title="Expected value" value={formatScore(launch.expectedValueScore)} detail={`Trend ${formatScore(launch.trendScore)}`} tone={launch.expectedValueScore >= 0.75 ? "good" : "neutral"} />
        <MetricCard title="Risk" value={formatScore(launch.riskScore)} detail="On-chain risk gate" tone={launch.riskScore <= 0.35 ? "good" : "bad"} />
        <MetricCard title="Latest price" value={formatSol(launch.latestPriceSol, 8)} detail={`Scored ${formatAge(launch.latestScoreAt)}`} tone="watch" />
      </section>

      <section className="grid grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] gap-4 max-[1120px]:grid-cols-1">
        <div className="panel rounded-md p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Meme-match evidence</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm max-[720px]:grid-cols-1">
            <Field label="Matched topic" value={launch.memeTopic ?? "-"} />
            <Field label="Topic type" value={launch.memeTopicType?.replace("_", " ") ?? "-"} />
            <Field label="Created" value={formatDate(launch.createdAt)} />
            <Field label="Latest score" value={formatDate(launch.latestScoreAt)} />
          </div>
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Evidence URLs</div>
            {data.memeEvidenceUrls.length ? (
              <div className="mt-2 space-y-2">
                {data.memeEvidenceUrls.map((url) => (
                  <a className="block truncate text-sm font-medium text-accent hover:text-ink" href={url} key={url} rel="noreferrer" target="_blank">
                    {url}
                  </a>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted">No evidence URLs stored for the latest match.</div>
            )}
          </div>
          <ReasonList title="Reject flags" items={data.memeRejectFlags} />
          <ReasonList title="Score reasons" items={launch.reasons} />
        </div>

        <div className="panel rounded-md p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Latest feature snapshot</h2>
          {features ? (
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Field label="Age" value={`${features.ageSeconds}s`} />
              <Field label="Curve SOL" value={formatSol(features.vSolInBondingCurve)} />
              <Field label="Curve progress" value={formatPct(features.bondingCurveProgress * 100)} />
              <Field label="Trades" value={String(features.tradeCount)} />
              <Field label="Buys / sells" value={`${features.buyCount} / ${features.sellCount}`} />
              <Field label="Unique traders" value={String(features.uniqueTraders)} />
              <Field label="Net SOL flow" value={formatSol(features.netSolFlow)} />
              <Field label="Largest buy" value={formatSol(features.largestBuySol)} />
              <Field label="Bot share" value={formatPct(features.botLikeShare * 100)} />
              <Field label="Wash share" value={formatPct(features.washTradeShare * 100)} />
              <Field label="Top holder" value={formatPct(features.topHolderShare * 100)} />
              <Field label="Insider" value={formatPct(features.insiderShare * 100)} />
            </div>
          ) : (
            <div className="mt-4 text-sm text-muted">No feature snapshot was stored with the latest score.</div>
          )}
        </div>
      </section>

      <section className="panel overflow-hidden rounded-md">
        <TableHeader title="Score history" />
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>As of</th>
                <th>Decision</th>
                <th>Grad</th>
                <th>Risk</th>
                <th>Trend</th>
                <th>EV</th>
                <th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {data.scoreHistory.map((score) => (
                <tr key={`${score.mint}-${score.asOf.toISOString()}`}>
                  <td>
                    <div>{formatAge(score.asOf)}</div>
                    <div className="text-xs text-muted">{formatDate(score.asOf)}</div>
                  </td>
                  <td>
                    <DecisionBadge decision={score.decision} />
                  </td>
                  <td>{formatScore(score.graduationProbability)}</td>
                  <td>{formatScore(score.riskScore)}</td>
                  <td>{formatScore(score.trendScore)}</td>
                  <td>{formatScore(score.expectedValueScore)}</td>
                  <td className="max-w-[420px] text-muted">{score.reasons.join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 max-[1120px]:grid-cols-1">
        <div className="panel overflow-hidden rounded-md">
          <TableHeader title="Paper orders" />
          {data.orders.length ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Side</th>
                    <th>Status</th>
                    <th>SOL</th>
                    <th>Price</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id}>
                      <td>{formatDate(order.createdAt)}</td>
                      <td>
                        <StatusBadge label={order.side} tone={order.side === "buy" ? "buy" : "watch"} />
                      </td>
                      <td>{order.status}</td>
                      <td>{formatSol(order.solAmount)}</td>
                      <td>{formatSol(order.priceSol, 8)}</td>
                      <td className="text-muted">{order.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="No paper orders" body="Orders appear once this launch reaches a buy or exit condition." />
            </div>
          )}
        </div>

        <div className="panel overflow-hidden rounded-md">
          <TableHeader title="Exit events" />
          {data.exits.length ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Reason</th>
                    <th>SOL</th>
                    <th>Price</th>
                    <th>Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {data.exits.map((exit) => (
                    <tr key={exit.id}>
                      <td>{formatDate(exit.occurredAt)}</td>
                      <td>{exit.reason.replaceAll("_", " ")}</td>
                      <td>{formatSol(exit.solAmount)}</td>
                      <td>{formatSol(exit.priceSol, 8)}</td>
                      <td>{formatSol(exit.feesSol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="No exits" body="Take-profit ladder, timeout, and stop-loss exits are listed here." />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white/70 px-3 py-2">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
    </div>
  );
}

function ReasonList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{title}</div>
      {items.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <StatusBadge label={item} key={item} tone="neutral" />
          ))}
        </div>
      ) : (
        <div className="mt-2 text-sm text-muted">None</div>
      )}
    </div>
  );
}

function TableHeader({ title }: { title: string }) {
  return <h2 className="border-b border-line px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>;
}
