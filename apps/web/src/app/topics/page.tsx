import type { ReactNode } from "react";

import { EmptyState } from "../../components/empty-state";
import { ErrorPanel } from "../../components/error-panel";
import { StatusBadge } from "../../components/status-badge";
import { getTopicList, getTrendRadarStatus } from "../../lib/data";
import { formatAge, formatDate, formatScore, formatUsd } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const [topics, trendRadar] = await Promise.all([getTopicList(), getTrendRadarStatus()]);

  return (
    <div className="page-wrap space-y-5">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Trend cache</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Topics</h1>
      </header>

      <ErrorPanel message={topics.ok ? (trendRadar.ok ? undefined : trendRadar.error) : topics.error} />

      <section className="grid grid-cols-5 gap-3 max-[1100px]:grid-cols-2 max-[680px]:grid-cols-1">
        <RadarMetric label="Latest run" value={trendRadar.data.latestRunAt ? formatAge(trendRadar.data.latestRunAt) : "missing"} />
        <RadarMetric label="Model" value={trendRadar.data.model ?? "-"} />
        <RadarMetric label="Status" value={trendRadar.data.latestStatus ?? "missing"} />
        <RadarMetric label="Latest cost" value={formatUsd(trendRadar.data.latestEstimatedCostUsd)} />
        <RadarMetric label="MTD cost" value={formatUsd(trendRadar.data.estimatedCostMonthUsd)} />
      </section>

      <section className="panel overflow-hidden rounded-md">
        {topics.data.length ? (
          <div className="overflow-x-auto">
            <table className="data-table topics-table">
              <colgroup>
                <col className="w-[31%]" />
                <col className="w-[19%]" />
                <col className="w-[28%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Scores</th>
                  <th>Signals</th>
                  <th>Activity</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {topics.data.map((topic) => (
                  <tr key={topic.id}>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold leading-5 text-ink">{topic.canonicalPhrase}</div>
                        <StatusBadge label={topic.topicType.replace("_", " ")} tone="open" />
                      </div>
                      {topic.launchThesis ? <div className="topic-thesis mt-1 text-xs leading-4 text-muted">{topic.launchThesis}</div> : null}
                      <div className="mt-1 text-xs text-muted">first seen {formatDate(topic.firstSeen)}</div>
                    </td>
                    <td>
                      <div className="topic-score-grid">
                        <CompactStat label="Meme" value={formatScore(topic.memeabilityScore)} />
                        <CompactStat label="Token" value={formatScore(topic.tokenizationLikelihood)} />
                        <CompactStat label="Sat" value={formatScore(topic.saturationRisk)} />
                        <CompactStat label="Vel" value={formatScore(topic.velocityScore)} />
                        <CompactStat label="Novel" value={formatScore(topic.noveltyScore)} />
                        <CompactStat label="Src" value={String(topic.sourceCoverage)} />
                      </div>
                    </td>
                    <td>
                      <SignalGroup label="Symbols">
                        {topic.likelySymbols.length ? (
                          <div className="flex flex-wrap gap-1">
                            {topic.likelySymbols.slice(0, 5).map((symbol) => (
                              <StatusBadge label={symbol} key={symbol} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </SignalGroup>
                      <SignalGroup label="Reasons">
                        <SignalList values={topic.reasonCodes} tone="open" empty="no reasons" />
                      </SignalGroup>
                      {topic.riskFlags.length ? (
                        <SignalGroup label="Risks">
                          <SignalList values={topic.riskFlags} tone="reject" empty="" />
                        </SignalGroup>
                      ) : null}
                    </td>
                    <td>
                      <div className="font-semibold text-ink">{topic.matchedLaunches} matches</div>
                      <div className="mt-1 text-xs text-muted">seen {formatAge(topic.lastSeen)}</div>
                      <div className="text-xs text-muted">{formatDate(topic.lastSeen)}</div>
                    </td>
                    <td>
                      {topic.evidenceUrls.length ? (
                        <div className="space-y-1">
                          {topic.evidenceUrls.slice(0, 2).map((url) => (
                            <a className="evidence-link hover:text-ink" href={url} key={url} rel="noreferrer" target="_blank" title={url}>
                              <span>{evidenceLabel(url)}</span>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="No topics found" body="Use trend-refresh or ingestion startup to run the OpenAI meme radar." />
          </div>
        )}
      </section>
    </div>
  );
}

function RadarMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-md p-4">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-2 truncate text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-stack-row">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

function SignalGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="signal-group">
      <div className="signal-group-label">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function SignalList({ values, tone, empty }: { values: string[]; tone: "open" | "reject"; empty: string }) {
  if (!values.length) return empty ? <span className="text-sm text-muted">{empty}</span> : null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5">
      {values.slice(0, 5).map((value) => (
        <StatusBadge label={value.replaceAll("_", " ")} tone={tone} key={value} />
      ))}
    </div>
  );
}

function evidenceLabel(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
