import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositeEnricher, JupiterPriceEnricher, type Enricher, type TokenEnrichment, type TokenLaunch } from "../index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CompositeEnricher", () => {
  it("times out a slow provider and keeps usable partial enrichment", async () => {
    const fast: Enricher = {
      name: "fast",
      async enrich(launch) {
        return {
          mint: launch.mint,
          observedAt: new Date("2026-05-08T12:00:00.000Z"),
          provider: "fast",
          priceSol: 0.000001,
          sentimentKeywords: [],
          socialLinks: {},
          raw: {}
        } satisfies TokenEnrichment;
      }
    };
    const slow: Enricher = {
      name: "slow",
      enrich(_launch, signal) {
        return new Promise<TokenEnrichment | null>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
    };
    const enricher = new CompositeEnricher([slow, fast], { perProviderTimeoutMs: 10 });

    const result = await enricher.enrich(launch());

    expect(result?.provider).toContain("fast");
    expect(result?.priceSol).toBe(0.000001);
  });
});

describe("JupiterPriceEnricher", () => {
  it("converts USD token quotes to SOL when Jupiter returns SOL/USD", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("So11111111111111111111111111111111111111112");
      return new Response(
        JSON.stringify({
          data: {
            MintFast111: { price: "0.002" },
            So11111111111111111111111111111111111111112: { price: "200" }
          }
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const result = await new JupiterPriceEnricher().enrich(launch());

    expect(result?.priceUsd).toBe(0.002);
    expect(result?.priceSol).toBeCloseTo(0.00001);
  });
});

function launch(): TokenLaunch {
  return {
    mint: "MintFast111",
    source: "test",
    signature: "sig",
    pool: "pump",
    createdAt: new Date("2026-05-08T12:00:00.000Z"),
    raw: {}
  };
}
