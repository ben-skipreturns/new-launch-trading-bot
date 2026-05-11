import type { Scorer } from "./interfaces.js";
import type { FeatureSnapshot, ScoreSnapshot } from "./types.js";
import { clamp, round } from "../utils/math.js";

export interface HeuristicScorerOptions {
  minExpectedValue?: number;
  maxRisk?: number;
  requireFreshPrice?: boolean;
  minMemeRelevance?: number;
  minBuyCount?: number;
  minUniqueTraders?: number;
  minNetSolFlow?: number;
  maxSellPressure?: number;
  maxEntryAgeSeconds?: number;
  minBondingCurveProgress?: number;
}

export class HeuristicScorer implements Scorer {
  private readonly minExpectedValue: number;
  private readonly maxRisk: number;
  private readonly requireFreshPrice: boolean;
  private readonly minMemeRelevance: number;
  private readonly minBuyCount: number;
  private readonly minUniqueTraders: number;
  private readonly minNetSolFlow: number;
  private readonly maxSellPressure: number;
  private readonly maxEntryAgeSeconds: number;
  private readonly minBondingCurveProgress: number;

  constructor(options: HeuristicScorerOptions = {}) {
    this.minExpectedValue = options.minExpectedValue ?? 0.75;
    this.maxRisk = options.maxRisk ?? 0.35;
    this.requireFreshPrice = options.requireFreshPrice ?? true;
    this.minMemeRelevance = options.minMemeRelevance ?? 0.7;
    this.minBuyCount = options.minBuyCount ?? 3;
    this.minUniqueTraders = options.minUniqueTraders ?? 3;
    this.minNetSolFlow = options.minNetSolFlow ?? 5;
    this.maxSellPressure = options.maxSellPressure ?? 0.35;
    this.maxEntryAgeSeconds = options.maxEntryAgeSeconds ?? 10 * 60;
    this.minBondingCurveProgress = options.minBondingCurveProgress ?? 0.35;
  }

  score(features: FeatureSnapshot): ScoreSnapshot {
    const reasons: string[] = [];
    const speedSignal = clamp((features.vSolInBondingCurve - 35) / 40) * clamp(1 - features.ageSeconds / 600);
    const accumulationQuality = clamp(features.avgBuySol / 3) * clamp(1 - features.botLikeShare);
    const graduationProbability = round(
      clamp(0.12 + features.bondingCurveProgress * 0.58 + speedSignal * 0.2 + accumulationQuality * 0.1)
    );

    const riskScore = round(
      clamp(
        features.botLikeShare * 0.28 +
          features.washTradeShare * 0.28 +
          features.topHolderShare * 0.18 +
          features.devSupplyShare * 0.22 +
          features.insiderShare * 0.18 +
          features.bundlerShare * 0.12 +
          features.sniperShare * 0.1 +
          (features.enrichmentFresh ? 0 : 0.06)
      )
    );

    const trendScore = round(
      clamp(
        features.memeRelevanceScore * 0.65 +
          (features.trendKeywords.length > 0 ? 0.15 : 0) +
          (features.organicScore ?? 0) * 0.15 +
          features.uniqueTraders / 500
      )
    );
    const expectedValueScore = round(clamp(graduationProbability * (1 - riskScore) + trendScore * 0.12));
    const sellPressure = features.tradeCount > 0 ? features.sellCount / features.tradeCount : 0;
    const hasMemeRejectFlags = features.memeRejectFlags.length > 0;
    const confidenceReady =
      features.buyCount >= this.minBuyCount &&
      features.uniqueTraders >= this.minUniqueTraders &&
      features.netSolFlow >= this.minNetSolFlow &&
      sellPressure <= this.maxSellPressure &&
      features.ageSeconds <= this.maxEntryAgeSeconds &&
      features.bondingCurveProgress >= this.minBondingCurveProgress;

    if (features.vSolInBondingCurve >= 45 && features.avgBuySol >= 2 && features.ageSeconds <= 300) {
      reasons.push("FAST_SOL_ACCUMULATION");
    }
    if (features.botLikeShare >= 0.35) reasons.push("HIGH_BOT_SHARE");
    if (features.washTradeShare >= 0.2) reasons.push("HIGH_WASH_ACTIVITY");
    if (features.devSupplyShare >= 0.12 || features.topHolderShare >= 0.25) reasons.push("CONCENTRATED_SUPPLY");
    if (features.insiderShare >= 0.15) reasons.push("INSIDER_HEAVY_SUPPLY");
    if (features.enrichmentFresh && features.priceSol) reasons.push("LIQUIDITY_FRESH");
    if (features.memeRelevanceScore >= this.minMemeRelevance) reasons.push("MEME_RELEVANCE_MATCH");
    if (hasMemeRejectFlags) reasons.push("MEME_MATCH_REJECT_FLAGS");
    if (features.memeMatchedTopic) reasons.push(`MEME_TOPIC:${features.memeMatchedTopic}`);
    if (trendScore >= 0.45) reasons.push("TREND_MATCH");
    if (features.buyCount < this.minBuyCount) reasons.push("INSUFFICIENT_BUY_COUNT");
    if (features.uniqueTraders < this.minUniqueTraders) reasons.push("INSUFFICIENT_TRADER_DIVERSITY");
    if (features.netSolFlow < this.minNetSolFlow) reasons.push("WEAK_NET_SOL_FLOW");
    if (sellPressure > this.maxSellPressure) reasons.push("HIGH_SELL_PRESSURE");
    if (features.ageSeconds > this.maxEntryAgeSeconds) reasons.push("ENTRY_WINDOW_EXPIRED");
    if (features.bondingCurveProgress < this.minBondingCurveProgress) reasons.push("BONDING_CURVE_TOO_EARLY");
    if (confidenceReady) reasons.push("ENTRY_SIGNAL_CONFIDENCE_READY");
    if (riskScore > this.maxRisk) reasons.push("RISK_TOO_HIGH");
    if (expectedValueScore < this.minExpectedValue) reasons.push("SCORE_BELOW_THRESHOLD");
    if (features.memeRelevanceScore < this.minMemeRelevance) reasons.push("MEME_RELEVANCE_TOO_LOW");
    if (this.requireFreshPrice && (!features.priceSol || !features.enrichmentFresh)) reasons.push("STALE_OR_MISSING_PRICE");

    const decision =
      expectedValueScore >= this.minExpectedValue &&
      riskScore <= this.maxRisk &&
      features.memeRelevanceScore >= this.minMemeRelevance &&
      !hasMemeRejectFlags &&
      confidenceReady &&
      (!this.requireFreshPrice || Boolean(features.priceSol && features.enrichmentFresh))
        ? "paper_buy"
        : riskScore <= 0.6 && !hasMemeRejectFlags && features.ageSeconds <= this.maxEntryAgeSeconds && sellPressure <= this.maxSellPressure
          ? "watch"
          : "reject";

    return {
      mint: features.mint,
      asOf: features.asOf,
      graduationProbability,
      riskScore,
      trendScore,
      expectedValueScore,
      decision,
      reasons,
      features
    };
  }
}
