import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TrendSource } from "../domain/interfaces.js";
import type { JsonObject, JsonValue, TrendObservation, TrendRefreshRun, TrendTopicType } from "../domain/types.js";
import { buildCaseStudyPromptSummary } from "../meme/caseStudies.js";
import { normalizePhrase, slugify } from "../meme/text.js";
import type { Store, TrendRefreshClaimResult } from "../storage/store.js";
import { clamp, round } from "../utils/math.js";

export const OPENAI_MEME_RADAR_SOURCE = "openai-meme-radar";
export const OPENAI_MEME_RADAR_PROMPT_VERSION = "openai-meme-radar-v2";

export interface OpenAiMemeTrendSourceOptions {
  apiKey?: string;
  model?: string;
  refreshMinutes?: number;
  monthlyBudgetUsd?: number;
  dailyBudgetUsd?: number;
  estimatedRefreshCostUsd?: number;
  staleLeaseMinutes?: number;
  maxTopics?: number;
  maxToolCalls?: number;
  maxOutputTokens?: number;
  endpoint?: string;
  store?: Store;
  now?: () => Date;
  fetchFn?: typeof fetch;
}

export interface OpenAiCostInput {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
}

const topicSchema = z.object({
  canonicalPhrase: z.string().min(1).max(80),
  aliases: z.array(z.string().max(48)).max(6).default([]),
  likelySymbols: z.array(z.string().max(16)).max(5).default([]),
  topicType: z.enum(["person", "animal", "politics", "sports", "entertainment", "internet_phrase", "ai", "crypto", "other"]),
  memeabilityScore: z.number(),
  tokenizationLikelihood: z.number(),
  velocityScore: z.number(),
  noveltyScore: z.number(),
  saturationRisk: z.number(),
  geography: z.string().max(40).optional(),
  evidenceUrls: z.array(z.string().max(240)).max(3).default([]),
  reasonCodes: z.array(z.string().max(40)).max(6).default([]),
  riskFlags: z.array(z.string().max(40)).max(4).default([]),
  launchThesis: z.string().max(180)
});

const rejectedTopicSchema = topicSchema.extend({
  rejectionReason: z.string().max(160)
});

const radarResponseSchema = z.object({
  generatedAt: z.string(),
  activeTopics: z.array(topicSchema),
  rejectedCandidates: z.array(rejectedTopicSchema).default([])
});

export type OpenAiRadarTopic = z.infer<typeof topicSchema>;
export type OpenAiRejectedRadarTopic = z.infer<typeof rejectedTopicSchema>;
type OpenAiRadarResponse = z.infer<typeof radarResponseSchema>;

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
    required: ["generatedAt", "activeTopics", "rejectedCandidates"],
    properties: {
      generatedAt: { type: "string", description: "ISO timestamp for the trend scan." },
      activeTopics: {
        type: "array",
        maxItems: 20,
        items: {
        type: "object",
        additionalProperties: false,
        required: [
          "canonicalPhrase",
          "aliases",
          "likelySymbols",
          "topicType",
          "memeabilityScore",
          "tokenizationLikelihood",
          "velocityScore",
          "noveltyScore",
          "saturationRisk",
          "geography",
          "evidenceUrls",
          "reasonCodes",
          "riskFlags",
          "launchThesis"
        ],
        properties: {
          canonicalPhrase: { type: "string", maxLength: 80 },
          aliases: { type: "array", maxItems: 6, items: { type: "string", maxLength: 48 } },
          likelySymbols: { type: "array", maxItems: 5, items: { type: "string", maxLength: 16 } },
          topicType: {
            type: "string",
            enum: ["person", "animal", "politics", "sports", "entertainment", "internet_phrase", "ai", "crypto", "other"]
          },
          memeabilityScore: { type: "number" },
          tokenizationLikelihood: { type: "number" },
          velocityScore: { type: "number" },
          noveltyScore: { type: "number" },
          saturationRisk: { type: "number" },
          geography: { type: "string", maxLength: 40 },
          evidenceUrls: { type: "array", maxItems: 3, items: { type: "string", maxLength: 240 } },
          reasonCodes: { type: "array", maxItems: 6, items: { type: "string", maxLength: 40 } },
          riskFlags: { type: "array", maxItems: 4, items: { type: "string", maxLength: 40 } },
          launchThesis: { type: "string", maxLength: 180 }
        }
      }
      },
      rejectedCandidates: {
        type: "array",
        maxItems: 15,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "canonicalPhrase",
            "aliases",
            "likelySymbols",
            "topicType",
            "memeabilityScore",
            "tokenizationLikelihood",
            "velocityScore",
            "noveltyScore",
            "saturationRisk",
            "geography",
            "evidenceUrls",
            "reasonCodes",
            "riskFlags",
            "launchThesis",
            "rejectionReason"
          ],
          properties: {
            canonicalPhrase: { type: "string", maxLength: 80 },
            aliases: { type: "array", maxItems: 6, items: { type: "string", maxLength: 48 } },
            likelySymbols: { type: "array", maxItems: 5, items: { type: "string", maxLength: 16 } },
            topicType: {
              type: "string",
              enum: ["person", "animal", "politics", "sports", "entertainment", "internet_phrase", "ai", "crypto", "other"]
            },
            memeabilityScore: { type: "number" },
            tokenizationLikelihood: { type: "number" },
            velocityScore: { type: "number" },
            noveltyScore: { type: "number" },
            saturationRisk: { type: "number" },
            geography: { type: "string", maxLength: 40 },
            evidenceUrls: { type: "array", maxItems: 3, items: { type: "string", maxLength: 240 } },
            reasonCodes: { type: "array", maxItems: 6, items: { type: "string", maxLength: 40 } },
            riskFlags: { type: "array", maxItems: 4, items: { type: "string", maxLength: 40 } },
            launchThesis: { type: "string", maxLength: 180 },
            rejectionReason: { type: "string", maxLength: 160 }
          }
        }
      }
    }
} as const;

export class OpenAiMemeTrendSource implements TrendSource {
  readonly name = OPENAI_MEME_RADAR_SOURCE;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly refreshMinutes: number;
  private readonly monthlyBudgetUsd: number;
  private readonly dailyBudgetUsd: number;
  private readonly estimatedRefreshCostUsd: number;
  private readonly staleLeaseMs: number;
  private readonly maxTopics: number;
  private readonly maxToolCalls: number;
  private readonly maxOutputTokens: number;
  private readonly endpoint: string;
  private readonly now: () => Date;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: OpenAiMemeTrendSourceOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required for live OpenAI meme trend refresh.");
    }
    this.model = options.model ?? process.env.OPENAI_TREND_MODEL ?? "gpt-5.4-mini";
    this.refreshMinutes = positiveNumberOption(options.refreshMinutes, process.env.OPENAI_TREND_REFRESH_MINUTES, 15);
    this.monthlyBudgetUsd = nonNegativeNumberOption(options.monthlyBudgetUsd, process.env.OPENAI_TREND_MONTHLY_BUDGET_USD, 1000);
    this.dailyBudgetUsd = nonNegativeNumberOption(options.dailyBudgetUsd, process.env.OPENAI_TREND_DAILY_BUDGET_USD, 100);
    this.estimatedRefreshCostUsd = nonNegativeNumberOption(
      options.estimatedRefreshCostUsd,
      process.env.OPENAI_TREND_ESTIMATED_REFRESH_COST_USD,
      0.1
    );
    this.staleLeaseMs = positiveNumberOption(options.staleLeaseMinutes, process.env.OPENAI_TREND_STALE_LEASE_MINUTES, 30) * 60 * 1000;
    this.maxTopics = positiveIntegerOption(options.maxTopics, process.env.OPENAI_TREND_MAX_TOPICS, 20);
    this.maxToolCalls = positiveIntegerOption(options.maxToolCalls, process.env.OPENAI_TREND_MAX_TOOL_CALLS, 2);
    this.maxOutputTokens = positiveIntegerOption(options.maxOutputTokens, process.env.OPENAI_TREND_MAX_OUTPUT_TOKENS, 12000);
    this.endpoint = options.endpoint ?? "https://api.openai.com/v1/responses";
    this.now = options.now ?? (() => new Date());
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async fetchObservations(signal?: AbortSignal): Promise<TrendObservation[]> {
    const startedAt = this.now();
    const window = refreshWindow(startedAt, this.refreshMinutes);
    const baseRunId = `${this.name}:${this.model}:${window.startedAt.toISOString()}`;
    const claim = await this.claimRun({
      id: trendRefreshAttemptId(baseRunId, startedAt),
      source: this.name,
      model: this.model,
      promptVersion: OPENAI_MEME_RADAR_PROMPT_VERSION,
      refreshWindowStartedAt: window.startedAt,
      refreshWindowEndedAt: window.endedAt,
      startedAt,
      status: "running",
      topicsFound: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      webSearchCalls: 0,
      estimatedCostUsd: this.estimatedRefreshCostUsd,
      raw: { baseRunId, reason: "refresh lease claimed before OpenAI request" }
    });

    if (claim.status === "duplicate_success" || claim.status === "already_running") {
      await this.recordRun({
        id: `${baseRunId}:duplicate:${startedAt.toISOString()}:${randomUUID()}`,
        source: this.name,
        model: this.model,
        promptVersion: OPENAI_MEME_RADAR_PROMPT_VERSION,
        refreshWindowStartedAt: window.startedAt,
        refreshWindowEndedAt: window.endedAt,
        startedAt,
        completedAt: this.now(),
        status: "skipped_duplicate",
        topicsFound: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        webSearchCalls: 0,
        estimatedCostUsd: 0,
        raw: { reason: claim.status === "duplicate_success" ? "successful refresh already exists for this source/model/window" : "refresh already running for this source/model/window" }
      });
      return [];
    }

    if (claim.status === "budget_exceeded") {
      await this.recordRun({
        id: `${baseRunId}:skipped_budget:${startedAt.toISOString()}:${randomUUID()}`,
        source: this.name,
        model: this.model,
        promptVersion: OPENAI_MEME_RADAR_PROMPT_VERSION,
        refreshWindowStartedAt: window.startedAt,
        refreshWindowEndedAt: window.endedAt,
        startedAt,
        completedAt: this.now(),
        status: "skipped_budget",
        topicsFound: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        webSearchCalls: 0,
        estimatedCostUsd: 0,
        raw: {
          daySpendUsd: round(claim.daySpendUsd),
          monthSpendUsd: round(claim.monthSpendUsd),
          estimatedRefreshCostUsd: this.estimatedRefreshCostUsd,
          dailyBudgetUsd: this.dailyBudgetUsd,
          monthlyBudgetUsd: this.monthlyBudgetUsd
        }
      });
      return [];
    }

    const runId = claim.run.id;

    let responsePayload: OpenAiResponsePayload | undefined;
    try {
      const response = await this.fetchFn(this.endpoint, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(this.requestBody(startedAt))
      });
      const raw = (await response.json()) as OpenAiResponsePayload;
      responsePayload = raw;
      if (!response.ok) throw new Error(openAiErrorMessage(raw, response.status));

      const parsed = parseRadarResponse(raw);
      const usage = usageFromResponse(raw);
      const webSearchCalls = countWebSearchCalls(raw);
      const estimatedCostUsd = estimateOpenAiTrendCost({ model: this.model, ...usage, webSearchCalls });
      const reviewedTopics = parsed.activeTopics.map(reviewOpenAiTopicQuality);
      const acceptedTopics = reviewedTopics.filter((review) => review.accepted).map((review) => review.topic).slice(0, this.maxTopics);
      const applicationRejectedCandidates = reviewedTopics
        .filter((review) => !review.accepted)
        .map((review) => rejectedCandidateRecord(review.topic, review.reasons));
      const observations = acceptedTopics.map((topic) =>
        topicToObservation(topic, {
          model: this.model,
          responseId: raw.id,
          promptVersion: OPENAI_MEME_RADAR_PROMPT_VERSION,
          runId,
          observedAt: parseGeneratedAt(parsed.generatedAt, startedAt),
          refreshWindowStartedAt: window.startedAt,
          refreshWindowEndedAt: window.endedAt
        })
      );

      await this.recordRun({
        id: runId,
        source: this.name,
        model: this.model,
        promptVersion: OPENAI_MEME_RADAR_PROMPT_VERSION,
        refreshWindowStartedAt: window.startedAt,
        refreshWindowEndedAt: window.endedAt,
        startedAt,
        completedAt: this.now(),
        status: "success",
        topicsFound: observations.length,
        ...usage,
        webSearchCalls,
        estimatedCostUsd,
        responseId: raw.id,
        raw: {
          response: raw as unknown as JsonValue,
          sourceUrls: extractSourceUrls(raw).slice(0, 50),
          modelActiveTopicCount: parsed.activeTopics.length,
          acceptedTopicCount: acceptedTopics.length,
          modelRejectedCandidateCount: parsed.rejectedCandidates.length,
          rejectedCandidates: parsed.rejectedCandidates.map((topic) =>
            rejectedCandidateRecord(topic, ["model_rejected", normalizeReason(topic.rejectionReason)])
          ),
          applicationRejectedCandidates,
          maxTopics: this.maxTopics
        }
      });

      return observations;
    } catch (error) {
      const usage = responsePayload
        ? usageFromResponse(responsePayload)
        : { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
      const webSearchCalls = responsePayload ? countWebSearchCalls(responsePayload) : 0;
      const estimatedCostUsd = responsePayload ? estimateOpenAiTrendCost({ model: this.model, ...usage, webSearchCalls }) : this.estimatedRefreshCostUsd;
      await this.recordRun({
        id: runId,
        source: this.name,
        model: this.model,
        promptVersion: OPENAI_MEME_RADAR_PROMPT_VERSION,
        refreshWindowStartedAt: window.startedAt,
        refreshWindowEndedAt: window.endedAt,
        startedAt,
        completedAt: this.now(),
        status: "error",
        topicsFound: 0,
        ...usage,
        webSearchCalls,
        estimatedCostUsd,
        errorText: error instanceof Error ? error.message : String(error),
        raw: responsePayload ? (responsePayload as unknown as JsonValue) : {}
      });
      throw error;
    }
  }

  private requestBody(now: Date): JsonObject {
    return {
      model: this.model,
      reasoning: { effort: "low" },
      max_output_tokens: this.maxOutputTokens,
      max_tool_calls: this.maxToolCalls,
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      text: {
        format: {
          type: "json_schema",
          name: "meme_trend_radar",
          strict: true,
          schema: responseJsonSchema as unknown as JsonObject
        }
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: systemPrompt()
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userPrompt(now, this.maxTopics)
            }
          ]
        }
      ]
    };
  }

  private async recordRun(run: TrendRefreshRun): Promise<void> {
    await this.options.store?.insertTrendRefreshRun(run);
  }

  private async claimRun(run: TrendRefreshRun): Promise<TrendRefreshClaimResult> {
    if (!this.options.store) {
      if (this.estimatedRefreshCostUsd > this.dailyBudgetUsd || this.estimatedRefreshCostUsd > this.monthlyBudgetUsd) {
        return { status: "budget_exceeded", daySpendUsd: 0, monthSpendUsd: 0 };
      }
      return { status: "claimed", run, daySpendUsd: 0, monthSpendUsd: 0 };
    }
    return this.options.store.claimTrendRefreshRun(run, {
      now: run.startedAt,
      estimatedRefreshCostUsd: this.estimatedRefreshCostUsd,
      dailyBudgetUsd: this.dailyBudgetUsd,
      monthlyBudgetUsd: this.monthlyBudgetUsd,
      staleAfterMs: this.staleLeaseMs
    });
  }
}

export function estimateOpenAiTrendCost(input: OpenAiCostInput): number {
  const pricing = pricingForModel(input.model);
  const billableInputTokens = Math.max(0, input.inputTokens - input.cachedInputTokens);
  const uncachedInput = (billableInputTokens / 1_000_000) * pricing.inputPerMillion;
  const cachedInput = (input.cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillion;
  const output = (input.outputTokens / 1_000_000) * pricing.outputPerMillion;
  const web = input.webSearchCalls * 0.01;
  return round(uncachedInput + cachedInput + output + web);
}

export function topicToObservation(
  topic: OpenAiRadarTopic,
  context: {
    model: string;
    responseId?: string;
    promptVersion: string;
    runId: string;
    observedAt: Date;
    refreshWindowStartedAt: Date;
    refreshWindowEndedAt: Date;
  }
): TrendObservation {
  const calibratedTopic = calibrateOpenAiRadarTopic(topic);
  const canonicalPhrase = normalizePhrase(calibratedTopic.canonicalPhrase);
  const scoreWeight = clamp(
    (clamp(calibratedTopic.memeabilityScore) +
      clamp(calibratedTopic.tokenizationLikelihood) +
      clamp(calibratedTopic.velocityScore) +
      clamp(calibratedTopic.noveltyScore)) /
      4 -
      clamp(calibratedTopic.saturationRisk) * 0.2
  );
  return {
    id: `${OPENAI_MEME_RADAR_SOURCE}:${context.refreshWindowStartedAt.toISOString()}:${slugify(canonicalPhrase)}`,
    source: OPENAI_MEME_RADAR_SOURCE,
    phrase: canonicalPhrase,
    observedAt: context.observedAt,
    url: calibratedTopic.evidenceUrls[0],
    title: calibratedTopic.canonicalPhrase,
    summary: calibratedTopic.launchThesis,
    weight: round(Math.max(0.1, scoreWeight)),
    geo: calibratedTopic.geography || undefined,
    raw: {
      openAiMemeTopic: {
        ...calibratedTopic,
        canonicalPhrase,
        memeabilityScore: clamp(calibratedTopic.memeabilityScore),
        tokenizationLikelihood: clamp(calibratedTopic.tokenizationLikelihood),
        velocityScore: clamp(calibratedTopic.velocityScore),
        noveltyScore: clamp(calibratedTopic.noveltyScore),
        saturationRisk: clamp(calibratedTopic.saturationRisk),
        sourceCoverage: distinctEvidenceDomains(calibratedTopic.evidenceUrls).length
      },
      model: context.model,
      responseId: context.responseId,
      promptVersion: context.promptVersion,
      runId: context.runId,
      refreshWindowStartedAt: context.refreshWindowStartedAt.toISOString(),
      refreshWindowEndedAt: context.refreshWindowEndedAt.toISOString()
    } as JsonValue
  };
}

interface TopicQualityReview {
  accepted: boolean;
  topic: OpenAiRadarTopic;
  reasons: string[];
}

const BLOCKING_RISK_FLAGS = new Set([
  "generic_name",
  "promo_language",
  "stale_evidence",
  "stale_format",
  "weak_token_name"
]);

const LOW_CONFIDENCE_TOPIC_TYPES = new Set<TrendTopicType>(["crypto", "other"]);

export function reviewOpenAiTopicQuality(topic: OpenAiRadarTopic): TopicQualityReview {
  const calibratedTopic = calibrateOpenAiRadarTopic(topic);
  const evidenceDomainCount = distinctEvidenceDomains(calibratedTopic.evidenceUrls).length;
  const riskFlags = calibratedTopic.riskFlags.map(normalizeReason);
  const blockingFlags = riskFlags.filter((flag) => BLOCKING_RISK_FLAGS.has(flag));
  const reasons: string[] = [];

  if (evidenceDomainCount < 2) reasons.push("insufficient_independent_sources");
  if (blockingFlags.length && !hasStrongCurrentEvidence(calibratedTopic, evidenceDomainCount)) {
    reasons.push(...blockingFlags.map((flag) => `blocking_${flag}`));
  }
  if (calibratedTopic.memeabilityScore < 0.7) reasons.push("low_memeability");
  if (calibratedTopic.tokenizationLikelihood < 0.6) reasons.push("low_tokenization_likelihood");
  if (calibratedTopic.velocityScore < 0.55) reasons.push("low_velocity");
  if (calibratedTopic.saturationRisk >= 0.85 && calibratedTopic.noveltyScore < 0.65) reasons.push("saturated_without_novelty");
  if (isWeakStandaloneTopic(calibratedTopic) && !hasStrongCurrentEvidence(calibratedTopic, evidenceDomainCount)) {
    reasons.push("weak_standalone_topic");
  }

  return {
    accepted: reasons.length === 0,
    topic: calibratedTopic,
    reasons: [...new Set(reasons)]
  };
}

export function calibrateOpenAiRadarTopic(topic: OpenAiRadarTopic): OpenAiRadarTopic {
  const evidenceDomainCount = distinctEvidenceDomains(topic.evidenceUrls).length;
  const riskFlags = topic.riskFlags.map(normalizeReason);
  const hasBlockingRisk = riskFlags.some((flag) => BLOCKING_RISK_FLAGS.has(flag));
  const hasStrongEvidence = hasStrongCurrentEvidence(topic, evidenceDomainCount);
  const singleSourceCap = evidenceDomainCount < 2 ? 0.65 : 1;
  const blockingCap = hasBlockingRisk && !hasStrongEvidence ? 0.64 : 1;
  return {
    ...topic,
    canonicalPhrase: normalizePhrase(topic.canonicalPhrase),
    memeabilityScore: round(Math.min(clamp(topic.memeabilityScore), singleSourceCap, blockingCap)),
    tokenizationLikelihood: round(Math.min(clamp(topic.tokenizationLikelihood), blockingCap)),
    velocityScore: round(Math.min(clamp(topic.velocityScore), blockingCap)),
    noveltyScore: round(Math.min(clamp(topic.noveltyScore), blockingCap)),
    saturationRisk: clamp(topic.saturationRisk),
    riskFlags
  };
}

function hasStrongCurrentEvidence(topic: OpenAiRadarTopic, evidenceDomainCount: number): boolean {
  return (
    evidenceDomainCount >= 3 &&
    clamp(topic.memeabilityScore) >= 0.85 &&
    clamp(topic.tokenizationLikelihood) >= 0.75 &&
    clamp(topic.velocityScore) >= 0.8
  );
}

function isWeakStandaloneTopic(topic: OpenAiRadarTopic): boolean {
  const tokens = normalizePhrase(topic.canonicalPhrase).split(/\s+/).filter(Boolean);
  if (tokens.length > 2) return false;
  if (!LOW_CONFIDENCE_TOPIC_TYPES.has(topic.topicType)) return false;
  return !topic.reasonCodes.map(normalizeReason).some((reason) => reason === "viral_animal" || reason === "public_figure_timing" || reason === "ai_agent_meta");
}

function rejectedCandidateRecord(topic: OpenAiRadarTopic | OpenAiRejectedRadarTopic, reasons: string[]): JsonObject {
  const calibratedTopic = calibrateOpenAiRadarTopic(topic);
  return {
    canonicalPhrase: normalizePhrase(calibratedTopic.canonicalPhrase),
    topicType: calibratedTopic.topicType,
    memeabilityScore: calibratedTopic.memeabilityScore,
    tokenizationLikelihood: calibratedTopic.tokenizationLikelihood,
    velocityScore: calibratedTopic.velocityScore,
    noveltyScore: calibratedTopic.noveltyScore,
    saturationRisk: calibratedTopic.saturationRisk,
    sourceCoverage: distinctEvidenceDomains(calibratedTopic.evidenceUrls).length,
    evidenceUrls: calibratedTopic.evidenceUrls,
    reasonCodes: calibratedTopic.reasonCodes.map(normalizeReason),
    riskFlags: calibratedTopic.riskFlags.map(normalizeReason),
    rejectionReasons: [...new Set(reasons.map(normalizeReason).filter(Boolean))]
  };
}

function systemPrompt(): string {
  return [
    "You are a crypto cultural trend analyst for a Solana new-launch paper trader.",
    "Identify current events and internet topics that are likely to be tokenized by Solana memecoin launch markets in the next 1 to 6 hours.",
    "Do not return generic news unless it has memecoin shape: short tickerability, remixable visuals, public attention, absurdity, emotional charge, AI-agent novelty, political or celebrity timing, or launchpad-native resonance.",
    "Use live web evidence. Active topics require at least two independent evidence domains; a single X thread or single-domain loop is not enough.",
    "Prefer US and global English-language internet culture, but include global stories with clear meme transmission.",
    "Avoid financial advice. Return only the requested JSON schema."
  ].join(" ");
}

function userPrompt(now: Date, maxTopics: number): string {
  return [
    `Current timestamp: ${now.toISOString()}.`,
    `Return up to ${maxTopics} activeTopics, plus rejectedCandidates for plausible but weak ideas you considered. Rank activeTopics by likelihood that a new Solana launch token will map to the topic soon.`,
    "Only put a topic in activeTopics when it has at least 2 independent evidence domains and a clear answer to: why would a Solana launcher create this token in the next 1 to 6 hours?",
    "Put single-source ideas, single-X-thread ideas, generic phrases, weak token names, promo language, stale evidence, and saturated copycat frames in rejectedCandidates.",
    "Keep the JSON compact: launchThesis <= 180 characters, evidenceUrls <= 3, aliases <= 6, likelySymbols <= 5, reasonCodes <= 6, riskFlags <= 4, rejectionReason <= 160.",
    "Calibrate scores. Do not set every score to 1.0. Only the top 1 to 3 genuinely exceptional topics may exceed 0.90. Old/background memes need fresh evidence from the last 24 to 72 hours to get high velocity or novelty.",
    "If source coverage is below 2, cap memeabilityScore at 0.65 and put the item in rejectedCandidates.",
    "Use saturationRisk as a real penalty signal: saturated animal categories, stale formats, copycat swarms, and generic labels should have lower tokenizationLikelihood, velocityScore, and noveltyScore.",
    buildCaseStudyPromptSummary(),
    "Reject or heavily penalize: stale clones, tragedy exploitation, generic market/news headlines, forced acronyms, saturated narratives, insider-heavy celebrity/political launches, copycats without fresh public evidence, and terms that merely sound tokenizable.",
    "Use riskFlags for stale_evidence, generic_name, weak_token_name, promo_language, saturated_clone, platform_dependent, tragedy_risk, political_risk, copycat_saturation, or fast_decay when applicable.",
    "Reason codes should be compact snake_case labels such as tickerable, remixable_visual, viral_animal, public_figure_timing, ai_agent_meta, social_phrase, launchpad_meta, community_takeover, exchange_reflexivity, absurd_mascot."
  ].join("\n\n");
}

function parseRadarResponse(payload: OpenAiResponsePayload): OpenAiRadarResponse {
  const text = extractOutputText(payload);
  if (!text) throw new Error("OpenAI response did not include output text.");
  if (payload.status === "incomplete") {
    throw new Error(`OpenAI response was incomplete before valid JSON was produced: ${payload.incomplete_details?.reason ?? "unknown reason"}.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `OpenAI response was not valid JSON (${message}). This is usually a truncated response; increase OPENAI_TREND_MAX_OUTPUT_TOKENS or lower OPENAI_TREND_MAX_TOPICS. Output length: ${text.length} characters.`
    );
  }
  return radarResponseSchema.parse(normalizeRadarResponseShape(json));
}

function normalizeRadarResponseShape(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (!Array.isArray(value.activeTopics) && Array.isArray(value.topics)) {
    return {
      generatedAt: value.generatedAt,
      activeTopics: value.topics,
      rejectedCandidates: []
    };
  }
  return value;
}

function extractOutputText(payload: OpenAiResponsePayload): string | undefined {
  if (typeof payload.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("").trim() || undefined;
}

function usageFromResponse(payload: OpenAiResponsePayload): {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
} {
  return {
    inputTokens: payload.usage?.input_tokens ?? 0,
    cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0
  };
}

function countWebSearchCalls(payload: OpenAiResponsePayload): number {
  return (payload.output ?? []).filter((item) => typeof item.type === "string" && item.type.includes("web_search_call")).length;
}

function extractSourceUrls(payload: OpenAiResponsePayload): string[] {
  const urls = new Set<string>();
  for (const item of payload.output ?? []) {
    const sources = item.action?.sources;
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      if (typeof source.url === "string") urls.add(source.url);
    }
  }
  return [...urls];
}

function openAiErrorMessage(payload: OpenAiResponsePayload, status: number): string {
  const message = payload.error?.message ?? `OpenAI request failed with HTTP ${status}.`;
  return `OpenAI meme trend refresh failed: ${message}`;
}

function numberOption(value: number | undefined, envValue: string | undefined, fallback: number): number {
  const raw = value ?? (envValue === undefined || envValue === "" ? undefined : Number(envValue));
  return raw === undefined || Number.isNaN(raw) ? fallback : raw;
}

function positiveNumberOption(value: number | undefined, envValue: string | undefined, fallback: number): number {
  const parsed = numberOption(value, envValue, fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumberOption(value: number | undefined, envValue: string | undefined, fallback: number): number {
  const parsed = numberOption(value, envValue, fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveIntegerOption(value: number | undefined, envValue: string | undefined, fallback: number): number {
  return Math.floor(positiveNumberOption(value, envValue, fallback));
}

function parseGeneratedAt(value: string, fallback: Date): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function distinctEvidenceDomains(urls: string[]): string[] {
  return [...new Set(urls.map(evidenceDomain).filter((domain): domain is string => Boolean(domain)))];
}

function evidenceDomain(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return hostname.split(".").slice(-2).join(".");
  } catch {
    return undefined;
  }
}

export function normalizeReason(value: string | undefined): string {
  return normalizePhrase(value ?? "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refreshWindow(now: Date, refreshMinutes: number): { startedAt: Date; endedAt: Date } {
  const windowMs = Math.max(1, refreshMinutes) * 60 * 1000;
  const startedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  return { startedAt, endedAt: new Date(startedAt.getTime() + windowMs) };
}

function trendRefreshAttemptId(baseRunId: string, startedAt: Date): string {
  return `${baseRunId}:attempt:${startedAt.toISOString()}:${randomUUID()}`;
}

function pricingForModel(model: string): { inputPerMillion: number; cachedInputPerMillion: number; outputPerMillion: number } {
  if (model.includes("gpt-5.5")) return { inputPerMillion: 5, cachedInputPerMillion: 0.5, outputPerMillion: 30 };
  if (model.includes("gpt-5.4-mini")) return { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5 };
  if (model.includes("gpt-5.4")) return { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, outputPerMillion: 15 };
  return { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5 };
}

interface OpenAiResponsePayload {
  id?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ text?: string }>;
    action?: { sources?: Array<{ url?: string }> };
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string };
}
