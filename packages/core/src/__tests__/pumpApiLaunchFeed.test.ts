import { describe, expect, it } from "vitest";
import { parsePumpApiMessage } from "../providers/pumpApiLaunchFeed.js";

describe("parsePumpApiMessage", () => {
  it("returns parser rejects for invalid JSON and unsupported payloads", () => {
    const invalidJson = parsePumpApiMessage("{bad-json");
    const unsupported = parsePumpApiMessage(JSON.stringify({ signature: "sig-comment", txType: "comment", mint: "MintIgnored111" }));

    expect(invalidJson.reject?.reason).toBe("invalid_json");
    expect(invalidJson.reject?.payloadText).toContain("{bad-json");
    expect(unsupported.reject?.reason).toBe("unsupported_or_invalid_payload");
    expect(unsupported.reject?.payload).toMatchObject({ signature: "sig-comment" });
  });

  it("returns valid launch events after rejected payloads", () => {
    const parsed = parsePumpApiMessage(
      JSON.stringify({
        signature: "sig-create",
        txType: "create",
        mint: "Mint111",
        txSigner: "Creator111",
        timestamp: "2026-05-08T12:00:00.000Z",
        name: "Moon",
        symbol: "MOON"
      })
    );

    expect(parsed.reject).toBeUndefined();
    expect(parsed.event?.tokenLaunch?.mint).toBe("Mint111");
  });
});
