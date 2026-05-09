import { describe, expect, it } from "vitest";
import { normalizePumpApiEvent } from "../normalizers/pumpApi.js";

describe("normalizePumpApiEvent", () => {
  it("normalizes create events into token launches", () => {
    const event = normalizePumpApiEvent({
      signature: "sig-create",
      txType: "create",
      mint: "Mint111",
      txSigner: "Creator111",
      timestamp: "2026-05-08T12:00:00.000Z",
      solAmount: 1,
      vSolInBondingCurve: 31,
      name: "Moon",
      symbol: "MOON"
    });

    expect(event?.eventType).toBe("create");
    expect(event?.tokenLaunch?.mint).toBe("Mint111");
    expect(event?.tokenLaunch?.creator).toBe("Creator111");
  });

  it("deduces bot-like and wash flags on trade events", () => {
    const event = normalizePumpApiEvent({
      signature: "sig-buy",
      txType: "buy",
      mint: "Mint111",
      txSigner: "Bot111",
      timestamp: "2026-05-08T12:00:10.000Z",
      solAmount: 2,
      priorityFee: 0.0005,
      washTrade: true
    });

    expect(event?.tradeEvent?.isBotLike).toBe(true);
    expect(event?.tradeEvent?.isWashTrade).toBe(true);
  });
});
