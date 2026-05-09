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
              evidenceUrls: ["https://example.com/moodeng-news"],
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
    expect(topic.velocityScore).toBe(0.86);
    expect(topic.noveltyScore).toBe(0.8);
    expect(topic.evidenceUrls).toContain("https://example.com/moodeng-news");
    expect(raw.openAiMemeTopic?.likelySymbols).toContain("MOODENG");
    expect(raw.openAiMemeTopic?.reasonCodes).toContain("viral_animal");
    expect(raw.openAiMemeTopic?.riskFlags).toContain("copycat_swarm");
    expect(raw.openAiMemeTopic?.saturationRisk).toBe(0.25);
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
