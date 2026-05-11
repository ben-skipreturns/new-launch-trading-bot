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

  it("normalizes alternate PumpApi pool and creator fields", () => {
    const event = normalizePumpApiEvent({
      signature: "sig-create-alt",
      txType: "create",
      mint: "MintAlt111",
      poolId: "PoolAlt111",
      creatorFeeAddress: "CreatorFee111",
      timestamp: 1778241600000,
      name: "Alt Moon",
      symbol: "ALT"
    });

    expect(event?.tokenLaunch?.pool).toBe("PoolAlt111");
    expect(event?.tokenLaunch?.creator).toBe("CreatorFee111");
    expect(event?.tokenLaunch?.createdAt).toBeInstanceOf(Date);
  });

  it("ignores malformed or unsupported PumpApi payloads", () => {
    expect(normalizePumpApiEvent({ txType: "create", mint: "NoSignature" })).toBeNull();
    expect(normalizePumpApiEvent({ signature: "sig-unknown", txType: "comment", mint: "Mint111" })).toBeNull();
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
