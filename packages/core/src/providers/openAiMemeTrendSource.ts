import { z } from "zod";
import type { TrendSource } from "../domain/interfaces.js";
import type { JsonObject, JsonValue, TrendObservation, TrendRefreshRun, TrendTopicType } from "../domain/types.js";
import { buildCaseStudyPromptSummary } from "../meme/caseStudies.js";
import { normalizePhrase, slugify } from "../meme/text.js";
import type { Store } from "../storage/store.js";
import { clamp, round } from "../utils/math.js";

export const OPENAI_MEME_RADAR_SOURCE = "openai-meme-radar";
export const OPENAI_MEME_RADAR_PROMPT_VERSION = "openai-meme-radar-v1";

export interface OpenAiMemeTrendSourceOptions {
  apiKey?: string;
  model?: string;
  refreshMinutes?: number;
  monthlyBudgetUsd?: number;
  dailyBudgetUsd?: number;
  estimatedRefreshCostUsd?: number;
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

const radarResponseSchema = z.object({
  generatedAt: z.string(),
  topics: z.array(topicSchema)
});

export type OpenAiRadarTopic = z.infer<typeof topicSchema>;
type OpenAiRadarResponse = z.infer<typeof radarResponseSchema>;

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["generatedAt", "topics"],
  properties: {
    generatedAt: { type: "string", description: "ISO timestamp for the trend scan." },
    topics: {
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
    this.refreshMinutes = numberOption(options.refreshMinutes, process.env.OPENAI_TREND_REFRESH_MINUTES, 15);
    this.monthlyBudgetUsd = numberOption(options.monthlyBudgetUsd, process.env.OPENAI_TREND_MONTHLY_BUDGET_USD, 1000);
    this.dailyBudgetUsd = numberOption(options.dailyBudgetUsd, process.env.OPENAI_TREND_DAILY_BUDGET_USD, 100);
    this.estimatedRefreshCostUsd = numberOption(
      options.estimatedRefreshCostUsd,
      process.env.OPENAI_TREND_ESTIMATED_REFRESH_COST_USD,
      0.1
    );
    this.maxTopics = numberOption(options.maxTopics, process.env.OPENAI_TREND_MAX_TOPICS, 20);
    this.maxToolCalls = numberOption(options.maxToolCalls, process.env.OPENAI_TREND_MAX_TOOL_CALLS, 2);
    this.maxOutputTokens = numberOption(options.maxOutputTokens, process.env.OPENAI_TREND_MAX_OUTPUT_TOKENS, 12000);
    this.endpoint = options.endpoint ?? "https://api.openai.com/v1/responses";
    this.now = options.now ?? (() => new Date());
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async fetchObservations(signal?: AbortSignal): Promise<TrendObservation[]> {
    const startedAt = this.now();
    const window = refreshWindow(startedAt, this.refreshMinutes);
    const runId = `${this.name}:${this.model}:${window.startedAt.toISOString()}`;
    const duplicate = await this.hasSuccessfulRunForWindow(window.startedAt, window.endedAt);
    if (duplicate) {
      await this.recordRun({
        id: `${runId}:duplicate:${startedAt.toISOString()}`,
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
        raw: { reason: "successful refresh already exists for this source/model/window" }
      });
      return [];
    }

    const budget = await this.currentSpend(startedAt);
    if (
      budget.day + this.estimatedRefreshCostUsd > this.dailyBudgetUsd ||
      budget.month + this.estimatedRefreshCostUsd > this.monthlyBudgetUsd
    ) {
      await this.recordRun({
        id: runId,
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
          daySpendUsd: round(budget.day),
          monthSpendUsd: round(budget.month),
          estimatedRefreshCostUsd: this.estimatedRefreshCostUsd,
          dailyBudgetUsd: this.dailyBudgetUsd,
          monthlyBudgetUsd: this.monthlyBudgetUsd
        }
      });
      return [];
    }

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
      const observations = parsed.topics.slice(0, this.maxTopics).map((topic) =>
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
          outputTopicCount: parsed.topics.length,
          maxTopics: this.maxTopics
        }
      });

      return observations;
    } catch (error) {
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
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        webSearchCalls: 0,
        estimatedCostUsd: 0,
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

  private async currentSpend(now: Date): Promise<{ day: number; month: number }> {
    if (!this.options.store) return { day: 0, month: 0 };
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [dayRuns, monthRuns] = await Promise.all([
      this.options.store.listTrendRefreshRuns(dayStart, now),
      this.options.store.listTrendRefreshRuns(monthStart, now)
    ]);
    return {
      day: sumBillableRuns(dayRuns),
      month: sumBillableRuns(monthRuns)
    };
  }

  private async hasSuccessfulRunForWindow(startedAt: Date, endedAt: Date): Promise<boolean> {
    if (!this.options.store) return false;
    const runs = await this.options.store.listTrendRefreshRuns(startedAt, endedAt);
    return runs.some(
      (run) =>
        run.source === this.name &&
        run.model === this.model &&
        run.promptVersion === OPENAI_MEME_RADAR_PROMPT_VERSION &&
        run.refreshWindowStartedAt.getTime() === startedAt.getTime() &&
        run.status === "success"
    );
  }

  private async recordRun(run: TrendRefreshRun): Promise<void> {
    await this.options.store?.insertTrendRefreshRun(run);
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
  const canonicalPhrase = normalizePhrase(topic.canonicalPhrase);
  const scoreWeight = clamp(
    (clamp(topic.memeabilityScore) + clamp(topic.tokenizationLikelihood) + clamp(topic.velocityScore) + clamp(topic.noveltyScore)) /
      4 -
      clamp(topic.saturationRisk) * 0.2
  );
  return {
    id: `${OPENAI_MEME_RADAR_SOURCE}:${context.refreshWindowStartedAt.toISOString()}:${slugify(canonicalPhrase)}`,
    source: OPENAI_MEME_RADAR_SOURCE,
    phrase: canonicalPhrase,
    observedAt: context.observedAt,
    url: topic.evidenceUrls[0],
    title: topic.canonicalPhrase,
    summary: topic.launchThesis,
    weight: round(Math.max(0.1, scoreWeight)),
    geo: topic.geography || undefined,
    raw: {
      openAiMemeTopic: {
        ...topic,
        canonicalPhrase,
        memeabilityScore: clamp(topic.memeabilityScore),
        tokenizationLikelihood: clamp(topic.tokenizationLikelihood),
        velocityScore: clamp(topic.velocityScore),
        noveltyScore: clamp(topic.noveltyScore),
        saturationRisk: clamp(topic.saturationRisk)
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

function systemPrompt(): string {
  return [
    "You are a crypto cultural trend analyst for a Solana new-launch paper trader.",
    "Identify current events and internet topics that are likely to be tokenized by Solana memecoin launch markets in the next 1 to 6 hours.",
    "Do not return generic news unless it has memecoin shape: short tickerability, remixable visuals, public attention, absurdity, emotional charge, AI-agent novelty, political or celebrity timing, or launchpad-native resonance.",
    "Use live web evidence. Prefer US and global English-language internet culture, but include global stories with clear meme transmission.",
    "Avoid financial advice. Return only the requested JSON schema."
  ].join(" ");
}

function userPrompt(now: Date, maxTopics: number): string {
  return [
    `Current timestamp: ${now.toISOString()}.`,
    `Return up to ${maxTopics} topics. Rank by likelihood that a new Solana launch token will map to the topic soon.`,
    "Keep the JSON compact: launchThesis <= 180 characters, evidenceUrls <= 3, aliases <= 6, likelySymbols <= 5, reasonCodes <= 6, riskFlags <= 4.",
    buildCaseStudyPromptSummary(),
    "Reject or heavily penalize: stale clones, tragedy exploitation, generic market/news headlines, forced acronyms, saturated narratives, insider-heavy celebrity/political launches, and copycats without fresh public evidence.",
    "Reason codes should be compact snake_case labels such as tickerable, remixable_visual, viral_animal, public_figure_timing, ai_agent_meta, social_phrase, launchpad_meta, community_takeover, exchange_reflexivity, saturated_clone, tragedy_risk, weak_token_name."
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
  return radarResponseSchema.parse(json);
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

function parseGeneratedAt(value: string, fallback: Date): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function refreshWindow(now: Date, refreshMinutes: number): { startedAt: Date; endedAt: Date } {
  const windowMs = Math.max(1, refreshMinutes) * 60 * 1000;
  const startedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  return { startedAt, endedAt: new Date(startedAt.getTime() + windowMs) };
}

function sumBillableRuns(runs: TrendRefreshRun[]): number {
  return runs
    .filter((run) => run.status === "success")
    .reduce((sum, run) => sum + run.estimatedCostUsd, 0);
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
