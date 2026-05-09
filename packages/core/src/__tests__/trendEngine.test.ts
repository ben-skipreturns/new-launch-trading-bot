import { describe, expect, it } from "vitest";
import { extractTrendCandidatePhrases, MemeTrendEngine, MemoryStore, StaticTrendSource } from "../index.js";
import type { TrendObservation } from "../domain/types.js";

describe("MemeTrendEngine", () => {
  it("normalizes observations into scored trend topics", async () => {
    const store = new MemoryStore();
    const engine = new MemeTrendEngine(store, [
      new StaticTrendSource("test", [
        {
          id: "obs:1",
          source: "google",
          phrase: "Moo Deng Baby Hippo",
          observedAt: new Date("2026-05-08T12:00:00.000Z"),
          url: "https://example.com/moo",
          traffic: 100_000,
          weight: 1,
          raw: {}
        },
        {
          id: "obs:2",
          source: "gdelt",
          phrase: "Moo Deng baby hippo",
          observedAt: new Date("2026-05-08T12:01:00.000Z"),
          url: "https://example.com/moo-news",
          traffic: 50_000,
          weight: 0.8,
          raw: {}
        }
      ])
    ]);

    const result = await engine.refresh();
    const topic = result.topics[0];

    expect(topic.canonicalPhrase).toBe("moo deng baby hippo");
    expect(topic.topicType).toBe("animal");
    expect(topic.sourceCoverage).toBe(2);
    expect(topic.aliases).toContain("moo deng");
    expect((await store.listTrendTopics()).length).toBe(1);
  });

  it("extracts memeable candidates from news headlines instead of keeping whole headlines", async () => {
    const store = new MemoryStore();
    const engine = new MemeTrendEngine(store, [
      new StaticTrendSource("test", [
        observation("gdelt", "Moo Deng baby hippo becomes Thailand's viral star", 100_000),
        observation("google", "Moo Deng baby hippo", 200_000)
      ])
    ]);

    const result = await engine.refresh();
    const topic = result.topics.find((item) => item.canonicalPhrase === "moo deng baby hippo");

    expect(topic).toBeDefined();
    expect(topic?.topicType).toBe("animal");
    expect(topic?.sourceCoverage).toBe(2);
    expect(result.topics.some((item) => item.canonicalPhrase.includes("becomes thailands viral star"))).toBe(false);
  });

  it("preserves OpenAI meme radar aliases, scores, evidence, and risk flags", async () => {
    const store = new MemoryStore();
    const engine = new MemeTrendEngine(store, [
      new StaticTrendSource("openai-meme-radar", [
        {
          id: "openai:1",
          source: "openai-meme-radar",
          phrase: "moo deng baby hippo",
          observedAt: new Date("2026-05-09T12:00:00.000Z"),
          url: "https://example.com/moodeng",
          traffic: 250_000,
          weight: 0.9,
          raw: {
            openAiMemeTopic: {
              canonicalPhrase: "moo deng baby hippo",
              aliases: ["moo deng", "moodeng"],
              likelySymbols: ["MOODENG", "DENG"],
              topicType: "animal",
              memeabilityScore: 0.95,
              tokenizationLikelihood: 0.9,
              velocityScore: 0.86,
              noveltyScore: 0.8,
              saturationRisk: 0.25,
              evidenceUrls: ["https://example.com/moodeng-news", "https://news.example/moodeng"],
              reasonCodes: ["viral_animal", "remixable_visual"],
              riskFlags: ["copycat_swarm"],
              launchThesis: "A compact viral animal story with strong visual identity."
            }
          }
        }
      ])
    ]);

    const result = await engine.refresh();
    const topic = result.topics[0];
    const raw = topic.raw as {
      openAiMemeTopic?: {
        likelySymbols?: string[];
        reasonCodes?: string[];
        riskFlags?: string[];
        saturationRisk?: number;
      };
    };

    expect(topic.canonicalPhrase).toBe("moo deng baby hippo");
    expect(topic.aliases).toContain("moodeng");
    expect(topic.aliases).toContain("moo deng");
    expect(topic.topicType).toBe("animal");
    expect(topic.velocityScore).toBe(0.78);
    expect(topic.noveltyScore).toBe(0.62);
    expect(topic.evidenceUrls).toContain("https://example.com/moodeng-news");
    expect(raw.openAiMemeTopic?.likelySymbols).toContain("MOODENG");
    expect(raw.openAiMemeTopic?.reasonCodes).toContain("viral_animal");
    expect(raw.openAiMemeTopic?.riskFlags).toContain("copycat_swarm");
    expect(raw.openAiMemeTopic?.saturationRisk).toBe(0.72);
  });

  it("merges duplicate OpenAI topics and prefers specific canonical names", async () => {
    const store = new MemoryStore();
    const engine = new MemeTrendEngine(store, [
      new StaticTrendSource("openai-meme-radar", [
        openAiObservation("openai:blind-generic", "viral blind cat meme", {
          canonicalPhrase: "viral blind cat meme",
          aliases: ["blind cat", "ganymede"],
          likelySymbols: ["BLND", "CAT", "GANY"],
          evidenceUrls: ["https://dexerto.com/ganymede-blind-cat"]
        }),
        openAiObservation("openai:blind-specific", "ganymede the blind cat", {
          canonicalPhrase: "ganymede the blind cat",
          aliases: ["ganymede", "blind cat"],
          likelySymbols: ["GANY", "CAT"],
          evidenceUrls: ["https://dexerto.com/ganymede-blind-cat"]
        })
      ])
    ]);

    const result = await engine.refresh();

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].canonicalPhrase).toBe("ganymede the blind cat");
    expect(result.topics[0].aliases).toContain("viral blind cat meme");
    expect(result.topics[0].aliases).toContain("ganymede");
  });

  it("calibrates overconfident single-source saturated OpenAI topics", async () => {
    const store = new MemoryStore();
    const engine = new MemeTrendEngine(store, [
      new StaticTrendSource("openai-meme-radar", [
        openAiObservation("openai:cat", "viral cat meme", {
          canonicalPhrase: "viral cat meme",
          aliases: ["cat meme"],
          likelySymbols: ["CAT"],
          evidenceUrls: ["https://en.wikipedia.org/wiki/Cat_meme"],
          memeabilityScore: 1,
          tokenizationLikelihood: 1,
          velocityScore: 1,
          noveltyScore: 1,
          saturationRisk: 1,
          riskFlags: ["cat_saturation", "saturated_clone"]
        })
      ])
    ]);

    const result = await engine.refresh();
    const topic = result.topics[0];
    const raw = topic.raw as {
      openAiMemeTopic?: {
        memeabilityScore?: number;
        tokenizationLikelihood?: number;
        velocityScore?: number;
        noveltyScore?: number;
        saturationRisk?: number;
      };
    };

    expect(topic.sourceCoverage).toBe(1);
    expect(topic.velocityScore).toBeLessThan(1);
    expect(topic.noveltyScore).toBeLessThan(1);
    expect(raw.openAiMemeTopic?.memeabilityScore).toBeLessThan(1);
    expect(raw.openAiMemeTopic?.tokenizationLikelihood).toBeLessThanOrEqual(0.66);
    expect(raw.openAiMemeTopic?.saturationRisk).toBe(1);
  });

  it("filters low-quality market spam headlines from trend candidates", () => {
    const candidates = extractTrendCandidatePhrases(observation("rss", "Bitcoin price prediction today: crypto market update", 25_000));

    expect(candidates).toEqual([]);
  });
});

function observation(source: string, phrase: string, traffic: number): TrendObservation {
  return {
    id: `obs:${source}:${phrase}`,
    source,
    phrase,
    observedAt: new Date("2026-05-08T12:00:00.000Z"),
    url: `https://example.com/${source}`,
    traffic,
    weight: source === "google" ? 1 : 0.8,
    raw: {}
  };
}

function openAiObservation(
  id: string,
  phrase: string,
  overrides: Partial<{
    canonicalPhrase: string;
    aliases: string[];
    likelySymbols: string[];
    topicType: "person" | "animal" | "politics" | "sports" | "entertainment" | "internet_phrase" | "ai" | "crypto" | "other";
    memeabilityScore: number;
    tokenizationLikelihood: number;
    velocityScore: number;
    noveltyScore: number;
    saturationRisk: number;
    evidenceUrls: string[];
    reasonCodes: string[];
    riskFlags: string[];
    launchThesis: string;
  }> = {}
): TrendObservation {
  return {
    id,
    source: "openai-meme-radar",
    phrase,
    observedAt: new Date("2026-05-09T12:00:00.000Z"),
    url: overrides.evidenceUrls?.[0],
    traffic: 100_000,
    weight: 0.9,
    raw: {
      openAiMemeTopic: {
        canonicalPhrase: overrides.canonicalPhrase ?? phrase,
        aliases: overrides.aliases ?? [],
        likelySymbols: overrides.likelySymbols ?? [],
        topicType: overrides.topicType ?? "animal",
        memeabilityScore: overrides.memeabilityScore ?? 0.9,
        tokenizationLikelihood: overrides.tokenizationLikelihood ?? 0.88,
        velocityScore: overrides.velocityScore ?? 0.82,
        noveltyScore: overrides.noveltyScore ?? 0.76,
        saturationRisk: overrides.saturationRisk ?? 0.3,
        evidenceUrls: overrides.evidenceUrls ?? ["https://example.com/topic"],
        reasonCodes: overrides.reasonCodes ?? ["viral_animal"],
        riskFlags: overrides.riskFlags ?? [],
        launchThesis: overrides.launchThesis ?? "A compact meme topic with launchpad-native shape."
      }
    }
  };
}
