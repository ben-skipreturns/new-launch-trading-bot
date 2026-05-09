import { describe, expect, it } from "vitest";
import { MemeTrendEngine, MemoryStore, StaticTrendSource } from "../index.js";

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
});
