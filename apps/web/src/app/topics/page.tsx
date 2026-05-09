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
            <table className="data-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Type</th>
                  <th>Radar</th>
                  <th>Momentum</th>
                  <th>Symbols</th>
                  <th>Reasons / risks</th>
                  <th>Matches</th>
                  <th>Last seen</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {topics.data.map((topic) => (
                  <tr key={topic.id}>
                    <td className="min-w-[220px]">
                      <div className="font-semibold">{topic.canonicalPhrase}</div>
                      {topic.launchThesis ? <div className="mt-1 max-w-[320px] text-xs text-muted">{topic.launchThesis}</div> : null}
                      <div className="text-xs text-muted">first seen {formatDate(topic.firstSeen)}</div>
                    </td>
                    <td>
                      <StatusBadge label={topic.topicType.replace("_", " ")} tone="open" />
                    </td>
                    <td className="min-w-[130px]">
                      <CompactStat label="Meme" value={formatScore(topic.memeabilityScore)} />
                      <CompactStat label="Tokenize" value={formatScore(topic.tokenizationLikelihood)} />
                      <CompactStat label="Sat" value={formatScore(topic.saturationRisk)} />
                    </td>
                    <td className="min-w-[120px]">
                      <CompactStat label="Vel" value={formatScore(topic.velocityScore)} />
                      <CompactStat label="Novel" value={formatScore(topic.noveltyScore)} />
                      <CompactStat label="Src" value={String(topic.sourceCoverage)} />
                    </td>
                    <td className="min-w-[150px]">
                      {topic.likelySymbols.length ? (
                        <div className="flex flex-wrap gap-1">
                          {topic.likelySymbols.slice(0, 5).map((symbol) => (
                            <StatusBadge label={symbol} key={symbol} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="min-w-[220px]">
                      <SignalList values={topic.reasonCodes} tone="open" empty="no reasons" />
                      {topic.riskFlags.length ? <SignalList values={topic.riskFlags} tone="reject" empty="" /> : null}
                    </td>
                    <td>{topic.matchedLaunches}</td>
                    <td>
                      <div>{formatAge(topic.lastSeen)}</div>
                      <div className="text-xs text-muted">{formatDate(topic.lastSeen)}</div>
                    </td>
                    <td className="max-w-[360px]">
                      {topic.evidenceUrls.length ? (
                        <div className="space-y-1">
                          {topic.evidenceUrls.slice(0, 2).map((url) => (
                            <a className="block truncate text-sm font-medium text-accent hover:text-ink" href={url} key={url} rel="noreferrer" target="_blank">
                              {url}
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
    <div className="panel rounded-md p-3">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SignalList({ values, tone, empty }: { values: string[]; tone: "open" | "reject"; empty: string }) {
  if (!values.length) return empty ? <span className="text-sm text-muted">{empty}</span> : null;
  return (
    <div className="mb-1 flex flex-wrap gap-1">
      {values.slice(0, 4).map((value) => (
        <StatusBadge label={value.replaceAll("_", " ")} tone={tone} key={value} />
      ))}
    </div>
  );
}
