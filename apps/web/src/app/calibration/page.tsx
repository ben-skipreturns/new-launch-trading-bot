import Link from "next/link";
import { EmptyState } from "../../components/empty-state";
import { ErrorPanel } from "../../components/error-panel";
import { MetricCard } from "../../components/metric-card";
import { StatusBadge } from "../../components/status-badge";
import { getMatcherCalibrationReport } from "../../lib/data";
import { formatAge, formatDate, formatScore, shortMint } from "../../lib/format";
import type { MatcherCalibrationItem } from "../../lib/types";

export const dynamic = "force-dynamic";

export default async function CalibrationPage() {
  const report = await getMatcherCalibrationReport();
  const data = report.data;

  return (
    <div className="page-wrap space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Matcher tuning</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Calibration</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Review edge cases from stored token_meme_matches before changing thresholds or penalties.
          </p>
        </div>
        <div className="surface-muted rounded-full px-3 py-1.5 text-sm font-semibold text-muted">
          Generated {formatAge(data.generatedAt)}
        </div>
      </header>

      <ErrorPanel message={report.ok ? undefined : report.error} />

      <section className="grid grid-cols-6 gap-3 max-[1320px]:grid-cols-3 max-[760px]:grid-cols-2 max-[520px]:grid-cols-1">
        <MetricCard title="Matches" value={compact(data.summary.totalMatches)} detail={`latest ${formatDate(data.summary.latestObservedAt)}`} tone="accent" />
        <MetricCard title="Passes" value={compact(data.summary.passes)} detail="No matcher reject flags" tone="good" />
        <MetricCard title="Rejects" value={compact(data.summary.rejects)} detail="Blocked before scoring" tone="bad" />
        <MetricCard title="Generic rejects" value={compact(data.summary.genericRejects)} detail="Copycat/generic penalties" tone="watch" />
        <MetricCard title="Metadata failures" value={compact(data.summary.metadataFailures)} detail="Cached URI failures" />
        <MetricCard title="Near misses" value={compact(data.summary.weakOverlapRejects)} detail="Score 0.40-0.70" tone="watch" />
      </section>

      {data.summary.totalMatches === 0 ? (
        <EmptyState title="No matcher data found" body="Run match:launches or match:stream without --dry-run to write token_meme_matches." />
      ) : (
        <>
          <CalibrationSection
            title="Highest-scoring rejects"
            body="These are the most important false-negative candidates to review. If they look good, tune penalties or thresholds."
            items={data.highestScoringRejects}
          />
          <CalibrationSection
            title="Lowest-scoring passes"
            body="These are the weakest accepted matches. If they look low quality, tighten matching or topic quality gates."
            items={data.lowestScoringPasses}
          />
          <CalibrationSection
            title="Generic copycat rejects"
            body="Generic symbols and copycat wording should usually stay rejected unless metadata proves a specific fresh topic."
            items={data.genericCopycatRejects}
          />
          <CalibrationSection
            title="Metadata failures"
            body="Repeated failures are useful for tuning URI handling, gateway choices, and retry policy."
            items={data.metadataFailures}
          />
          <CalibrationSection
            title="Near-miss topic overlap"
            body="Rejected matches with meaningful overlap. This bucket is useful for finding missed aliases and weak topic phrasing."
            items={data.weakOverlapRejects}
          />
        </>
      )}
    </div>
  );
}

function CalibrationSection({ title, body, items }: { title: string; body: string; items: MatcherCalibrationItem[] }) {
  return (
    <section className="panel overflow-hidden rounded-md">
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>
            <p className="mt-1 max-w-4xl text-sm leading-5 text-muted">{body}</p>
          </div>
          <StatusBadge label={`${items.length} rows`} />
        </div>
      </div>
      {items.length ? (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1040px]">
            <thead>
              <tr>
                <th>Token</th>
                <th>Score</th>
                <th>Topic</th>
                <th>Matched alias</th>
                <th>Flags</th>
                <th>Decision</th>
                <th>Observed</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${title}-${item.mint}-${item.observedAt.toISOString()}`}>
                  <td className="min-w-[210px]">
                    <Link className="font-semibold text-ink hover:text-accent" href={`/launches/${item.mint}`}>
                      {item.symbol ?? item.name ?? shortMint(item.mint)}
                    </Link>
                    {item.name && item.symbol ? <div className="mt-0.5 text-sm text-muted">{item.name}</div> : null}
                    <div className="mono-cell mt-0.5 text-muted">{shortMint(item.mint)}</div>
                  </td>
                  <td className="font-semibold text-ink">{formatScore(item.memeRelevanceScore)}</td>
                  <td className="max-w-[220px]">
                    <div className="truncate">{item.canonicalPhrase ?? "-"}</div>
                    {item.topicType ? <div className="text-xs text-muted">{item.topicType.replace("_", " ")}</div> : null}
                  </td>
                  <td className="max-w-[200px] truncate text-muted">{item.matchedAlias ?? "-"}</td>
                  <td className="max-w-[360px]">
                    <div className="flex flex-wrap gap-1.5">
                      {item.rejectFlags.slice(0, 4).map((flag) => (
                        <StatusBadge label={flag.replaceAll("_", " ")} tone="reject" key={flag} />
                      ))}
                      {item.metadataFailureReason ? <StatusBadge label={item.metadataFailureReason.replaceAll("_", " ")} tone="watch" /> : null}
                      {!item.rejectFlags.length && !item.metadataFailureReason ? <StatusBadge label="pass" tone="buy" /> : null}
                    </div>
                  </td>
                  <td>
                    <StatusBadge
                      label={item.decision.replaceAll("_", " ")}
                      tone={item.decision === "paper_buy" ? "buy" : item.decision === "reject" ? "reject" : item.decision === "watch" ? "watch" : "neutral"}
                    />
                    {item.expectedValueScore !== undefined ? <div className="mt-1 text-xs text-muted">EV {formatScore(item.expectedValueScore)}</div> : null}
                  </td>
                  <td>
                    <div>{formatAge(item.observedAt)}</div>
                    <div className="text-xs text-muted">{formatDate(item.observedAt)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 text-sm text-muted">No rows in this bucket.</div>
      )}
    </section>
  );
}

function compact(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" }).format(value);
}
