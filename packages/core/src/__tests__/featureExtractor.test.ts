import { describe, expect, it } from "vitest";
import { DefaultFeatureExtractor } from "../domain/defaultFeatureExtractor.js";
import { MemoryStore } from "../storage/memoryStore.js";
import type { TokenLaunch, TradeEvent } from "../domain/types.js";

describe("DefaultFeatureExtractor", () => {
  it("only uses trades and enrichments available at the snapshot timestamp", async () => {
    const store = new MemoryStore();
    const launch: TokenLaunch = {
      mint: "Mint111",
      source: "test",
      signature: "create",
      pool: "pump",
      creator: "Creator",
      createdAt: new Date("2026-05-08T12:00:00.000Z"),
      initialBuySol: 1,
      vSolInBondingCurve: 31,
      raw: {}
    };
    await store.upsertTokenLaunch(launch);
    await store.upsertTradeEvent(trade("buy-early", "2026-05-08T12:00:10.000Z", 5, 36, 0.000001));
    await store.upsertTradeEvent(trade("buy-future", "2026-05-08T12:10:00.000Z", 50, 86, 0.00001));

    const snapshot = await new DefaultFeatureExtractor(store).extract({
      launch,
      asOf: new Date("2026-05-08T12:00:30.000Z"),
      triggerType: "age",
      triggerValue: "30"
    });

    expect(snapshot.tradeCount).toBe(1);
    expect(snapshot.vSolInBondingCurve).toBe(36);
    expect(snapshot.priceSol).toBe(0.000001);
  });
});

function trade(signature: string, occurredAt: string, solAmount: number, vSol: number, priceSol: number): TradeEvent {
  return {
    signature,
    source: "test",
    mint: "Mint111",
    eventType: "buy",
    trader: signature,
    occurredAt: new Date(occurredAt),
    solAmount,
    vSolInBondingCurve: vSol,
    priceSol,
    isBotLike: false,
    isWashTrade: false,
    raw: {}
  };
}
