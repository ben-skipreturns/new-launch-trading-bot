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

function openAiTopic(overrides: Partial<{ canonicalPhrase: string; aliases: string[]; likelySymbols: string[] }> = {}): TrendTopic {
  const canonicalPhrase = overrides.canonicalPhrase ?? "river";
  return {
    id: `trend:${canonicalPhrase}`,
    canonicalPhrase,
    aliases: overrides.aliases ?? [canonicalPhrase],
    topicType: "other",
    sourceCoverage: 1,
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
        memeabilityScore: 0.65,
        tokenizationLikelihood: 0.62,
        saturationRisk: 0.35,
        riskFlags: ["generic_name", "weak_token_name"]
      }
    }
  };
}
