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

    const enrichment = await new TokenMetadataEnricher({ resolveHostname: publicResolver }).enrich(launch("https://example.com/meta.json"));

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/meta.json", expect.objectContaining({ redirect: "manual" }));
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

    await new TokenMetadataEnricher({ ipfsGateway: "https://gateway.example/ipfs/", resolveHostname: publicResolver }).enrich(launch("ipfs://abc123"));

    expect(fetchMock).toHaveBeenCalledWith("https://gateway.example/ipfs/abc123", expect.objectContaining({ redirect: "manual" }));
  });

  it("blocks direct private metadata URLs before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const enrichment = await new TokenMetadataEnricher({ resolveHostname: publicResolver }).enrich(launch("http://169.254.169.254/latest/meta-data"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(enrichment).toMatchObject({
      provider: "token-metadata-uri-failed",
      raw: {
        reason: "blocked_private_ip",
        blockedUrl: "http://169.254.169.254/latest/meta-data"
      }
    });
  });

  it("blocks hostnames that resolve to private addresses", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const enrichment = await new TokenMetadataEnricher({ resolveHostname: async () => ["127.0.0.1"] }).enrich(launch("https://evil.example/meta.json"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(enrichment).toMatchObject({
      provider: "token-metadata-uri-failed",
      raw: {
        reason: "blocked_private_ip",
        blockedUrl: "https://evil.example/meta.json"
      }
    });
  });

  it("re-checks redirect targets before following them", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 302,
      headers: new Headers({ location: "http://127.0.0.1/meta.json" })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const enrichment = await new TokenMetadataEnricher({ resolveHostname: publicResolver }).enrich(launch("https://example.com/redirect"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(enrichment).toMatchObject({
      provider: "token-metadata-uri-failed",
      raw: {
        reason: "blocked_private_ip",
        blockedUrl: "http://127.0.0.1/meta.json",
        redirects: ["http://127.0.0.1/meta.json"]
      }
    });
  });

  it("returns a cacheable failure marker for invalid metadata JSON", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "not json"
    }));
    vi.stubGlobal("fetch", fetchMock);

    const enrichment = await new TokenMetadataEnricher({ resolveHostname: publicResolver }).enrich(launch("https://example.com/not-json"));

    expect(enrichment).toMatchObject({
      provider: "token-metadata-uri-failed",
      raw: {
        reason: "invalid_metadata_json",
        finalUrl: "https://example.com/not-json"
      }
    });
  });
});

async function publicResolver(): Promise<string[]> {
  return ["93.184.216.34"];
}

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
