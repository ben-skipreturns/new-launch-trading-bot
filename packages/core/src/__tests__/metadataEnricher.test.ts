import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenMetadataEnricher } from "../index.js";
import type { TokenLaunch } from "../domain/types.js";

describe("TokenMetadataEnricher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches token URI metadata and extracts matchable text", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-length": "180" }),
      text: async () =>
        JSON.stringify({
          name: "Moo Deng",
          symbol: "MOODENG",
          description: "Viral baby hippo community meme",
          image: "https://example.com/moodeng.png",
          twitter: "https://x.com/moodeng"
        })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const enrichment = await new TokenMetadataEnricher().enrich(launch("https://example.com/meta.json"));

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/meta.json", expect.any(Object));
    expect(enrichment).toMatchObject({
      provider: "token-metadata-uri",
      sentimentKeywords: expect.arrayContaining(["hippo"]),
      socialLinks: { twitter: "https://x.com/moodeng" },
      raw: {
        metadataText: expect.stringContaining("Viral baby hippo")
      }
    });
  });

  it("resolves ipfs metadata URIs through the configured gateway", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers(),
      text: async () => JSON.stringify({ name: "Peanut", description: "Squirrel meme" })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await new TokenMetadataEnricher({ ipfsGateway: "https://gateway.example/ipfs/" }).enrich(launch("ipfs://abc123"));

    expect(fetchMock).toHaveBeenCalledWith("https://gateway.example/ipfs/abc123", expect.any(Object));
  });
});

function launch(uri: string): TokenLaunch {
  return {
    mint: "MintMeta",
    source: "test",
    signature: "sig-meta",
    pool: "pump",
    name: "Meta",
    symbol: "META",
    uri,
    createdAt: new Date("2026-05-08T12:00:00.000Z"),
    raw: {}
  };
}
