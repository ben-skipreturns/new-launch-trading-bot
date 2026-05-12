import Link from "next/link";
import { EmptyState } from "../../components/empty-state";
import { ErrorPanel } from "../../components/error-panel";
import { MetricCard } from "../../components/metric-card";
import { DecisionBadge, StatusBadge } from "../../components/status-badge";
import { getDecisionReview } from "../../lib/data";
import { formatAge, formatDate, formatScore, formatSol, shortMint } from "../../lib/format";
import type { AlmostBuyItem, DecisionGateBreakdown, DecisionReview, GateBlockedLaunch, PositionLifecycleItem } from "../../lib/types";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const review = await getDecisionReview();

  return (
    <div className="page-wrap space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Decision review</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Decisions</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Read-only funnel, gate breakdown, strategy settings, and blocked-buy review for scoring and paper-trading behavior.
          </p>
        </div>
        <div className="text-right text-sm text-muted">
          <div>Generated {formatAge(review.data.generatedAt)}</div>
          <div>{formatDate(review.data.generatedAt)}</div>
        </div>
      </header>

      <ErrorPanel message={review.ok ? undefined : review.error} />

      <DecisionFunnel review={review.data} />
      <PaperStrategy review={review.data} />
      <GateBreakdowns gates={review.data.gates} />
      <BlockedBuyReview items={review.data.almostBuys} />
      <PositionLifecycle positions={review.data.positionLifecycle} />
    </div>
  );
}

function DecisionFunnel({ review }: { review: DecisionReview }) {
  return (
    <section className="space-y-3">
      <SectionHeader label="Filtering funnel" description="Sequential counts from launch ingestion through paper-broker acceptance and exits." />
      {review.funnel.length ? (
        <div className="grid gap-3 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
          {review.funnel.map((step) => (
            <MetricCard
              detail={step.previousCount === undefined ? step.description : `${formatConversion(step.count, step.previousCount)} of previous`}
              key={step.key}
              title={step.label}
              tone={step.key.includes("buy") || step.key.includes("position") ? "good" : step.key.includes("gate") ? "watch" : "neutral"}
              value={step.count.toLocaleString("en-US")}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No decision data" body="Replay fixture data or run live streaming with persistence to populate the decision funnel." />
      )}
    </section>
  );
}

function PaperStrategy({ review }: { review: DecisionReview }) {
  const strategy = review.strategy;
  return (
    <section className="panel rounded-md p-4">
      <SectionHeader label="Paper strategy" description="Current read-only strategy defaults used by scoring and paper execution." />
      <div className="mt-4 grid gap-3 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
        <Field label="Buy size" value={formatSol(strategy.buySizeSol)} />
        <Field label="Daily cap" value={formatSol(strategy.dailySpendCapSol)} />
        <Field label="Max positions" value={String(strategy.maxConcurrentPositions)} />
        <Field label="Meme threshold" value={formatScore(strategy.memeThreshold)} />
        <Field label="Risk threshold" value={formatScore(strategy.riskThreshold)} />
        <Field label="EV threshold" value={formatScore(strategy.expectedValueThreshold)} />
        <Field label="Min buys / traders" value={`${strategy.minBuyCount} / ${strategy.minUniqueTraders}`} />
        <Field label="Min net flow" value={formatSol(strategy.minNetSolFlow)} />
        <Field label="Max sell pressure" value={formatPercent(strategy.maxSellPressure)} />
        <Field label="Min curve progress" value={formatPercent(strategy.minBondingCurveProgress)} />
        <Field label="Entry window" value={`${Math.round(strategy.maxEntryAgeSeconds / 60)}m`} />
        <Field label="Stop loss" value={`-${formatPercent(strategy.stopLossPct)}`} />
        <Field label="Timeout" value={`${strategy.timeoutHours}h unless trend holds`} />
        <Field label="Trailing stop" value={`${strategy.trailingStopActivationMultiple}x / ${formatPercent(strategy.trailingStopDrawdownPct)} drawdown`} />
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        <div className="field-tile rounded-md p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Exit ladder</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {strategy.exitLadder.map((step) => (
              <StatusBadge key={step.label} label={`${Math.round(step.portion * 100)}% at ${step.multiple}x`} tone="buy" />
            ))}
            <StatusBadge label="moonbag trails" tone="open" />
          </div>
        </div>
        <div className="field-tile rounded-md p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Exposure caps</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {strategy.exposureCaps.map((cap) => (
              <StatusBadge key={cap} label={cap} tone="neutral" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GateBreakdowns({ gates }: { gates: DecisionGateBreakdown[] }) {
  return (
    <section className="space-y-3">
      <SectionHeader label="Gate breakdown" description="Why launches were blocked at each stage, evaluated in lifecycle order." />
      {gates.length ? (
        <div className="grid gap-4 min-[1180px]:grid-cols-2">
          {gates.map((gate) => (
            <GateCard gate={gate} key={gate.key} />
          ))}
        </div>
      ) : (
        <EmptyState title="No gate decisions" body="Scored launches are required before gate breakdowns can be calculated." />
      )}
    </section>
  );
}

function GateCard({ gate }: { gate: DecisionGateBreakdown }) {
  return (
    <article className="panel rounded-md p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">{gate.label}</h2>
          <p className="mt-1 max-w-xl text-sm leading-5 text-muted">{gate.description}</p>
        </div>
        <StatusBadge label={`${gate.inputCount} reviewed`} tone="neutral" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <GateStat label="Passed" value={gate.passed} tone="text-buy" />
        <GateStat label="Blocked" value={gate.blocked} tone={gate.blocked ? "text-reject" : "text-muted"} />
        <GateStat label="Pass rate" value={formatConversion(gate.passed, gate.inputCount)} tone="text-ink" />
      </div>
      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Top reasons</div>
        {gate.reasonCounts.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {gate.reasonCounts.map((item) => (
              <StatusBadge key={item.reason} label={`${reasonLabel(item.reason)} ${item.count}`} tone="reject" />
            ))}
          </div>
        ) : (
          <div className="mt-2 text-sm text-muted">No blocks recorded for this gate.</div>
        )}
      </div>
      {gate.recentBlocked.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[680px]">
            <thead>
              <tr>
                <th>Token</th>
                <th>Blocked by</th>
                <th>Decision</th>
                <th>Scores</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody>
              {gate.recentBlocked.map((launch) => (
                <BlockedLaunchRow item={launch} key={`${gate.key}:${launch.mint}:${launch.blockedBy ?? "blocked"}`} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

function BlockedBuyReview({ items }: { items: AlmostBuyItem[] }) {
  return (
    <section className="panel overflow-hidden rounded-md">
      <div className="border-b border-line p-4">
        <SectionHeader label="Blocked buy review" description="High meme-relevance launches that were close to buying but stopped by one or two gates." />
      </div>
      {items.length ? (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th>Token</th>
                <th>Decision</th>
                <th>Blocked gates</th>
                <th>Meme</th>
                <th>Risk</th>
                <th>EV</th>
                <th>Reasons</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <AlmostBuyRow item={item} key={item.mint} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          <EmptyState title="No almost-buys found" body="This appears when a launch has strong meme relevance but is blocked by a small number of downstream gates." />
        </div>
      )}
    </section>
  );
}

function PositionLifecycle({ positions }: { positions: PositionLifecycleItem[] }) {
  return (
    <section className="panel overflow-hidden rounded-md">
      <div className="border-b border-line p-4">
        <SectionHeader label="Position lifecycle" description="Open and recent paper positions with ladder, moonbag, stop, trailing, and timeout state." />
      </div>
      {positions.length ? (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1040px]">
            <thead>
              <tr>
                <th>Token</th>
                <th>Status</th>
                <th>Multiple</th>
                <th>Moonbag</th>
                <th>Ladder hit</th>
                <th>Next exit</th>
                <th>Stop / trail</th>
                <th>Timeout</th>
                <th>PnL</th>
                <th>Entry reasons</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <PositionLifecycleRow key={position.mint} position={position} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          <EmptyState title="No paper positions" body="Positions appear after a paper-buy signal passes broker exposure and spend caps." />
        </div>
      )}
    </section>
  );
}

function BlockedLaunchRow({ item }: { item: GateBlockedLaunch }) {
  return (
    <tr>
      <td className="min-w-[180px]">
        <TokenLink item={item} />
      </td>
      <td>{item.blockedBy ? <StatusBadge label={reasonLabel(item.blockedBy)} tone="reject" /> : "-"}</td>
      <td>
        <DecisionBadge decision={item.decision} />
      </td>
      <td className="text-sm text-muted">
        <div>Meme {formatScore(item.memeRelevanceScore)}</div>
        <div>Risk {formatScore(item.riskScore)}</div>
        <div>EV {formatScore(item.expectedValueScore)}</div>
      </td>
      <td>
        <div>{formatAge(item.latestScoreAt)}</div>
        <div className="text-xs text-muted">{formatDate(item.latestScoreAt)}</div>
      </td>
    </tr>
  );
}

function AlmostBuyRow({ item }: { item: AlmostBuyItem }) {
  return (
    <tr>
      <td className="min-w-[190px]">
        <TokenLink item={item} />
      </td>
      <td>
        <DecisionBadge decision={item.decision} />
      </td>
      <td>
        <div className="flex flex-wrap gap-1.5">
          {item.blockedGates.map((gate) => (
            <StatusBadge key={gate} label={gate} tone="watch" />
          ))}
        </div>
      </td>
      <td>{formatScore(item.memeRelevanceScore)}</td>
      <td>{formatScore(item.riskScore)}</td>
      <td>{formatScore(item.expectedValueScore)}</td>
      <td className="max-w-[360px] text-sm text-muted">{item.reasons.slice(0, 5).map(reasonLabel).join(", ") || "-"}</td>
      <td>
        <div>{formatAge(item.latestScoreAt)}</div>
        <div className="text-xs text-muted">{formatDate(item.latestScoreAt)}</div>
      </td>
    </tr>
  );
}

function PositionLifecycleRow({ position }: { position: PositionLifecycleItem }) {
  return (
    <tr>
      <td className="min-w-[180px]">
        <TokenLink item={position} />
      </td>
      <td>
        <StatusBadge label={position.status} tone={position.status === "open" ? "open" : "closed"} />
      </td>
      <td>{position.currentMultiple ? `${position.currentMultiple.toFixed(2)}x` : "-"}</td>
      <td>{formatPercent(position.moonbagPct / 100)}</td>
      <td>
        <div className="flex flex-wrap gap-1.5">
          {position.ladderHits.length ? position.ladderHits.map((hit) => <StatusBadge key={hit} label={hit} tone="buy" />) : <span className="text-muted">-</span>}
        </div>
      </td>
      <td>{position.nextExitTrigger}</td>
      <td className="text-sm text-muted">{position.stopState}</td>
      <td className="text-sm text-muted">{position.timeoutState}</td>
      <td className={position.estimatedPnlSol >= 0 ? "font-semibold text-buy" : "font-semibold text-reject"}>{formatSol(position.estimatedPnlSol)}</td>
      <td className="max-w-[320px] text-sm text-muted">{position.entryReasons.map(reasonLabel).join(", ") || "-"}</td>
    </tr>
  );
}

function TokenLink({ item }: { item: { mint: string; name?: string; symbol?: string } }) {
  return (
    <>
      <Link className="font-semibold hover:text-accent" href={`/launches/${item.mint}`}>
        {item.symbol ?? item.name ?? shortMint(item.mint)}
      </Link>
      <div className="mono-cell mt-0.5 text-muted">{shortMint(item.mint)}</div>
    </>
  );
}

function GateStat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="field-tile rounded-md p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone}`}>{typeof value === "number" ? value.toLocaleString("en-US") : value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-tile rounded-md p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function SectionHeader({ label, description }: { label: string; description: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-muted">{label}</h2>
      <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
    </div>
  );
}

function formatConversion(count: number, previousCount: number): string {
  if (!previousCount) return "0%";
  return `${((count / previousCount) * 100).toFixed(1)}%`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function reasonLabel(reason: string): string {
  if (reason.startsWith("MEME_TOPIC:")) return `topic: ${reason.slice("MEME_TOPIC:".length)}`;
  return reason.toLowerCase().replaceAll("_", " ");
}
