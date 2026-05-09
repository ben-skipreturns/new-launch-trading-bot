import type { PaperPosition, ScoreSnapshot } from "../domain/types.js";
import type { Store } from "../storage/store.js";
import { round } from "../utils/math.js";

export async function generateDailyReport(store: Store, from?: Date, to?: Date): Promise<string> {
  const scores = await store.listScoreSnapshots(from, to);
  const orders = await store.listPaperOrders(from, to);
  const exits = await store.listExitEvents(from, to);
  const positions = await store.listPaperPositions();
  const buys = orders.filter((order) => order.side === "buy" && order.status === "filled");
  const sells = orders.filter((order) => order.side === "sell" && order.status === "filled");
  const realized = sells.reduce((total, order) => total + order.solAmount, 0) - buys.reduce((total, order) => total + order.solAmount, 0);
  const openValue = estimateOpenValue(positions, scores);
  const falsePositives = positions.filter((position) => position.status === "closed" && position.solRealized < position.solInvested).length;
  const missedWinners = estimateMissedWinners(scores, buys.map((order) => order.mint));
  const reasonCounts = countReasons(scores);

  return [
    "# Moonshot Paper Trader Report",
    "",
    `Window: ${from?.toISOString() ?? "beginning"} to ${to?.toISOString() ?? "now"}`,
    "",
    "## Portfolio",
    "",
    `- Filled buys: ${buys.length}`,
    `- Filled sells: ${sells.length}`,
    `- Realized PnL: ${round(realized, 6)} SOL`,
    `- Estimated open value: ${round(openValue, 6)} SOL`,
    `- Max drawdown estimate: ${round(maxDrawdown(positions), 6)} SOL`,
    `- Win rate: ${round(winRate(positions) * 100, 2)}%`,
    `- False positives: ${falsePositives}`,
    `- Missed winners: ${missedWinners}`,
    "",
    "## Candidates",
    "",
    ...topCandidates(scores).map(
      (score) =>
        `- ${score.mint}: decision=${score.decision}, ev=${score.expectedValueScore}, risk=${score.riskScore}, grad=${
          score.graduationProbability
        }, meme=${score.features.memeRelevanceScore}, topic=${score.features.memeMatchedTopic ?? "none"}, reasons=${
          score.reasons.join(",") || "none"
        }`
    ),
    "",
    "## Simulated Trades",
    "",
    ...(orders.length
      ? orders.map(
          (order) =>
            `- ${order.createdAt.toISOString()} ${order.side.toUpperCase()} ${order.status} ${order.mint} ${round(order.solAmount, 6)} SOL @ ${round(order.priceSol, 12)} reason=${order.reason}`
        )
      : ["- No simulated trades."]),
    "",
    "## Exit Events",
    "",
    ...(exits.length
      ? exits.map(
          (event) =>
            `- ${event.occurredAt.toISOString()} ${event.mint} ${event.reason} ${round(event.solAmount, 6)} SOL @ ${round(event.priceSol, 12)}`
        )
      : ["- No exits."]),
    "",
    "## Feature Contributions",
    "",
    ...(reasonCounts.size
      ? [...reasonCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([reason, count]) => `- ${reason}: ${count}`)
      : ["- No score reasons recorded."]),
    ""
  ].join("\n");
}

function topCandidates(scores: ScoreSnapshot[]): ScoreSnapshot[] {
  const latest = new Map<string, ScoreSnapshot>();
  for (const score of scores) latest.set(score.mint, score);
  return [...latest.values()].sort((a, b) => b.expectedValueScore - a.expectedValueScore).slice(0, 25);
}

function countReasons(scores: ScoreSnapshot[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const score of scores) {
    for (const reason of score.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return counts;
}

function estimateOpenValue(positions: PaperPosition[], scores: ScoreSnapshot[]): number {
  const latestPrice = new Map<string, number>();
  for (const score of scores) {
    if (score.features.priceSol) latestPrice.set(score.mint, score.features.priceSol);
  }
  return positions
    .filter((position) => position.status === "open")
    .reduce((total, position) => total + position.tokensOpen * (latestPrice.get(position.mint) ?? position.entryPriceSol), 0);
}

function maxDrawdown(positions: PaperPosition[]): number {
  return positions.reduce((worst, position) => Math.min(worst, position.solRealized - position.solInvested), 0);
}

function winRate(positions: PaperPosition[]): number {
  const closed = positions.filter((position) => position.status === "closed");
  if (closed.length === 0) return 0;
  return closed.filter((position) => position.solRealized > position.solInvested).length / closed.length;
}

function estimateMissedWinners(scores: ScoreSnapshot[], boughtMints: string[]): number {
  const bought = new Set(boughtMints);
  const byMint = new Map<string, ScoreSnapshot[]>();
  for (const score of scores) byMint.set(score.mint, [...(byMint.get(score.mint) ?? []), score]);
  let missed = 0;
  for (const [mint, mintScores] of byMint.entries()) {
    if (bought.has(mint)) continue;
    const first = mintScores.find((score) => score.features.priceSol);
    const high = Math.max(...mintScores.map((score) => score.features.priceSol ?? 0));
    if (first?.features.priceSol && high >= first.features.priceSol * 2) missed += 1;
  }
  return missed;
}
