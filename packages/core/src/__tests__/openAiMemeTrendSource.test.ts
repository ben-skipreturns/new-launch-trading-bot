import { describe, expect, it } from "vitest";
import {
  estimateOpenAiTrendCost,
  MemoryStore,
  OpenAiMemeTrendSource,
  type TrendRefreshRun
} from "../index.js";

describe("OpenAiMemeTrendSource", () => {
  it("parses structured OpenAI topics into trend observations and records refresh cost", async () => {
    const store = new MemoryStore();
    let fetchCalls = 0;
    const source = new OpenAiMemeTrendSource({
      apiKey: "test-key",
      store,
      now: () => new Date("2026-05-09T12:07:00.000Z"),
      fetchFn: async () => {
        fetchCalls += 1;
        return jsonResponse(openAiPayload());
      }
    });

    const observations = await source.fetchObservations();

    expect(fetchCalls).toBe(1);
    expect(observations).toHaveLength(1);
    expect(observations[0].source).toBe("openai-meme-radar");
    expect(observations[0].phrase).toBe("moo deng baby hippo");
    expect(observations[0].raw).toMatchObject({
      openAiMemeTopic: {
        canonicalPhrase: "moo deng baby hippo",
        likelySymbols: ["MOODENG", "DENG"]
      },
      model: "gpt-5.4-mini",
      responseId: "resp_test"
    });

    const runs = await store.listTrendRefreshRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "success",
      topicsFound: 1,
      inputTokens: 1200,
      cachedInputTokens: 200,
      outputTokens: 500,
      webSearchCalls: 1,
      responseId: "resp_test"
    });
    expect(runs[0].estimatedCostUsd).toBeGreaterThan(0);
    expect(runs[0].raw).toMatchObject({
      response: { id: "resp_test" },
      sourceUrls: ["https://example.com/moodeng"]
    });
  });

  it("does not call OpenAI twice for the same successful refresh window", async () => {
    const store = new MemoryStore();
    let fetchCalls = 0;
    const source = new OpenAiMemeTrendSource({
      apiKey: "test-key",
      store,
      now: () => new Date("2026-05-09T12:07:00.000Z"),
      fetchFn: async () => {
        fetchCalls += 1;
        return jsonResponse(openAiPayload());
      }
    });

    await source.fetchObservations();
    const duplicateObservations = await source.fetchObservations();

    expect(fetchCalls).toBe(1);
    expect(duplicateObservations).toEqual([]);
    expect((await store.listTrendRefreshRuns()).map((run) => run.status)).toEqual(["success", "skipped_duplicate"]);
  });

  it("skips refreshes when estimated spend would exceed the configured cap", async () => {
    const store = new MemoryStore();
    await store.insertTrendRefreshRun(refreshRun({ estimatedCostUsd: 0.02 }));
    const source = new OpenAiMemeTrendSource({
      apiKey: "test-key",
      store,
      dailyBudgetUsd: 0.03,
      estimatedRefreshCostUsd: 0.02,
      now: () => new Date("2026-05-09T12:16:00.000Z"),
      fetchFn: async () => {
        throw new Error("budget checks should run before fetch");
      }
    });

    const observations = await source.fetchObservations();

    expect(observations).toEqual([]);
    expect((await store.listTrendRefreshRuns()).map((run) => run.status)).toContain("skipped_budget");
  });

  it("estimates model and web-search cost from usage", () => {
    const cost = estimateOpenAiTrendCost({
      model: "gpt-5.4-mini",
      inputTokens: 10_000,
      cachedInputTokens: 2_000,
      outputTokens: 2_000,
      webSearchCalls: 2
    });

    expect(cost).toBeGreaterThan(0.02);
    expect(cost).toBeLessThan(0.04);
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function openAiPayload() {
  return {
    id: "resp_test",
    output_text: JSON.stringify({
      generatedAt: "2026-05-09T12:07:00.000Z",
      topics: [
        {
          canonicalPhrase: "Moo Deng baby hippo",
          aliases: ["moo deng", "baby hippo"],
          likelySymbols: ["MOODENG", "DENG"],
          topicType: "animal",
          memeabilityScore: 0.95,
          tokenizationLikelihood: 0.91,
          velocityScore: 0.86,
          noveltyScore: 0.8,
          saturationRisk: 0.22,
          geography: "US/global",
          evidenceUrls: ["https://example.com/moodeng"],
          reasonCodes: ["viral_animal", "remixable_visual"],
          riskFlags: ["copycat_swarm"],
          launchThesis: "A globally legible animal story with short tickerability and visual remix potential."
        }
      ]
    }),
    output: [{ type: "web_search_call", action: { sources: [{ url: "https://example.com/moodeng" }] } }],
    usage: {
      input_tokens: 1200,
      input_tokens_details: { cached_tokens: 200 },
      output_tokens: 500
    }
  };
}

function refreshRun(overrides: Partial<TrendRefreshRun> = {}): TrendRefreshRun {
  return {
    id: "openai-meme-radar:gpt-5.4-mini:2026-05-09T12:00:00.000Z",
    source: "openai-meme-radar",
    model: "gpt-5.4-mini",
    promptVersion: "openai-meme-radar-v1",
    refreshWindowStartedAt: new Date("2026-05-09T12:00:00.000Z"),
    refreshWindowEndedAt: new Date("2026-05-09T12:15:00.000Z"),
    startedAt: new Date("2026-05-09T12:00:05.000Z"),
    completedAt: new Date("2026-05-09T12:00:12.000Z"),
    status: "success",
    topicsFound: 5,
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 500,
    webSearchCalls: 1,
    estimatedCostUsd: 0.01,
    raw: {},
    ...overrides
  };
}
