import { describe, expect, it } from "vitest";
import { HeuristicScorer } from "../domain/heuristicScorer.js";
import type { FeatureSnapshot } from "../domain/types.js";

describe("HeuristicScorer", () => {
  it("buys strong low-risk launches with fresh pricing", () => {
    const score = new HeuristicScorer().score(feature({ vSolInBondingCurve: 78, bondingCurveProgress: 0.92, avgBuySol: 8 }));
    expect(score.decision).toBe("paper_buy");
    expect(score.reasons).toContain("FAST_SOL_ACCUMULATION");
  });

  it("rejects high-risk launches even when accumulation is fast", () => {
    const score = new HeuristicScorer().score(
      feature({
        vSolInBondingCurve: 78,
        bondingCurveProgress: 0.92,
        avgBuySol: 8,
        botLikeShare: 0.7,
        topHolderShare: 0.4,
        insiderShare: 0.4,
        devSupplyShare: 0.25
      })
    );
    expect(score.decision).not.toBe("paper_buy");
    expect(score.reasons).toContain("RISK_TOO_HIGH");
  });

  it("blocks paper buys without a sourced meme relevance match", () => {
    const score = new HeuristicScorer().score(feature({ memeRelevanceScore: 0, memeMatchedTopic: undefined }));
    expect(score.decision).not.toBe("paper_buy");
    expect(score.reasons).toContain("MEME_RELEVANCE_TOO_LOW");
  });
});

function feature(overrides: Partial<FeatureSnapshot>): FeatureSnapshot {
  return {
    mint: "Mint111",
    asOf: new Date("2026-05-08T12:00:45.000Z"),
    triggerType: "event",
    triggerValue: "sig",
    ageSeconds: 45,
    vSolInBondingCurve: 65,
    bondingCurveProgress: 0.76,
    tradeCount: 4,
    buyCount: 4,
    sellCount: 0,
    uniqueTraders: 4,
    netSolFlow: 20,
    avgBuySol: 5,
    largestBuySol: 10,
    solAccumulationPerTrade: 8,
    botLikeShare: 0,
    washTradeShare: 0,
    creatorBuySol: 0,
    creatorSellSol: 0,
    devSupplyShare: 0,
    topHolderShare: 0.05,
    insiderShare: 0,
    bundlerShare: 0,
    sniperShare: 0,
    priceSol: 0.000001,
    marketCapSol: 65,
    liquidityUsd: 20_000,
    holderCount: 100,
    organicScore: 0.7,
    enrichmentFresh: true,
    trendKeywords: ["ai"],
    memeRelevanceScore: 0.88,
    memeMatchedTopicId: "trend:moon-ai-sol",
    memeMatchedTopic: "moon ai sol",
    memeMatchedTopicType: "ai",
    memeEvidenceUrls: ["https://example.com/moon-ai-sol"],
    memeMatchReasons: ["EXACT_PHRASE_MATCH"],
    memeRejectFlags: [],
    ...overrides
  };
}
