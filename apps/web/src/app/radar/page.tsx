import type { ReactNode } from "react";

import { EmptyState } from "../../components/empty-state";
import { ErrorPanel } from "../../components/error-panel";
import { StatusBadge } from "../../components/status-badge";
import { getRadarReview } from "../../lib/data";
import { formatAge, formatDate, formatScore, formatUsd } from "../../lib/format";
import type { RadarReviewCandidate, RadarReviewTier } from "../../lib/types";

export const dynamic = "force-dynamic";

export default async function RadarReviewPage() {
  const review = await getRadarReview();
  const data = review.data;
  const run = data.latestRun;
  const candidates = [...data.active, ...data.watch, ...data.rejected];

  return (
    <div className="page-wrap space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Trend radar audit</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Radar Review</h1>
        </div>
        <div className="max-w-[34rem] text-sm leading-5 text-muted">
          Only <span className="font-semibold text-ink">active</span> topics feed token matching and paper-buy gates. Watch and rejected
          candidates are review-only audit output.
        </div>
      </header>

      <ErrorPanel message={review.ok ? undefined : review.error} />

      {run ? (
        <>
          <section className="grid grid-cols-6 gap-3 max-[1180px]:grid-cols-3 max-[760px]:grid-cols-2 max-[520px]:grid-cols-1">
            <RadarMetric label="Latest run" value={formatAge(run.startedAt)} detail={formatDate(run.startedAt)} />
            <RadarMetric label="Status" value={run.status} detail={run.promptVersion} />
            <RadarMetric label="Model" value={run.model} detail={`${run.webSearchCalls} web searches`} />
            <RadarMetric label="Active" value={String(data.active.length)} detail={`${run.acceptedTopicCount ?? run.topicsFound} accepted`} />
            <RadarMetric label="Watch" value={String(data.watch.length)} detail="app rejected" />
            <RadarMetric label="Rejected" value={String(data.rejected.length)} detail="model rejected" />
          </section>

          <section className="grid grid-cols-[minmax(0,1fr)_minmax(280px,0.34fr)] items-start gap-4 max-[980px]:grid-cols-1">
            <div className="panel rounded-md p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Latest run summary</h2>
                  <div className="mt-1 text-sm text-muted">
                    Window {formatDate(run.refreshWindowStartedAt)} to {formatDate(run.refreshWindowEndedAt)}
                  </div>
                </div>
                <StatusBadge label={run.status} tone={run.status === "success" ? "buy" : "reject"} />
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3 text-sm max-[820px]:grid-cols-2 max-[520px]:grid-cols-1">
                <RunStat label="Topics stored" value={String(run.topicsFound)} />
                <RunStat label="Model active" value={String(run.modelActiveTopicCount ?? "-")} />
                <RunStat label="Model rejected" value={String(run.modelRejectedCandidateCount ?? data.rejected.length)} />
                <RunStat label="Estimated cost" value={formatUsd(run.estimatedCostUsd)} />
              </div>
              {run.errorText ? <div className="mt-4 rounded-md border border-reject/25 bg-reject/10 p-3 text-sm text-reject">{run.errorText}</div> : null}
            </div>

            <div className="panel rounded-md p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Decision policy</h2>
              <div className="mt-3 space-y-3 text-sm leading-5 text-muted">
                <PolicyRow tier="active" body="Stored as trend observations and allowed to influence matching/paper buys." />
                <PolicyRow tier="watch" body="Model proposed it, but application gates blocked it. Review only." />
                <PolicyRow tier="rejected" body="Model rejected it before storage. Review only." />
              </div>
            </div>
          </section>

          <section className="panel overflow-hidden rounded-md">
            {candidates.length ? (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[1120px] table-fixed">
                  <colgroup>
                    <col className="w-[26%]" />
                    <col className="w-[9%]" />
                    <col className="w-[18%]" />
                    <col className="w-[27%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Tier</th>
                      <th>Scores</th>
                      <th>Reasons / risks</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => (
                      <tr key={candidate.id}>
                        <td>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold leading-5 text-ink">{candidate.canonicalPhrase}</div>
                            {candidate.topicType ? <StatusBadge label={candidate.topicType.replace("_", " ")} tone="open" /> : null}
                          </div>
                          {candidate.launchThesis ? <div className="topic-thesis mt-1 text-xs leading-4 text-muted">{candidate.launchThesis}</div> : null}
                          {candidate.matchedLaunches !== undefined ? (
                            <div className="mt-1 text-xs text-muted">{candidate.matchedLaunches} matched launches</div>
                          ) : null}
                        </td>
                        <td>
                          <TierBadge tier={candidate.tier} />
                        </td>
                        <td>
                          <div className="topic-score-grid">
                            <CompactStat label="Meme" value={formatScore(candidate.memeabilityScore)} />
                            <CompactStat label="Token" value={formatScore(candidate.tokenizationLikelihood)} />
                            <CompactStat label="Sat" value={formatScore(candidate.saturationRisk)} />
                            <CompactStat label="Vel" value={formatScore(candidate.velocityScore)} />
                            <CompactStat label="Novel" value={formatScore(candidate.noveltyScore)} />
                            <CompactStat label="Src" value={candidate.sourceCoverage === undefined ? "-" : String(candidate.sourceCoverage)} />
                          </div>
                        </td>
                        <td>
                          <SignalGroup label="Symbols">
                            <SignalList values={candidate.likelySymbols} tone="neutral" empty="-" />
                          </SignalGroup>
                          <SignalGroup label="Reasons">
                            <SignalList values={candidate.reasonCodes} tone="open" empty="no reasons" />
                          </SignalGroup>
                          {candidate.riskFlags.length ? (
                            <SignalGroup label="Risks">
                              <SignalList values={candidate.riskFlags} tone="reject" empty="" />
                            </SignalGroup>
                          ) : null}
                          {candidate.rejectionReasons.length ? (
                            <SignalGroup label="Rejection">
                              <SignalList values={candidate.rejectionReasons} tone={candidate.tier === "watch" ? "watch" : "reject"} empty="" />
                            </SignalGroup>
                          ) : null}
                        </td>
                        <td>
                          {candidate.evidenceUrls.length ? (
                            <div className="space-y-1">
                              {candidate.evidenceUrls.slice(0, 3).map((url) => (
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
                <EmptyState title="No radar candidates found" body="Run trend-refresh to populate active and rejected radar review output." />
              </div>
            )}
          </section>
        </>
      ) : (
        <EmptyState title="No radar runs found" body="Run trend-refresh to create a radar audit record." />
      )}
    </div>
  );
}

function RadarMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="panel rounded-md p-4">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-2 truncate text-lg font-semibold text-ink">{value}</div>
      <div className="mt-1 break-words text-xs text-muted">{detail}</div>
    </div>
  );
}

function RunStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-tile rounded-md p-3">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 font-semibold text-ink">{value}</div>
    </div>
  );
}

function PolicyRow({ tier, body }: { tier: RadarReviewTier; body: string }) {
  return (
    <div>
      <TierBadge tier={tier} />
      <div className="mt-1">{body}</div>
    </div>
  );
}

function TierBadge({ tier }: { tier: RadarReviewTier }) {
  if (tier === "active") return <StatusBadge label="active" tone="buy" />;
  if (tier === "watch") return <StatusBadge label="watch" tone="watch" />;
  return <StatusBadge label="rejected" tone="reject" />;
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

function SignalList({ values, tone, empty }: { values: string[]; tone: "open" | "watch" | "reject" | "neutral"; empty: string }) {
  if (!values.length) return empty ? <span className="text-sm text-muted">{empty}</span> : null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5">
      {values.slice(0, 6).map((value) => (
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
