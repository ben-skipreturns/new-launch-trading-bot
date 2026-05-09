import { describe, expect, it } from "vitest";
import {
  DefaultFeatureExtractor,
  DefaultPaperBroker,
  HeuristicScorer,
  JsonlLaunchFeed,
  MemeTrendEngine,
  MemoryStore,
  ReplayRunner,
  StaticFixtureEnricher,
  StaticTrendSource,
  TokenMemeMatcher,
  TradingPipeline
} from "../index.js";

describe("ReplayRunner", () => {
  it("runs the fixture through scoring and paper trading", async () => {
    const store = new MemoryStore();
    await new MemeTrendEngine(store, [
      new StaticTrendSource("test-trends", [
        {
          id: "trend-observation:moon-ai-sol",
          source: "test-trends",
          phrase: "Moon AI Sol",
          observedAt: new Date("2026-05-08T11:59:00.000Z"),
          url: "https://example.com/moon-ai-sol",
          title: "Moon AI Sol",
          traffic: 50_000,
          weight: 1,
          raw: {}
        }
      ])
    ]).refresh();
    const pipeline = new TradingPipeline(
      store,
      new StaticFixtureEnricher({
        MoonMint111111111111111111111111111111111111: {
          observedAt: new Date("2026-05-08T12:00:05.000Z"),
          priceSol: 0.00000062,
          liquidityUsd: 22_500,
          topHolderShare: 0.08,
          devHoldingShare: 0.02,
          insiderShare: 0.03,
          organicScore: 0.76,
          sentimentKeywords: ["ai"],
          socialLinks: {},
          raw: {}
        }
      }),
      new DefaultFeatureExtractor(store),
      new HeuristicScorer(),
      new DefaultPaperBroker(store),
      new TokenMemeMatcher()
    );
    const result = await new ReplayRunner(new JsonlLaunchFeed("fixtures/pumpapi-events.jsonl"), pipeline).run();
    const orders = await store.listPaperOrders();

    expect(result.events).toBeGreaterThan(0);
    expect(orders.some((order) => order.side === "buy" && order.status === "filled")).toBe(true);
    expect(orders.some((order) => order.side === "sell" && order.reason === "take_profit_5x")).toBe(true);
  });
});
