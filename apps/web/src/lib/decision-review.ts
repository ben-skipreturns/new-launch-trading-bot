import type {
  AlmostBuyItem,
  DecisionFunnelStep,
  DecisionGateBreakdown,
  DecisionReasonCount,
  DecisionReview,
  GateBlockedLaunch,
  LaunchListItem,
  PaperStrategySummary,
  PositionLifecycleItem,
  PositionListItem
} from "./types";

export interface DecisionRawCounts {
  totalLaunches: number;
  memeMatchedLaunches: number;
  exitEvents: number;
}

export interface DecisionBuyOrderInput {
  mint: string;
  status: "filled" | "rejected";
  reason: string;
  createdAt: Date;
  scoreReasons: string[];
}

export interface BuildDecisionReviewInput {
  launches: LaunchListItem[];
  rawCounts: DecisionRawCounts;
  buyOrders: DecisionBuyOrderInput[];
  positions: PositionListItem[];
}

const scorerDefaults = {
  memeThreshold: 0.7,
  riskThreshold: 0.35,
  expectedValueThreshold: 0.75,
  minBuyCount: 3,
  minUniqueTraders: 3,
  minNetSolFlow: 5,
  maxSellPressure: 0.35,
  maxEntryAgeSeconds: 10 * 60,
  minBondingCurveProgress: 0.35
};

const paperBrokerDefaults = {
  buySizeSol: 0.05,
  maxConcurrentPositions: 10,
  dailySpendCapSol: 1,
  stopLossPct: 0.8,
  timeoutMs: 6 * 60 * 60 * 1000,
  takeProfitLadder: [
    { multiple: 5, portion: 0.2, label: "take profit 5x" },
    { multiple: 15, portion: 0.2, label: "take profit 15x" },
    { multiple: 50, portion: 0.15, label: "take profit 50x" }
  ],
  trailingStopActivationMultiple: 15,
  trailingStopDrawdownPct: 0.7,
  maxOpenPositionsPerMemeTopic: 2,
  maxOpenPositionsPerCreator: 1,
  maxDailyBuysPerSymbolFamily: 1
};

const strategySummary: PaperStrategySummary = {
  buySizeSol: paperBrokerDefaults.buySizeSol,
  dailySpendCapSol: paperBrokerDefaults.dailySpendCapSol,
  maxConcurrentPositions: paperBrokerDefaults.maxConcurrentPositions,
  memeThreshold: scorerDefaults.memeThreshold,
  riskThreshold: scorerDefaults.riskThreshold,
  expectedValueThreshold: scorerDefaults.expectedValueThreshold,
  minBuyCount: scorerDefaults.minBuyCount,
  minUniqueTraders: scorerDefaults.minUniqueTraders,
  minNetSolFlow: scorerDefaults.minNetSolFlow,
  maxSellPressure: scorerDefaults.maxSellPressure,
  minBondingCurveProgress: scorerDefaults.minBondingCurveProgress,
  maxEntryAgeSeconds: scorerDefaults.maxEntryAgeSeconds,
  stopLossPct: paperBrokerDefaults.stopLossPct,
  timeoutHours: paperBrokerDefaults.timeoutMs / (60 * 60 * 1000),
  trailingStopActivationMultiple: paperBrokerDefaults.trailingStopActivationMultiple,
  trailingStopDrawdownPct: paperBrokerDefaults.trailingStopDrawdownPct,
  exposureCaps: [
    `${paperBrokerDefaults.maxOpenPositionsPerMemeTopic} open positions per meme topic`,
    `${paperBrokerDefaults.maxOpenPositionsPerCreator} open position per creator`,
    `${paperBrokerDefaults.maxDailyBuysPerSymbolFamily} daily buy per symbol family`
  ],
  exitLadder: paperBrokerDefaults.takeProfitLadder.map((step) => ({
    multiple: step.multiple,
    portion: step.portion,
    label: step.label
  }))
};

const memeGateReasons = ["MEME_RELEVANCE_TOO_LOW", "MEME_MATCH_REJECT_FLAGS"] as const;
const riskGateReasons = ["RISK_TOO_HIGH", "HIGH_BOT_SHARE", "HIGH_WASH_ACTIVITY", "CONCENTRATED_SUPPLY", "INSIDER_HEAVY_SUPPLY"] as const;
const confidenceGateReasons = [
  "INSUFFICIENT_BUY_COUNT",
  "INSUFFICIENT_TRADER_DIVERSITY",
  "WEAK_NET_SOL_FLOW",
  "HIGH_SELL_PRESSURE",
  "ENTRY_WINDOW_EXPIRED",
  "BONDING_CURVE_TOO_EARLY"
] as const;
const priceGateReasons = ["STALE_OR_MISSING_PRICE"] as const;
const evGateReasons = ["SCORE_BELOW_THRESHOLD"] as const;
const exposureGateReasons = [
  "MAX_CONCURRENT_POSITIONS",
  "DAILY_SPEND_CAP",
  "MAX_TOPIC_EXPOSURE",
  "MAX_CREATOR_EXPOSURE",
  "MAX_SYMBOL_FAMILY_EXPOSURE"
] as const;
const exposureGateReasonSet = new Set<string>(exposureGateReasons);

export function emptyDecisionReview(): DecisionReview {
  return {
    generatedAt: new Date(),
    funnel: [],
    gates: [],
    almostBuys: [],
    strategy: strategySummary,
    positionLifecycle: []
  };
}

export function buildDecisionReview({ launches, rawCounts, buyOrders, positions }: BuildDecisionReviewInput): DecisionReview {
  const memePassed = launches.filter(passesMemeGate);
  const memeBlocked = launches.filter((launch) => !passesMemeGate(launch));

  const riskPassed = memePassed.filter(passesRiskGate);
  const riskBlocked = memePassed.filter((launch) => !passesRiskGate(launch));

  const confidencePassed = riskPassed.filter(passesConfidenceGate);
  const confidenceBlocked = riskPassed.filter((launch) => !passesConfidenceGate(launch));

  const pricePassed = confidencePassed.filter(passesPriceGate);
  const priceBlocked = confidencePassed.filter((launch) => !passesPriceGate(launch));

  const evPassed = pricePassed.filter(passesExpectedValueGate);
  const evBlocked = pricePassed.filter((launch) => !passesExpectedValueGate(launch));

  const paperBuySignals = evPassed.filter((launch) => launch.decision === "paper_buy");
  const paperBuySignalMints = new Set(paperBuySignals.map((launch) => launch.mint));
  const filledBuyOrders = buyOrders.filter((order) => order.status === "filled" && paperBuySignalMints.has(order.mint));
  const filledBuyMints = new Set(filledBuyOrders.map((order) => order.mint));
  const capRejectedOrders = buyOrders.filter(
    (order) => order.status === "rejected" && paperBuySignalMints.has(order.mint) && exposureGateReasonSet.has(order.reason)
  );
  const launchByMint = new Map(launches.map((launch) => [launch.mint, launch]));

  const openPositions = positions.filter((position) => position.status === "open").length;

  return {
    generatedAt: new Date(),
    funnel: [
      step("streamed", "Streamed launches", rawCounts.totalLaunches, undefined, "Persisted token create events."),
      step("matched", "Meme matched", rawCounts.memeMatchedLaunches, rawCounts.totalLaunches, "Launches with at least one meme-match row."),
      step("scored", "Scored", launches.length, rawCounts.memeMatchedLaunches, "Launches with a latest score snapshot loaded into this review."),
      step("meme_gate", "Passed meme gate", memePassed.length, launches.length, "Sourced meme relevance without matcher reject flags."),
      step("risk_gate", "Passed risk gate", riskPassed.length, memePassed.length, "No bot, wash, concentration, insider, or aggregate risk block."),
      step("confidence_gate", "Passed confidence", confidencePassed.length, riskPassed.length, "Enough early buys, trader breadth, net flow, and curve progress."),
      step("price_gate", "Fresh price", pricePassed.length, confidencePassed.length, "Current enough price data for paper execution."),
      step("ev_gate", "EV threshold", evPassed.length, pricePassed.length, "Expected-value score clears the strategy threshold."),
      step("paper_buy_signal", "Paper-buy signals", paperBuySignals.length, evPassed.length, "Latest score decision is paper_buy."),
      step("filled_buys", "Filled paper buys", filledBuyMints.size, paperBuySignals.length, "Paper broker accepted the entry after portfolio caps."),
      step("open_positions", "Open positions", openPositions, undefined, "Positions still carrying simulated token exposure."),
      step("exit_events", "Exit events", rawCounts.exitEvents, undefined, "Recorded simulated sells from ladders, stops, trailing stops, or timeouts.")
    ],
    gates: [
      gate("meme", "Meme gate", "Blocks launches without a sourced meme match or with matcher reject flags.", launches, memeBlocked, memeGateReasons),
      gate("risk", "Risk gate", "Blocks bot-like, washed, concentrated, insider-heavy, or high aggregate-risk launches.", memePassed, riskBlocked, riskGateReasons),
      gate(
        "confidence",
        "Trade confidence gate",
        "Blocks launches before there is enough early trade breadth, net flow, and curve progress.",
        riskPassed,
        confidenceBlocked,
        confidenceGateReasons,
        "ENTRY_SIGNAL_CONFIDENCE_NOT_READY"
      ),
      gate("price", "Price freshness gate", "Blocks entries and exits when the price snapshot is missing or stale.", confidencePassed, priceBlocked, priceGateReasons),
      gate("ev", "EV threshold", "Blocks otherwise eligible launches that do not clear the expected-value threshold.", pricePassed, evBlocked, evGateReasons),
      exposureGate(paperBuySignals.length, filledBuyMints.size, capRejectedOrders, launchByMint)
    ],
    almostBuys: buildAlmostBuys(launches),
    strategy: strategySummary,
    positionLifecycle: buildPositionLifecycle(positions, buyOrders)
  };
}

function step(key: string, label: string, count: number, previousCount: number | undefined, description: string): DecisionFunnelStep {
  return { key, label, count, previousCount, description };
}

function passesMemeGate(launch: LaunchListItem): boolean {
  return launch.memeRelevanceScore >= scorerDefaults.memeThreshold && !hasAnyReason(launch, memeGateReasons);
}

function passesRiskGate(launch: LaunchListItem): boolean {
  return launch.riskScore <= scorerDefaults.riskThreshold && !hasAnyReason(launch, riskGateReasons);
}

function passesConfidenceGate(launch: LaunchListItem): boolean {
  return launch.reasons.includes("ENTRY_SIGNAL_CONFIDENCE_READY") && !hasAnyReason(launch, confidenceGateReasons);
}

function passesPriceGate(launch: LaunchListItem): boolean {
  return !hasAnyReason(launch, priceGateReasons);
}

function passesExpectedValueGate(launch: LaunchListItem): boolean {
  return launch.expectedValueScore >= scorerDefaults.expectedValueThreshold && !hasAnyReason(launch, evGateReasons);
}

function gate(
  key: string,
  label: string,
  description: string,
  input: LaunchListItem[],
  blocked: LaunchListItem[],
  reasons: readonly string[],
  fallbackReason?: string
): DecisionGateBreakdown {
  return {
    key,
    label,
    description,
    inputCount: input.length,
    passed: input.length - blocked.length,
    blocked: blocked.length,
    reasonCounts: countReasons(blocked, reasons, fallbackReason),
    recentBlocked: blocked.slice(0, 8).map((launch) => blockedLaunch(launch, firstBlockingReason(launch, reasons, fallbackReason)))
  };
}

function exposureGate(
  signalCount: number,
  filledCount: number,
  rejectedOrders: DecisionBuyOrderInput[],
  launchByMint: Map<string, LaunchListItem>
): DecisionGateBreakdown {
  const reasonCounts = exposureGateReasons
    .map((reason) => ({ reason, count: rejectedOrders.filter((order) => order.reason === reason).length }))
    .filter((item) => item.count > 0);

  return {
    key: "exposure",
    label: "Exposure cap gate",
    description: "Broker-level caps for max positions, daily spend, meme topic, creator, and symbol family exposure.",
    inputCount: signalCount,
    passed: filledCount,
    blocked: rejectedOrders.length,
    reasonCounts,
    recentBlocked: rejectedOrders.slice(0, 8).map((order) => {
      const launch = launchByMint.get(order.mint);
      if (launch) return blockedLaunch(launch, order.reason);
      return {
        mint: order.mint,
        decision: "paper_buy",
        memeRelevanceScore: 0,
        riskScore: 0,
        expectedValueScore: 0,
        latestScoreAt: order.createdAt,
        reasons: order.scoreReasons,
        blockedBy: order.reason
      };
    })
  };
}

function buildAlmostBuys(launches: LaunchListItem[]): AlmostBuyItem[] {
  return launches
    .filter((launch) => launch.decision !== "paper_buy" && launch.memeRelevanceScore >= scorerDefaults.memeThreshold)
    .map((launch) => ({
      ...blockedLaunch(launch),
      blockedGates: blockedGateLabels(launch)
    }))
    .filter((launch) => launch.blockedGates.length > 0 && launch.blockedGates.length <= 2)
    .sort((a, b) => b.expectedValueScore - a.expectedValueScore || b.memeRelevanceScore - a.memeRelevanceScore || a.riskScore - b.riskScore)
    .slice(0, 25);
}

function blockedGateLabels(launch: LaunchListItem): string[] {
  const labels: string[] = [];
  if (!passesMemeGate(launch)) labels.push("Meme gate");
  if (passesMemeGate(launch) && !passesRiskGate(launch)) labels.push("Risk gate");
  if (passesMemeGate(launch) && passesRiskGate(launch) && !passesConfidenceGate(launch)) labels.push("Trade confidence");
  if (passesMemeGate(launch) && passesRiskGate(launch) && passesConfidenceGate(launch) && !passesPriceGate(launch)) labels.push("Price freshness");
  if (
    passesMemeGate(launch) &&
    passesRiskGate(launch) &&
    passesConfidenceGate(launch) &&
    passesPriceGate(launch) &&
    !passesExpectedValueGate(launch)
  ) {
    labels.push("EV threshold");
  }
  return labels;
}

function buildPositionLifecycle(positions: PositionListItem[], buyOrders: DecisionBuyOrderInput[]): PositionLifecycleItem[] {
  const entryOrderByMint = new Map<string, DecisionBuyOrderInput>();
  for (const order of buyOrders.filter((item) => item.status === "filled")) {
    if (!entryOrderByMint.has(order.mint)) entryOrderByMint.set(order.mint, order);
  }

  return positions.slice(0, 50).map((position) => {
    const ladderHits = Object.entries(position.ladderState ?? {})
      .filter(([, hit]) => hit)
      .map(([multiple]) => `${multiple}x`)
      .sort((a, b) => Number(a.replace("x", "")) - Number(b.replace("x", "")));
    const currentMultiple = position.latestPriceSol && position.entryPriceSol > 0 ? position.latestPriceSol / position.entryPriceSol : undefined;
    const nextLadderStep = paperBrokerDefaults.takeProfitLadder.find((target) => !(position.ladderState ?? {})[String(target.multiple)]);
    const timeoutAt = new Date(position.openedAt.getTime() + paperBrokerDefaults.timeoutMs);
    const now = new Date();

    return {
      mint: position.mint,
      name: position.name,
      symbol: position.symbol,
      status: position.status,
      openedAt: position.openedAt,
      entryPriceSol: position.entryPriceSol,
      latestPriceSol: position.latestPriceSol,
      currentMultiple,
      moonbagPct: position.moonbagPct,
      estimatedPnlSol: position.estimatedPnlSol,
      ladderHits,
      nextExitTrigger: nextExitTrigger(nextLadderStep?.multiple, currentMultiple),
      stopState: stopState(position.stopPriceSol, position.highPriceSol, currentMultiple),
      timeoutState: position.status === "closed" ? "closed" : now >= timeoutAt ? "timeout eligible if trend weak" : `timeout after ${formatHours(timeoutAt, now)}`,
      entryReasons: entryOrderByMint.get(position.mint)?.scoreReasons.slice(0, 5) ?? []
    };
  });
}

function nextExitTrigger(nextMultiple: number | undefined, currentMultiple: number | undefined): string {
  if (nextMultiple) return `${nextMultiple}x ladder sell`;
  if ((currentMultiple ?? 0) >= paperBrokerDefaults.trailingStopActivationMultiple) return "trailing stop protects moonbag";
  return `${paperBrokerDefaults.trailingStopActivationMultiple}x trailing activation`;
}

function stopState(stopPriceSol: number | undefined, highPriceSol: number | undefined, currentMultiple: number | undefined): string {
  if ((currentMultiple ?? 0) >= paperBrokerDefaults.trailingStopActivationMultiple && highPriceSol) {
    const trailPrice = highPriceSol * (1 - paperBrokerDefaults.trailingStopDrawdownPct);
    return `trail below ${trailPrice.toExponential(3)} SOL`;
  }
  if (stopPriceSol) return `hard stop at ${stopPriceSol.toExponential(3)} SOL`;
  return "stop unavailable";
}

function formatHours(target: Date, now: Date): string {
  const hours = Math.max(0, (target.getTime() - now.getTime()) / (60 * 60 * 1000));
  if (hours < 1) return `${Math.ceil(hours * 60)}m`;
  return `${Math.ceil(hours)}h`;
}

function countReasons(launches: LaunchListItem[], reasons: readonly string[], fallbackReason?: string): DecisionReasonCount[] {
  const counts = new Map<string, number>();
  for (const launch of launches) {
    const matches = reasons.filter((reason) => launch.reasons.includes(reason));
    const counted = matches.length > 0 ? matches : fallbackReason ? [fallbackReason] : [];
    for (const reason of counted) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function firstBlockingReason(launch: LaunchListItem, reasons: readonly string[], fallbackReason?: string): string | undefined {
  return reasons.find((reason) => launch.reasons.includes(reason)) ?? fallbackReason;
}

function blockedLaunch(launch: LaunchListItem, blockedBy?: string): GateBlockedLaunch {
  return {
    mint: launch.mint,
    name: launch.name,
    symbol: launch.symbol,
    decision: launch.decision,
    latestScoreAt: launch.latestScoreAt,
    memeRelevanceScore: launch.memeRelevanceScore,
    riskScore: launch.riskScore,
    expectedValueScore: launch.expectedValueScore,
    reasons: launch.reasons,
    blockedBy
  };
}

function hasAnyReason(launch: LaunchListItem, reasons: readonly string[]): boolean {
  return reasons.some((reason) => launch.reasons.includes(reason));
}
