import { describe, expect, it } from "vitest";
import { DefaultPaperBroker } from "../domain/defaultPaperBroker.js";
import { MemoryStore } from "../storage/memoryStore.js";
import type { FeatureSnapshot, ScoreSnapshot, TokenLaunch } from "../domain/types.js";

describe("DefaultPaperBroker", () => {
  it("fills one entry per mint and suppresses duplicate buy signals", async () => {
    const store = new MemoryStore();
    const broker = new DefaultPaperBroker(store);
    const first = await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:00:00.000Z"));
    const second = await broker.onScore(score("paper_buy", 0.0000011, "2026-05-08T12:00:10.000Z"));

    expect(first?.status).toBe("filled");
    expect(second).toBeNull();
    expect((await store.listOpenPositions()).length).toBe(1);
  });

  it("takes later moonshot profits and leaves a moonbag open", async () => {
    const store = new MemoryStore();
    const broker = new DefaultPaperBroker(store);
    await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:00:00.000Z"));

    const at5x = await broker.onPrice(score("watch", 0.0000052, "2026-05-08T12:05:00.000Z"));
    const at15x = await broker.onPrice(score("watch", 0.000016, "2026-05-08T12:20:00.000Z"));
    const at50x = await broker.onPrice(score("watch", 0.000051, "2026-05-08T12:40:00.000Z"));
    const position = (await store.listOpenPositions())[0];

    expect(at5x.map((order) => order.reason)).toContain("take_profit_5x");
    expect(at15x.map((order) => order.reason)).toContain("take_profit_15x");
    expect(at50x.map((order) => order.reason)).toContain("take_profit_50x");
    expect(position?.tokensOpen).toBeGreaterThan(0);
    expect(position?.tokensOpen).toBeLessThan(position?.tokensBought ?? 0);
  });

  it("closes the retained moonbag only after a large-run trailing stop", async () => {
    const store = new MemoryStore();
    const broker = new DefaultPaperBroker(store);
    await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:00:00.000Z"));

    await broker.onPrice(score("watch", 0.000051, "2026-05-08T12:40:00.000Z"));
    const trailing = await broker.onPrice(score("watch", 0.000015, "2026-05-08T12:45:00.000Z"));

    expect(trailing.map((order) => order.reason)).toContain("trailing_stop");
    expect((await store.listOpenPositions()).length).toBe(0);
  });

  it("stops out weak positions", async () => {
    const store = new MemoryStore();
    const broker = new DefaultPaperBroker(store);
    await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:00:00.000Z"));

    const orders = await broker.onPrice(score("watch", 0.00000019, "2026-05-08T12:10:00.000Z"));
    expect(orders.map((order) => order.reason)).toContain("stop_loss");
  });

  it("does not exit positions on stale price snapshots", async () => {
    const store = new MemoryStore();
    const broker = new DefaultPaperBroker(store);
    await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:00:00.000Z"));

    const staleStop = await broker.onPrice(score("watch", 0.00000019, "2026-05-08T12:10:00.000Z", { enrichmentFresh: false }));

    expect(staleStop).toHaveLength(0);
    expect((await store.listOpenPositions()).length).toBe(1);
  });

  it("caps open positions by meme topic exposure", async () => {
    const store = new MemoryStore();
    const broker = new DefaultPaperBroker(store, { ...defaultTestConfig(), maxOpenPositionsPerMemeTopic: 1 });
    const first = await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:00:00.000Z", { mint: "MintTopicA" }));
    const second = await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:01:00.000Z", { mint: "MintTopicB" }));

    expect(first?.status).toBe("filled");
    expect(second?.status).toBe("rejected");
    expect(second?.reason).toBe("MAX_TOPIC_EXPOSURE");
  });

  it("caps open positions by creator exposure", async () => {
    const store = new MemoryStore();
    await store.upsertTokenLaunch(launch({ mint: "MintCreatorA", creator: "CreatorSame", symbol: "A" }));
    await store.upsertTokenLaunch(launch({ mint: "MintCreatorB", creator: "CreatorSame", symbol: "B" }));
    const broker = new DefaultPaperBroker(store, { ...defaultTestConfig(), maxOpenPositionsPerMemeTopic: 10, maxOpenPositionsPerCreator: 1 });

    const first = await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:00:00.000Z", { mint: "MintCreatorA", memeMatchedTopicId: "topic:a" }));
    const second = await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:01:00.000Z", { mint: "MintCreatorB", memeMatchedTopicId: "topic:b" }));

    expect(first?.status).toBe("filled");
    expect(second?.status).toBe("rejected");
    expect(second?.reason).toBe("MAX_CREATOR_EXPOSURE");
  });

  it("caps same-day buys by symbol family", async () => {
    const store = new MemoryStore();
    await store.upsertTokenLaunch(launch({ mint: "MintSymbolA", creator: "CreatorA", symbol: "MOON" }));
    await store.upsertTokenLaunch(launch({ mint: "MintSymbolB", creator: "CreatorB", symbol: "MOON" }));
    const broker = new DefaultPaperBroker(store, { ...defaultTestConfig(), maxOpenPositionsPerMemeTopic: 10, maxOpenPositionsPerCreator: 10, maxDailyBuysPerSymbolFamily: 1 });

    const first = await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:00:00.000Z", { mint: "MintSymbolA", memeMatchedTopicId: "topic:a" }));
    const second = await broker.onScore(score("paper_buy", 0.000001, "2026-05-08T12:01:00.000Z", { mint: "MintSymbolB", memeMatchedTopicId: "topic:b" }));

    expect(first?.status).toBe("filled");
    expect(second?.status).toBe("rejected");
    expect(second?.reason).toBe("MAX_SYMBOL_FAMILY_EXPOSURE");
  });
});

function score(decision: ScoreSnapshot["decision"], priceSol: number, asOf: string, overrides: Partial<FeatureSnapshot> = {}): ScoreSnapshot {
  const features: FeatureSnapshot = {
    mint: overrides.mint ?? "Mint111",
    asOf: new Date(asOf),
    triggerType: "event",
    triggerValue: asOf,
    ageSeconds: 10,
    vSolInBondingCurve: 70,
    bondingCurveProgress: 0.82,
    tradeCount: 4,
    buyCount: 4,
    sellCount: 0,
    uniqueTraders: 4,
    netSolFlow: 30,
    avgBuySol: 8,
    largestBuySol: 15,
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
    priceSol,
    marketCapSol: 70,
    liquidityUsd: 20_000,
    holderCount: 100,
    organicScore: 0.7,
    enrichmentFresh: true,
    trendKeywords: ["ai"],
    memeRelevanceScore: 0.9,
    memeMatchedTopicId: "trend:mint",
    memeMatchedTopic: "mint",
    memeMatchedTopicType: "internet_phrase",
    memeEvidenceUrls: ["https://example.com"],
    memeMatchReasons: ["EXACT_PHRASE_MATCH"],
    memeRejectFlags: [],
    ...overrides
  };
  return {
    mint: features.mint,
    asOf: new Date(asOf),
    graduationProbability: 0.8,
    riskScore: 0.1,
    trendScore: 0.6,
    expectedValueScore: 0.82,
    decision,
    reasons: [],
    features
  };
}

function defaultTestConfig() {
  return {
    buySizeSol: 0.05,
    maxConcurrentPositions: 10,
    dailySpendCapSol: 1,
    feeBps: 125,
    slippageBps: 150,
    stopLossPct: 0.8,
    timeoutMs: 6 * 60 * 60 * 1000,
    takeProfitLadder: [
      { multiple: 5, portion: 0.2, reason: "take_profit_5x" as const },
      { multiple: 15, portion: 0.2, reason: "take_profit_15x" as const },
      { multiple: 50, portion: 0.15, reason: "take_profit_50x" as const }
    ],
    trailingStopActivationMultiple: 15,
    trailingStopDrawdownPct: 0.7,
    timeoutTrendScoreThreshold: 0.45,
    maxOpenPositionsPerMemeTopic: 2,
    maxOpenPositionsPerCreator: 1,
    maxDailyBuysPerSymbolFamily: 1
  };
}

function launch(overrides: Partial<TokenLaunch>): TokenLaunch {
  return {
    mint: "Mint111",
    source: "test",
    signature: `sig:${overrides.mint ?? "Mint111"}`,
    pool: "pump",
    creator: "Creator111",
    name: "Moon",
    symbol: "MOON",
    createdAt: new Date("2026-05-08T12:00:00.000Z"),
    raw: {},
    ...overrides
  };
}
