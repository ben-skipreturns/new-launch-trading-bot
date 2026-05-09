import { describe, expect, it } from "vitest";
import { MemoryStore } from "../storage/memoryStore.js";
import type { LaunchEvent, ScoreSnapshot, TokenLaunch, TradeEvent } from "../domain/types.js";

describe("retention pruning", () => {
  it("keeps interesting raw events longer than rejected events", async () => {
    const store = new MemoryStore();
    const old = new Date("2026-05-01T12:00:00.000Z");
    const now = new Date("2026-05-08T12:00:00.000Z");
    await store.upsertTokenLaunch(launch("InterestingMint", old));
    await store.upsertTokenLaunch(launch("RejectedMint", old));
    await store.upsertRawEvent(event("InterestingMint", old));
    await store.upsertRawEvent(event("RejectedMint", old));
    await store.upsertTradeEvent(trade("InterestingMint", old));
    await store.upsertTradeEvent(trade("RejectedMint", old));
    await store.insertScoreSnapshot(score("InterestingMint", "watch", now));

    const dryRun = await store.pruneRetention({
      now,
      rejectedRawRetentionHours: 48,
      interestingRawRetentionDays: 14,
      dryRun: true
    });
    expect(dryRun.rawEventsDeleted).toBe(1);
    expect(dryRun.tradeEventsDeleted).toBe(1);
    expect(store.rawEvents.size).toBe(2);

    const deleted = await store.pruneRetention({
      now,
      rejectedRawRetentionHours: 48,
      interestingRawRetentionDays: 14,
      dryRun: false
    });
    expect(deleted.rawEventsDeleted).toBe(1);
    expect(deleted.tradeEventsDeleted).toBe(1);
    expect(store.rawEvents.size).toBe(1);
    expect(store.trades.size).toBe(1);
  });
});

function launch(mint: string, createdAt: Date): TokenLaunch {
  return {
    mint,
    source: "test",
    signature: `create-${mint}`,
    pool: "pump",
    createdAt,
    raw: {}
  };
}

function event(mint: string, timestamp: Date): LaunchEvent {
  return {
    eventType: "buy",
    source: "test",
    signature: `raw-${mint}`,
    mint,
    timestamp,
    raw: {}
  };
}

function trade(mint: string, occurredAt: Date): TradeEvent {
  return {
    signature: `trade-${mint}`,
    source: "test",
    mint,
    eventType: "buy",
    occurredAt,
    solAmount: 1,
    isBotLike: false,
    isWashTrade: false,
    raw: {}
  };
}

function score(mint: string, decision: ScoreSnapshot["decision"], asOf: Date): ScoreSnapshot {
  return {
    mint,
    asOf,
    graduationProbability: 0.1,
    riskScore: 0.1,
    trendScore: 0.1,
    expectedValueScore: 0.1,
    decision,
    reasons: [],
    features: {
      mint,
      asOf,
      triggerType: "event",
      triggerValue: "test",
      ageSeconds: 0,
      vSolInBondingCurve: 0,
      bondingCurveProgress: 0,
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      uniqueTraders: 0,
      netSolFlow: 0,
      avgBuySol: 0,
      largestBuySol: 0,
      solAccumulationPerTrade: 0,
      botLikeShare: 0,
      washTradeShare: 0,
      creatorBuySol: 0,
      creatorSellSol: 0,
      devSupplyShare: 0,
      topHolderShare: 0,
      insiderShare: 0,
      bundlerShare: 0,
      sniperShare: 0,
      enrichmentFresh: false,
      trendKeywords: [],
      memeRelevanceScore: 0,
      memeEvidenceUrls: [],
      memeMatchReasons: [],
      memeRejectFlags: []
    }
  };
}
