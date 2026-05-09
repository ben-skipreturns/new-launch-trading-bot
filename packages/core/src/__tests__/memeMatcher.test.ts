import { describe, expect, it } from "vitest";
import { buildTrendTopics, TokenMemeMatcher } from "../index.js";
import type { TokenLaunch, TrendObservation } from "../domain/types.js";

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
