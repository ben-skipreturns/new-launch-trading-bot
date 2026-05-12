import type { PaperBroker } from "./interfaces.js";
import type { ExitEvent, PaperOrder, PaperPosition, ScoreSnapshot, TokenLaunch } from "./types.js";
import type { Store } from "../storage/store.js";
import { round } from "../utils/math.js";
import { isoDate } from "../utils/time.js";

export interface PaperBrokerConfig {
  buySizeSol: number;
  maxConcurrentPositions: number;
  dailySpendCapSol: number;
  feeBps: number;
  slippageBps: number;
  stopLossPct: number;
  timeoutMs: number;
  takeProfitLadder: Array<{
    multiple: number;
    portion: number;
    reason: ExitEvent["reason"];
  }>;
  trailingStopActivationMultiple: number;
  trailingStopDrawdownPct: number;
  timeoutTrendScoreThreshold: number;
  maxOpenPositionsPerMemeTopic: number;
  maxOpenPositionsPerCreator: number;
  maxDailyBuysPerSymbolFamily: number;
}

export const defaultPaperBrokerConfig: PaperBrokerConfig = {
  buySizeSol: 0.05,
  maxConcurrentPositions: 10,
  dailySpendCapSol: 1,
  feeBps: 125,
  slippageBps: 150,
  stopLossPct: 0.8,
  timeoutMs: 6 * 60 * 60 * 1000,
  takeProfitLadder: [
    { multiple: 5, portion: 0.2, reason: "take_profit_5x" },
    { multiple: 15, portion: 0.2, reason: "take_profit_15x" },
    { multiple: 50, portion: 0.15, reason: "take_profit_50x" }
  ],
  trailingStopActivationMultiple: 15,
  trailingStopDrawdownPct: 0.7,
  timeoutTrendScoreThreshold: 0.45,
  maxOpenPositionsPerMemeTopic: 2,
  maxOpenPositionsPerCreator: 1,
  maxDailyBuysPerSymbolFamily: 1
};

export class DefaultPaperBroker implements PaperBroker {
  private mutationLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: Store,
    private readonly config: PaperBrokerConfig = defaultPaperBrokerConfig
  ) {}

  async onScore(score: ScoreSnapshot): Promise<PaperOrder | null> {
    if (score.decision !== "paper_buy") return null;
    return this.withMutationLock(() => this.onScoreLocked(score));
  }

  async onPrice(score: ScoreSnapshot): Promise<PaperOrder[]> {
    const priceSol = score.features.priceSol;
    if (!priceSol || !score.features.enrichmentFresh) return [];
    return this.withMutationLock(() => this.onPriceLocked(score, priceSol));
  }

  private async onScoreLocked(score: ScoreSnapshot): Promise<PaperOrder | null> {
    const existing = await this.store.getOpenPosition(score.mint);
    if (existing) return null;

    const openPositions = await this.store.listOpenPositions();
    if (openPositions.length >= this.config.maxConcurrentPositions) {
      return this.reject(score, "MAX_CONCURRENT_POSITIONS");
    }

    const launch = await this.store.getTokenLaunch(score.mint);
    const exposureRejectReason = await this.exposureRejectReason(score, launch, openPositions);
    if (exposureRejectReason) return this.reject(score, exposureRejectReason);

    const spentToday = await this.spentOnDay(score.asOf);
    if (spentToday + this.config.buySizeSol > this.config.dailySpendCapSol) {
      return this.reject(score, "DAILY_SPEND_CAP");
    }

    const priceSol = score.features.priceSol;
    if (!priceSol || !score.features.enrichmentFresh) {
      return this.reject(score, "STALE_OR_MISSING_PRICE");
    }

    const feesSol = this.bps(this.config.buySizeSol, this.config.feeBps);
    const slippageSol = this.bps(this.config.buySizeSol, this.config.slippageBps);
    const effectiveSol = this.config.buySizeSol - feesSol - slippageSol;
    const tokenAmount = effectiveSol / priceSol;
    const order = this.order(score, "buy", "filled", "ENTRY_SIGNAL", this.config.buySizeSol, tokenAmount, priceSol, feesSol, slippageSol);
    const position: PaperPosition = {
      mint: score.mint,
      status: "open",
      openedAt: score.asOf,
      entryPriceSol: priceSol,
      tokensOpen: tokenAmount,
      tokensBought: tokenAmount,
      solInvested: this.config.buySizeSol,
      solRealized: 0,
      stopPriceSol: round(priceSol * (1 - this.config.stopLossPct), 12),
      highPriceSol: priceSol,
      ladderState: Object.fromEntries(this.config.takeProfitLadder.map((target) => [String(target.multiple), false]))
    };

    await this.store.insertPaperOrder(order);
    await this.store.upsertPaperPosition(position);
    return order;
  }

  private async onPriceLocked(score: ScoreSnapshot, priceSol: number): Promise<PaperOrder[]> {
    const position = await this.store.getOpenPosition(score.mint);
    if (!position) return [];

    position.highPriceSol = Math.max(position.highPriceSol, priceSol);
    const orders: PaperOrder[] = [];

    for (const target of this.config.takeProfitLadder) {
      if (!position.ladderState[String(target.multiple)] && priceSol >= position.entryPriceSol * target.multiple) {
        orders.push(await this.exit(score, position, target.portion * position.tokensBought, priceSol, target.reason));
        position.ladderState[String(target.multiple)] = true;
      }
    }

    const timedOut =
      score.asOf.getTime() - position.openedAt.getTime() >= this.config.timeoutMs &&
      score.trendScore < this.config.timeoutTrendScoreThreshold;
    const trailingStop =
      position.highPriceSol >= position.entryPriceSol * this.config.trailingStopActivationMultiple &&
      priceSol <= position.highPriceSol * (1 - this.config.trailingStopDrawdownPct);
    if (position.tokensOpen > 0 && priceSol <= position.stopPriceSol) {
      orders.push(await this.exit(score, position, position.tokensOpen, priceSol, "stop_loss"));
    } else if (position.tokensOpen > 0 && trailingStop) {
      orders.push(await this.exit(score, position, position.tokensOpen, priceSol, "trailing_stop"));
    } else if (position.tokensOpen > 0 && timedOut) {
      orders.push(await this.exit(score, position, position.tokensOpen, priceSol, "timeout"));
    }

    if (position.tokensOpen <= 1e-12) {
      position.status = "closed";
      position.closedAt = score.asOf;
      position.avgExitPriceSol = round(position.solRealized / position.tokensBought);
    }

    await this.store.upsertPaperPosition(position);
    return orders;
  }

  private async withMutationLock<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.mutationLock;
    let release!: () => void;
    this.mutationLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  }

  private async exit(
    score: ScoreSnapshot,
    position: PaperPosition,
    tokenAmount: number,
    priceSol: number,
    reason: ExitEvent["reason"]
  ): Promise<PaperOrder> {
    const amount = Math.min(position.tokensOpen, tokenAmount);
    const grossSol = amount * priceSol;
    const feesSol = this.bps(grossSol, this.config.feeBps);
    const slippageSol = this.bps(grossSol, this.config.slippageBps);
    const netSol = grossSol - feesSol - slippageSol;
    position.tokensOpen = round(position.tokensOpen - amount, 12);
    position.solRealized = round(position.solRealized + netSol);

    const order = this.order(score, "sell", "filled", reason, netSol, amount, priceSol, feesSol, slippageSol);
    const exitEvent: ExitEvent = {
      id: `exit:${score.mint}:${reason}:${score.asOf.toISOString()}`,
      mint: score.mint,
      occurredAt: score.asOf,
      reason,
      tokenAmount: amount,
      solAmount: netSol,
      priceSol,
      feesSol
    };
    await this.store.insertPaperOrder(order);
    await this.store.insertExitEvent(exitEvent);
    return order;
  }

  private async reject(score: ScoreSnapshot, reason: string): Promise<PaperOrder> {
    const order = this.order(score, "buy", "rejected", reason, 0, 0, score.features.priceSol ?? 0, 0, 0);
    await this.store.insertPaperOrder(order);
    return order;
  }

  private order(
    score: ScoreSnapshot,
    side: "buy" | "sell",
    status: "filled" | "rejected",
    reason: string,
    solAmount: number,
    tokenAmount: number,
    priceSol: number,
    feesSol: number,
    slippageSol: number
  ): PaperOrder {
    return {
      id: `${side}:${status}:${score.mint}:${reason}:${score.asOf.toISOString()}`,
      mint: score.mint,
      side,
      status,
      reason,
      createdAt: score.asOf,
      solAmount: round(solAmount, 12),
      tokenAmount: round(tokenAmount, 12),
      priceSol: round(priceSol, 12),
      feesSol: round(feesSol, 12),
      slippageSol: round(slippageSol, 12),
      scoreSnapshot: score
    };
  }

  private bps(amount: number, bps: number): number {
    return amount * (bps / 10_000);
  }

  private async exposureRejectReason(score: ScoreSnapshot, launch: TokenLaunch | undefined, openPositions: PaperPosition[]): Promise<string | null> {
    const openMints = new Set(openPositions.map((position) => position.mint));
    const filledBuyOrders = (await this.store.listPaperOrders(undefined, score.asOf)).filter(
      (order) => order.side === "buy" && order.status === "filled"
    );

    const topicKey = topicExposureKey(score);
    if (topicKey) {
      const openTopicCount = filledBuyOrders.filter((order) => openMints.has(order.mint) && topicExposureKey(order.scoreSnapshot) === topicKey).length;
      if (openTopicCount >= this.config.maxOpenPositionsPerMemeTopic) return "MAX_TOPIC_EXPOSURE";
    }

    if (launch?.creator) {
      let openCreatorCount = 0;
      for (const position of openPositions) {
        const existingLaunch = await this.store.getTokenLaunch(position.mint);
        if (existingLaunch?.creator && existingLaunch.creator === launch.creator) openCreatorCount += 1;
      }
      if (openCreatorCount >= this.config.maxOpenPositionsPerCreator) return "MAX_CREATOR_EXPOSURE";
    }

    const symbolFamily = symbolFamilyKey(launch);
    if (symbolFamily) {
      const day = isoDate(score.asOf);
      let dailyFamilyBuys = 0;
      for (const order of filledBuyOrders) {
        if (isoDate(order.createdAt) !== day) continue;
        const boughtLaunch = await this.store.getTokenLaunch(order.mint);
        if (symbolFamilyKey(boughtLaunch) === symbolFamily) dailyFamilyBuys += 1;
      }
      if (dailyFamilyBuys >= this.config.maxDailyBuysPerSymbolFamily) return "MAX_SYMBOL_FAMILY_EXPOSURE";
    }

    return null;
  }

  private async spentOnDay(date: Date): Promise<number> {
    const day = isoDate(date);
    const orders = await this.store.listPaperOrders();
    return orders
      .filter((order) => order.side === "buy" && order.status === "filled" && isoDate(order.createdAt) === day)
      .reduce((total, order) => total + order.solAmount, 0);
  }
}

function topicExposureKey(score: ScoreSnapshot): string | undefined {
  return score.features.memeMatchedTopicId ?? score.features.memeMatchedTopic?.toLowerCase();
}

function symbolFamilyKey(launch: TokenLaunch | undefined): string | undefined {
  const value = launch?.symbol ?? launch?.name;
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized || undefined;
}
