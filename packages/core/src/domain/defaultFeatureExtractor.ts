import type { FeatureExtractionInput, FeatureExtractor } from "./interfaces.js";
import type { FeatureSnapshot, TradeEvent } from "./types.js";
import type { Store } from "../storage/store.js";
import { clamp, round, safeDiv } from "../utils/math.js";
import { secondsBetween } from "../utils/time.js";

export interface DefaultFeatureExtractorOptions {
  graduationVSol?: number;
  enrichmentFreshMs?: number;
}

export class DefaultFeatureExtractor implements FeatureExtractor {
  private readonly graduationVSol: number;
  private readonly enrichmentFreshMs: number;

  constructor(
    private readonly store: Store,
    options: DefaultFeatureExtractorOptions = {}
  ) {
    this.graduationVSol = options.graduationVSol ?? 85;
    this.enrichmentFreshMs = options.enrichmentFreshMs ?? 120_000;
  }

  async extract(input: FeatureExtractionInput): Promise<FeatureSnapshot> {
    const trades = await this.store.listTradeEvents(input.launch.mint, input.asOf);
    const enrichment = input.enrichment ?? (await this.store.getLatestEnrichment(input.launch.mint, input.asOf));
    const buys = trades.filter((trade) => trade.eventType === "buy");
    const sells = trades.filter((trade) => trade.eventType === "sell");
    const buySol = sum(buys, (trade) => trade.solAmount ?? 0);
    const sellSol = sum(sells, (trade) => trade.solAmount ?? 0);
    const latestTrade = latestByDate(trades);
    const vSol =
      latestTrade?.vSolInBondingCurve ??
      input.launch.vSolInBondingCurve ??
      Math.max(0, (input.launch.initialBuySol ?? 0) + buySol - sellSol);
    const tradeCount = trades.length;
    const creator = input.launch.creator;

    const enrichmentIsFresh = Boolean(enrichment && input.asOf.getTime() - enrichment.observedAt.getTime() <= this.enrichmentFreshMs);
    const latestTradePriceIsFresh = Boolean(
      latestTrade?.priceSol !== undefined && input.asOf.getTime() - latestTrade.occurredAt.getTime() <= this.enrichmentFreshMs
    );
    const freshPriceSol = (latestTradePriceIsFresh ? latestTrade?.priceSol : undefined) ?? (enrichmentIsFresh ? enrichment?.priceSol : undefined);
    const memeMatch = await this.store.getLatestTokenMemeMatch(input.launch.mint, input.asOf);

    const snapshot: FeatureSnapshot = {
      mint: input.launch.mint,
      asOf: input.asOf,
      triggerType: input.triggerType,
      triggerValue: input.triggerValue,
      ageSeconds: secondsBetween(input.launch.createdAt, input.asOf),
      vSolInBondingCurve: round(vSol),
      bondingCurveProgress: round(clamp(vSol / this.graduationVSol)),
      tradeCount,
      buyCount: buys.length,
      sellCount: sells.length,
      uniqueTraders: new Set(trades.map((trade) => trade.trader).filter(Boolean)).size,
      netSolFlow: round((input.launch.initialBuySol ?? 0) + buySol - sellSol),
      avgBuySol: round(safeDiv(buySol, buys.length)),
      largestBuySol: round(Math.max(0, ...buys.map((trade) => trade.solAmount ?? 0), input.launch.initialBuySol ?? 0)),
      solAccumulationPerTrade: round(safeDiv(Math.max(0, vSol - (input.launch.vSolInBondingCurve ?? 0)), tradeCount)),
      botLikeShare: round(safeDiv(trades.filter((trade) => trade.isBotLike).length, tradeCount)),
      washTradeShare: round(safeDiv(trades.filter((trade) => trade.isWashTrade).length, tradeCount)),
      creatorBuySol: round(sum(trades, (trade) => (trade.trader === creator && trade.eventType === "buy" ? trade.solAmount ?? 0 : 0))),
      creatorSellSol: round(sum(trades, (trade) => (trade.trader === creator && trade.eventType === "sell" ? trade.solAmount ?? 0 : 0))),
      devSupplyShare: round(enrichment?.devHoldingShare ?? 0),
      topHolderShare: round(enrichment?.topHolderShare ?? 0),
      insiderShare: round(enrichment?.insiderShare ?? 0),
      bundlerShare: round(enrichment?.bundlerShare ?? 0),
      sniperShare: round(enrichment?.sniperShare ?? 0),
      priceSol: freshPriceSol,
      marketCapSol: (latestTradePriceIsFresh ? latestTrade?.marketCapSol : undefined) ?? input.launch.marketCapSol,
      liquidityUsd: enrichment?.liquidityUsd,
      holderCount: enrichment?.holderCount,
      organicScore: enrichment?.organicScore,
      enrichmentFresh: enrichmentIsFresh || latestTradePriceIsFresh,
      trendKeywords: enrichment?.sentimentKeywords ?? [],
      memeRelevanceScore: memeMatch?.memeRelevanceScore ?? 0,
      memeMatchedTopicId: memeMatch?.topicId,
      memeMatchedTopic: memeMatch?.canonicalPhrase,
      memeMatchedTopicType: memeMatch?.topicType,
      memeEvidenceUrls: memeMatch?.evidenceUrls ?? [],
      memeMatchReasons: memeMatch?.reasons ?? [],
      memeRejectFlags: memeMatch?.rejectFlags ?? ["NO_MEME_MATCH"]
    };

    return snapshot;
  }
}

function sum<T>(items: T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0);
}

function latestByDate(events: TradeEvent[]): TradeEvent | undefined {
  return [...events].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
}
