import { describe, expect, it } from "vitest";
import {
  DefaultFeatureExtractor,
  DefaultPaperBroker,
  HeuristicScorer,
  LivePositionSupervisor,
  MemoryStore,
  TradingPipeline,
  type TokenEnrichment,
  type TokenLaunch
} from "../index.js";

describe("LivePositionSupervisor", () => {
  it("captures due age milestones once so live streams do not depend on later events", async () => {
    const store = new MemoryStore();
    const launch = tokenLaunch("MintLive111", "2026-05-08T12:00:00.000Z");
    await store.upsertTokenLaunch(launch);
    await store.upsertTokenEnrichment(enrichment(launch.mint, "2026-05-08T12:01:00.000Z"));
    const supervisor = new LivePositionSupervisor(store, pipeline(store), { ageMilestonesSeconds: [15, 30, 60] });

    const first = await supervisor.captureDueAgeSnapshots(new Date("2026-05-08T12:01:10.000Z"));
    const second = await supervisor.captureDueAgeSnapshots(new Date("2026-05-08T12:01:20.000Z"));

    expect(first.snapshots).toBe(3);
    expect(second.snapshots).toBe(0);
    expect((await store.listScoreSnapshots()).filter((score) => score.features.triggerType === "age")).toHaveLength(3);
  });

  it("captures open-position snapshots for timeout, stop, and trailing checks during quiet streams", async () => {
    const store = new MemoryStore();
    const launch = tokenLaunch("MintOpen111", "2026-05-08T12:00:00.000Z");
    await store.upsertTokenLaunch(launch);
    await store.upsertTokenEnrichment(enrichment(launch.mint, "2026-05-08T12:00:10.000Z"));
    await store.upsertPaperPosition({
      mint: launch.mint,
      status: "open",
      openedAt: new Date("2026-05-08T12:00:00.000Z"),
      entryPriceSol: 0.000001,
      tokensOpen: 1000,
      tokensBought: 1000,
      solInvested: 0.05,
      solRealized: 0,
      stopPriceSol: 0.0000002,
      highPriceSol: 0.000001,
      ladderState: { "5": false, "15": false, "50": false }
    });
    const supervisor = new LivePositionSupervisor(store, pipeline(store), { openPositionSnapshotIntervalMs: 30_000 });

    const result = await supervisor.captureOpenPositionSnapshots(new Date("2026-05-08T12:00:20.000Z"));

    expect(result).toMatchObject({ positions: 1, snapshots: 1 });
    expect((await store.listScoreSnapshots())[0]?.features.triggerValue).toMatch(/^open-position:/);
  });
});

function pipeline(store: MemoryStore): TradingPipeline {
  return new TradingPipeline(store, null, new DefaultFeatureExtractor(store), new HeuristicScorer(), new DefaultPaperBroker(store));
}

function tokenLaunch(mint: string, createdAt: string): TokenLaunch {
  return {
    mint,
    source: "test",
    signature: `sig:${mint}`,
    pool: "pump",
    name: "Live Token",
    symbol: "LIVE",
    createdAt: new Date(createdAt),
    raw: {}
  };
}

function enrichment(mint: string, observedAt: string): TokenEnrichment {
  return {
    mint,
    observedAt: new Date(observedAt),
    provider: "test",
    priceSol: 0.000001,
    liquidityUsd: 50_000,
    holderCount: 100,
    topHolderShare: 0.05,
    sentimentKeywords: [],
    socialLinks: {},
    raw: {}
  };
}
