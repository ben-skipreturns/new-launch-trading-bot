import { describe, expect, it } from "vitest";
import {
  calibrateOpenAiRadarTopic,
  estimateOpenAiTrendCost,
  MemoryStore,
  OpenAiMemeTrendSource,
  topicToObservation,
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

  it("filters weak active topics into application rejections before storing observations", async () => {
    const store = new MemoryStore();
    const source = new OpenAiMemeTrendSource({
      apiKey: "test-key",
      store,
      now: () => new Date("2026-05-09T12:07:00.000Z"),
      fetchFn: async () => jsonResponse(openAiPayload({ includeWeakActiveTopic: true }))
    });

    const observations = await source.fetchObservations();
    const runs = await store.listTrendRefreshRuns();
    const raw = runs[0].raw as {
      modelActiveTopicCount?: number;
      acceptedTopicCount?: number;
      applicationRejectedCandidates?: Array<{ canonicalPhrase?: string; rejectionReasons?: string[]; sourceCoverage?: number }>;
    };

    expect(observations).toHaveLength(1);
    expect(raw.modelActiveTopicCount).toBe(2);
    expect(raw.acceptedTopicCount).toBe(1);
    expect(raw.applicationRejectedCandidates).toEqual([
      expect.objectContaining({
        canonicalPhrase: "river",
        sourceCoverage: 1,
        rejectionReasons: expect.arrayContaining([
          "insufficient_independent_sources",
          "blocking_generic_name",
          "blocking_weak_token_name"
        ])
      })
    ]);
  });

  it("caps single-source OpenAI memeability before observation storage", () => {
    const topic = radarTopic({
      canonicalPhrase: "Obsession Whale",
      evidenceUrls: ["https://x.com/example/status/1"],
      memeabilityScore: 0.96,
      tokenizationLikelihood: 0.8,
      velocityScore: 0.72,
      noveltyScore: 0.7,
      riskFlags: ["stale evidence"]
    });

    const calibrated = calibrateOpenAiRadarTopic(topic);
    const observation = topicToObservation(topic, {
      model: "gpt-5.4-mini",
      promptVersion: "openai-meme-radar-v2",
      runId: "run:test",
      observedAt: new Date("2026-05-09T12:07:00.000Z"),
      refreshWindowStartedAt: new Date("2026-05-09T12:00:00.000Z"),
      refreshWindowEndedAt: new Date("2026-05-09T12:15:00.000Z")
    });
    const raw = observation.raw as { openAiMemeTopic?: { memeabilityScore?: number; riskFlags?: string[]; sourceCoverage?: number } };

    expect(calibrated.memeabilityScore).toBeLessThanOrEqual(0.65);
    expect(raw.openAiMemeTopic?.memeabilityScore).toBeLessThanOrEqual(0.65);
    expect(raw.openAiMemeTopic?.sourceCoverage).toBe(1);
    expect(raw.openAiMemeTopic?.riskFlags).toContain("stale_evidence");
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

  it("claims the refresh window before calling OpenAI", async () => {
    const store = new MemoryStore();
    let fetchCalls = 0;
    let releaseFetch!: () => void;
    let enteredFetch!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      enteredFetch = resolve;
    });
    const fetchRelease = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const source = new OpenAiMemeTrendSource({
      apiKey: "test-key",
      store,
      now: () => new Date("2026-05-09T12:07:00.000Z"),
      fetchFn: async () => {
        fetchCalls += 1;
        enteredFetch();
        await fetchRelease;
        return jsonResponse(openAiPayload());
      }
    });

    const firstRefresh = source.fetchObservations();
    await fetchStarted;
    const duplicateObservations = await source.fetchObservations();
    releaseFetch();
    const observations = await firstRefresh;

    expect(fetchCalls).toBe(1);
    expect(duplicateObservations).toEqual([]);
    expect(observations).toHaveLength(1);
    expect((await store.listTrendRefreshRuns()).map((run) => run.status)).toEqual(["success", "skipped_duplicate"]);
  });

  it("records usage-derived cost when parsing a failed OpenAI response", async () => {
    const store = new MemoryStore();
    const source = new OpenAiMemeTrendSource({
      apiKey: "test-key",
      store,
      now: () => new Date("2026-05-09T12:07:00.000Z"),
      fetchFn: async () => jsonResponse({ ...openAiPayload(), output_text: "{not-json" })
    });

    await expect(source.fetchObservations()).rejects.toThrow();

    const runs = await store.listTrendRefreshRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "error",
      inputTokens: 1200,
      cachedInputTokens: 200,
      outputTokens: 500,
      webSearchCalls: 1
    });
    expect(runs[0].estimatedCostUsd).toBeGreaterThan(0);
  });

  it("skips refreshes when estimated spend would exceed the configured cap", async () => {
    const store = new MemoryStore();
    await store.insertTrendRefreshRun(refreshRun({ estimatedCostUsd: 0.02, status: "error" }));
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

function openAiPayload(options: { includeWeakActiveTopic?: boolean } = {}) {
  const activeTopics = [
    radarTopic({
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
      evidenceUrls: ["https://example.com/moodeng", "https://news.example/moodeng"],
      reasonCodes: ["viral_animal", "remixable_visual"],
      riskFlags: ["copycat_swarm"],
      launchThesis: "A globally legible animal story with short tickerability and visual remix potential."
    })
  ];
  if (options.includeWeakActiveTopic) {
    activeTopics.push(
      radarTopic({
        canonicalPhrase: "River",
        aliases: ["flow"],
        likelySymbols: ["RIVER"],
        topicType: "other",
        memeabilityScore: 0.74,
        tokenizationLikelihood: 0.66,
        velocityScore: 0.6,
        noveltyScore: 0.58,
        saturationRisk: 0.35,
        evidenceUrls: ["https://x.com/example/status/2"],
        reasonCodes: ["tickerable"],
        riskFlags: ["generic name", "weak token name"],
        launchThesis: "Simple nature word, but no clear meme loop."
      })
    );
  }
  return {
    id: "resp_test",
    output_text: JSON.stringify({
      generatedAt: "2026-05-09T12:07:00.000Z",
      activeTopics,
      rejectedCandidates: [radarTopic({ canonicalPhrase: "Generic launchpad meta", rejectionReason: "Saturated category with no fresh hook." })]
    }),
    output: [{ type: "web_search_call", action: { sources: [{ url: "https://example.com/moodeng" }] } }],
    usage: {
      input_tokens: 1200,
      input_tokens_details: { cached_tokens: 200 },
      output_tokens: 500
    }
  };
}

function radarTopic(overrides: Partial<{
  canonicalPhrase: string;
  aliases: string[];
  likelySymbols: string[];
  topicType: "person" | "animal" | "politics" | "sports" | "entertainment" | "internet_phrase" | "ai" | "crypto" | "other";
  memeabilityScore: number;
  tokenizationLikelihood: number;
  velocityScore: number;
  noveltyScore: number;
  saturationRisk: number;
  geography: string;
  evidenceUrls: string[];
  reasonCodes: string[];
  riskFlags: string[];
  launchThesis: string;
  rejectionReason: string;
}> = {}) {
  return {
    canonicalPhrase: overrides.canonicalPhrase ?? "Moo Deng baby hippo",
    aliases: overrides.aliases ?? [],
    likelySymbols: overrides.likelySymbols ?? ["MOODENG"],
    topicType: overrides.topicType ?? "animal",
    memeabilityScore: overrides.memeabilityScore ?? 0.9,
    tokenizationLikelihood: overrides.tokenizationLikelihood ?? 0.85,
    velocityScore: overrides.velocityScore ?? 0.78,
    noveltyScore: overrides.noveltyScore ?? 0.72,
    saturationRisk: overrides.saturationRisk ?? 0.3,
    geography: overrides.geography ?? "US/global",
    evidenceUrls: overrides.evidenceUrls ?? ["https://example.com/topic", "https://news.example/topic"],
    reasonCodes: overrides.reasonCodes ?? ["viral_animal"],
    riskFlags: overrides.riskFlags ?? [],
    launchThesis: overrides.launchThesis ?? "A compact meme topic with launchpad-native shape.",
    ...(overrides.rejectionReason ? { rejectionReason: overrides.rejectionReason } : {})
  };
}

function refreshRun(overrides: Partial<TrendRefreshRun> = {}): TrendRefreshRun {
  return {
    id: "openai-meme-radar:gpt-5.4-mini:2026-05-09T12:00:00.000Z",
    source: "openai-meme-radar",
    model: "gpt-5.4-mini",
    promptVersion: "openai-meme-radar-v2",
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
