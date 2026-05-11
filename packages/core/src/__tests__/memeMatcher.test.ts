import { describe, expect, it } from "vitest";
import { buildTrendTopics, TokenMemeMatcher } from "../index.js";
import type { TokenLaunch, TrendObservation, TrendTopic } from "../domain/types.js";

describe("TokenMemeMatcher", () => {
  const observedAt = new Date("2026-05-08T12:00:00.000Z");
  const topics = buildTrendTopics([
    observation("Moo Deng baby hippo", 100_000),
    observation("Peanut the Squirrel", 150_000),
    observation("Just a Chill Guy", 125_000),
    observation("Official Trump memecoin", 500_000),
    observation("Truth Terminal AI GOAT Fartcoin", 80_000),
    observation("dogwifhat", 50_000)
  ]);

  it.each([
    ["MOODENG", "Moo Deng", "animal"],
    ["PNUT", "Peanut", "animal"],
    ["CHILLGUY", "Just a Chill Guy", "internet_phrase"],
    ["TRUMP", "Official Trump", "politics"],
    ["GOAT", "Goatseus Maximus", "ai"],
    ["WIF", "dogwifhat", "internet_phrase"]
  ])("matches historical meme pattern %s", async (symbol, name, topicType) => {
    const match = await new TokenMemeMatcher().match({
      launch: launch(symbol, name),
      topics,
      observedAt
    });

    expect(match.memeRelevanceScore).toBeGreaterThanOrEqual(0.7);
    expect(match.topicType).toBe(topicType);
    expect(match.rejectFlags).not.toContain("MEME_RELEVANCE_TOO_LOW");
  });

  it("rejects generic memecoin text without source-backed relevance", async () => {
    const match = await new TokenMemeMatcher().match({
      launch: launch("MOON", "Moon Rocket Token"),
      topics,
      observedAt
    });

    expect(match.memeRelevanceScore).toBeLessThan(0.7);
    expect(match.rejectFlags).toContain("MEME_RELEVANCE_TOO_LOW");
  });

  it("uses fetched metadata text when launch name and symbol are sparse", async () => {
    const match = await new TokenMemeMatcher().match({
      launch: launch("MD", "MD"),
      topics,
      enrichment: {
        mint: "MintMD",
        observedAt,
        provider: "token-metadata-uri",
        sentimentKeywords: [],
        socialLinks: {},
        raw: {
          metadataText: "Moo Deng baby hippo official viral community page"
        }
      },
      observedAt
    });

    expect(match.memeRelevanceScore).toBeGreaterThanOrEqual(0.7);
    expect(match.canonicalPhrase).toBe("moo deng baby hippo");
    expect(match.raw).toMatchObject({
      bestTopic: {
        matchedAliases: expect.any(Array),
        scoreComponents: expect.any(Object)
      }
    });
  });

  it("finds metadata text inside merged enrichment raw payloads", async () => {
    const match = await new TokenMemeMatcher().match({
      launch: launch("PN", "PN"),
      topics,
      enrichment: {
        mint: "MintPN",
        observedAt,
        provider: "merged+token-metadata-uri",
        sentimentKeywords: [],
        socialLinks: {},
        raw: {
          merged: { provider: "price" },
          current: { metadataText: "Peanut the Squirrel viral news meme" }
        }
      },
      observedAt
    });

    expect(match.memeRelevanceScore).toBeGreaterThanOrEqual(0.7);
    expect(match.canonicalPhrase).toBe("peanut the squirrel");
  });

  it("penalizes generic copycat symbols unless the token has specific trend text", async () => {
    const match = await new TokenMemeMatcher().match({
      launch: launch("CAT", "Cat"),
      topics: [
        openAiTopic({
          canonicalPhrase: "ganymede blind cat",
          aliases: ["ganymede blind cat", "ganymede", "blind cat", "cat"],
          likelySymbols: ["GANY", "BLIND", "CAT"],
          sourceCoverage: 3,
          memeabilityScore: 0.86,
          tokenizationLikelihood: 0.78,
          saturationRisk: 0.55,
          riskFlags: []
        })
      ],
      observedAt
    });

    expect(match.memeRelevanceScore).toBeLessThan(0.7);
    expect(match.rejectFlags).toContain("GENERIC_SYMBOL_ONLY");
    expect(match.rejectFlags).toContain("MEME_RELEVANCE_TOO_LOW");
  });

  it("ignores stale one-source OpenAI topics even when token text matches", async () => {
    const match = await new TokenMemeMatcher().match({
      launch: launch("RIVER", "River"),
      topics: [openAiTopic({ canonicalPhrase: "river", aliases: ["river"], likelySymbols: ["RIVER"] })],
      observedAt
    });

    expect(match.memeRelevanceScore).toBe(0);
    expect(match.rejectFlags).toContain("NO_MATCHABLE_TOPICS");
    expect(match.rejectFlags).toContain("MEME_RELEVANCE_TOO_LOW");
  });
});

function observation(phrase: string, traffic: number): TrendObservation {
  return {
    id: `obs:${phrase}`,
    source: "test",
    phrase,
    observedAt: new Date("2026-05-08T11:50:00.000Z"),
    url: `https://example.com/${phrase}`,
    traffic,
    weight: 1,
    raw: {}
  };
}

function launch(symbol: string, name: string): TokenLaunch {
  return {
    mint: `Mint${symbol}`,
    source: "test",
    signature: `sig-${symbol}`,
    pool: "pump",
    name,
    symbol,
    createdAt: new Date("2026-05-08T12:00:00.000Z"),
    raw: {}
  };
}

function openAiTopic(
  overrides: Partial<{
    canonicalPhrase: string;
    aliases: string[];
    likelySymbols: string[];
    sourceCoverage: number;
    memeabilityScore: number;
    tokenizationLikelihood: number;
    saturationRisk: number;
    riskFlags: string[];
  }> = {}
): TrendTopic {
  const canonicalPhrase = overrides.canonicalPhrase ?? "river";
  return {
    id: `trend:${canonicalPhrase}`,
    canonicalPhrase,
    aliases: overrides.aliases ?? [canonicalPhrase],
    topicType: "other",
    sourceCoverage: overrides.sourceCoverage ?? 1,
    velocityScore: 0.6,
    noveltyScore: 0.58,
    firstSeen: new Date("2026-05-08T11:50:00.000Z"),
    lastSeen: new Date("2026-05-08T11:55:00.000Z"),
    evidenceUrls: ["https://x.com/example/status/1"],
    raw: {
      openAiMemeTopic: {
        canonicalPhrase,
        aliases: overrides.aliases ?? [canonicalPhrase],
        likelySymbols: overrides.likelySymbols ?? [],
        memeabilityScore: overrides.memeabilityScore ?? 0.65,
        tokenizationLikelihood: overrides.tokenizationLikelihood ?? 0.62,
        saturationRisk: overrides.saturationRisk ?? 0.35,
        riskFlags: overrides.riskFlags ?? ["generic_name", "weak_token_name"]
      }
    }
  };
}
