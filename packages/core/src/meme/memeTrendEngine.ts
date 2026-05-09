import type { TrendSource } from "../domain/interfaces.js";
import type { JsonObject, JsonValue, TrendObservation, TrendTopic, TrendTopicType } from "../domain/types.js";
import type { Store } from "../storage/store.js";
import { clamp, round } from "../utils/math.js";
import { contentTokens, generateAliases, normalizePhrase, slugify, tokenize } from "./text.js";

const OPENAI_MEME_RADAR_SOURCE = "openai-meme-radar";

export class MemeTrendEngine {
  constructor(
    private readonly store: Store,
    private readonly sources: TrendSource[]
  ) {}

  async refresh(signal?: AbortSignal): Promise<{ observations: TrendObservation[]; topics: TrendTopic[] }> {
    const sourceObservations = (await Promise.all(this.sources.map((source) => safeFetch(source, signal)))).flat();
    const observations = expandTrendObservations(sourceObservations);
    const topics = buildTrendTopics(observations);
    for (const topic of topics) {
      await this.store.upsertTrendTopic(topic);
      for (const observation of observations.filter((item) => topic.aliases.includes(normalizePhrase(item.phrase)))) {
        await this.store.insertTrendObservation(observation, topic.id);
      }
    }
    return { observations, topics };
  }
}

export function buildTrendTopics(observations: TrendObservation[]): TrendTopic[] {
  const groups = new Map<string, TrendObservation[]>();
  for (const observation of observations) {
    const phrase = normalizePhrase(observation.phrase);
    if (!phrase) continue;
    groups.set(phrase, [...(groups.get(phrase) ?? []), observation]);
  }

  return [...groups.entries()]
    .map(([phrase, items]) => {
      const structuredTopics = items.map(openAiMemeTopicFromObservation).filter((topic): topic is OpenAiMemeTopicRaw => Boolean(topic));
      const structuredAliases = structuredTopics.flatMap((topic) => [
        topic.canonicalPhrase,
        ...(topic.aliases ?? []),
        ...(topic.likelySymbols ?? [])
      ]);
      const aliases = [
        ...new Set(
          [...items.flatMap((item) => [normalizePhrase(item.phrase), ...generateAliases(item.phrase)]), ...structuredAliases]
            .map((alias) => normalizePhrase(alias ?? ""))
            .filter(Boolean)
        )
      ];
      const firstSeen = new Date(Math.min(...items.map((item) => item.observedAt.getTime())));
      const lastSeen = new Date(Math.max(...items.map((item) => item.observedAt.getTime())));
      const sources = new Set(items.map((item) => item.source));
      const evidenceUrls = [
        ...new Set([
          ...items.map((item) => item.url).filter((url): url is string => Boolean(url)),
          ...structuredTopics.flatMap((topic) => topic.evidenceUrls ?? [])
        ])
      ].slice(0, 10);
      const totalWeight = items.reduce((sum, item) => sum + item.weight + Math.log10((item.traffic ?? 0) + 1) / 6, 0);
      const heuristicVelocityScore = round(clamp(totalWeight / 6 + sources.size * 0.08));
      const velocityScore = scoreFromStructuredTopics(structuredTopics, "velocityScore") ?? heuristicVelocityScore;
      const referenceTime = Math.max(...items.map((item) => item.observedAt.getTime()));
      const ageHours = Math.max(1, (referenceTime - firstSeen.getTime()) / (60 * 60 * 1000));
      const heuristicNoveltyScore = round(clamp(1 / Math.sqrt(ageHours / 12)));
      const noveltyScore = scoreFromStructuredTopics(structuredTopics, "noveltyScore") ?? heuristicNoveltyScore;
      const structuredTopicRaw = buildStructuredTopicRaw(phrase, structuredTopics, evidenceUrls);
      return {
        id: `trend:${slugify(phrase)}`,
        canonicalPhrase: phrase,
        aliases,
        topicType: mostCommonTopicType(structuredTopics.map((topic) => topic.topicType).filter(isTrendTopicType)) ?? classifyTopic(phrase),
        sourceCoverage: sources.size,
        velocityScore,
        noveltyScore,
        geo: mostCommon(items.map((item) => item.geo).filter((geo): geo is string => Boolean(geo))),
        firstSeen,
        lastSeen,
        evidenceUrls,
        raw: {
          observations: items.map((item) => ({
            id: item.id,
            source: item.source,
            phrase: item.phrase,
            weight: item.weight,
            traffic: item.traffic,
            url: item.url
          })),
          ...(structuredTopicRaw ? { openAiMemeTopic: structuredTopicRaw } : {})
        } as JsonValue
      } satisfies TrendTopic;
    })
    .sort((a, b) => b.velocityScore - a.velocityScore || b.sourceCoverage - a.sourceCoverage);
}

export function expandTrendObservations(observations: TrendObservation[]): TrendObservation[] {
  const expanded = new Map<string, TrendObservation>();
  for (const observation of observations) {
    const structuredTopic = openAiMemeTopicFromObservation(observation);
    if (structuredTopic) {
      const normalized = normalizePhrase(structuredTopic.canonicalPhrase ?? observation.phrase);
      if (!normalized) continue;
      expanded.set(`${observation.id}:topic:${slugify(normalized)}`, {
        ...observation,
        id: `${observation.id}:topic:${slugify(normalized)}`,
        phrase: normalized,
        title: observation.title ?? structuredTopic.canonicalPhrase ?? observation.phrase,
        raw: observation.raw
      });
      continue;
    }

    const candidates = extractTrendCandidatePhrases(observation);
    for (const candidate of candidates) {
      const normalized = normalizePhrase(candidate);
      if (!normalized) continue;
      const id = `${observation.id}:topic:${slugify(normalized)}`;
      const exact = normalizePhrase(observation.phrase) === normalized;
      expanded.set(id, {
        ...observation,
        id,
        phrase: normalized,
        title: observation.title ?? observation.phrase,
        weight: round(observation.weight * (exact ? 1 : 0.82)),
        raw: {
          originalObservation: {
            id: observation.id,
            source: observation.source,
            phrase: observation.phrase,
            title: observation.title,
            url: observation.url
          },
          candidatePhrase: normalized
        } as JsonValue
      });
    }
  }
  return [...expanded.values()];
}

export function extractTrendCandidatePhrases(observation: TrendObservation): string[] {
  const rawPhrase = observation.title || observation.phrase;
  const normalized = normalizePhrase(rawPhrase);
  if (!normalized || isSpamTrendPhrase(normalized)) return [];
  if (isAtomicTrendPhrase(rawPhrase)) return isUsefulTrendCandidate(normalized) ? [normalized] : [];

  const candidates = new Set<string>();
  addCandidate(candidates, rawPhrase);

  for (const segment of splitHeadline(rawPhrase)) addCandidate(candidates, segment);
  for (const quoted of extractQuotedPhrases(rawPhrase)) addCandidate(candidates, quoted);
  for (const hashtag of extractHashtags(rawPhrase)) addCandidate(candidates, hashtag);
  for (const properNoun of extractProperNounPhrases(rawPhrase)) addCandidate(candidates, properNoun);

  return [...candidates]
    .map((candidate) => normalizePhrase(candidate))
    .filter((candidate) => isUsefulTrendCandidate(candidate))
    .sort((a, b) => trendCandidateRank(b) - trendCandidateRank(a))
    .slice(0, 8);
}

function classifyTopic(phrase: string): TrendTopicType {
  const tokens = new Set(tokenize(phrase));
  const compact = phrase.replace(/\s+/g, "").toLowerCase();
  if (compact.includes("dogwifhat") || compact.includes("wif")) return "internet_phrase";
  if (["trump", "biden", "election", "senate", "president", "congress", "maga"].some((word) => tokens.has(word))) return "politics";
  if (["dog", "cat", "hippo", "squirrel", "peanut", "moo", "deng"].some((word) => tokens.has(word))) return "animal";
  if (["ai", "agent", "terminal", "truth", "chatgpt", "openai", "nvidia"].some((word) => tokens.has(word))) return "ai";
  if (["nba", "nfl", "ufc", "world", "cup", "olympics", "super", "bowl"].some((word) => tokens.has(word))) return "sports";
  if (["movie", "song", "album", "taylor", "kendrick", "drake", "netflix"].some((word) => tokens.has(word))) return "entertainment";
  if (["solana", "bitcoin", "btc", "eth", "crypto", "binance"].some((word) => tokens.has(word))) return "crypto";
  if (["chill", "guy", "hawk", "tuah", "wif", "hat", "goat", "fart"].some((word) => tokens.has(word))) return "internet_phrase";
  return "other";
}

const HARD_NOISE_PATTERNS = [
  /\bprice prediction\b/,
  /\bstock price\b/,
  /\bmarket cap\b/,
  /\bbuy now\b/,
  /\bpromo code\b/,
  /\bcoupon\b/,
  /\bodds\b/,
  /\bbetting\b/
];

const HEADLINE_BREAKERS = [
  "after",
  "amid",
  "as",
  "becomes",
  "before",
  "during",
  "following",
  "gets",
  "goes",
  "hits",
  "over",
  "sparks",
  "surges",
  "trends",
  "when",
  "while",
  "with"
];

const WEAK_TOPIC_TOKENS = new Set([
  "about",
  "best",
  "breaking",
  "daily",
  "explained",
  "guide",
  "latest",
  "live",
  "news",
  "official",
  "recap",
  "report",
  "review",
  "today",
  "update",
  "updates",
  "video",
  "watch"
]);

const MEME_CONTEXT_TOKENS = new Set([
  "ai",
  "agent",
  "animal",
  "cat",
  "chill",
  "dog",
  "fart",
  "goat",
  "guy",
  "hawk",
  "hippo",
  "internet",
  "meme",
  "squirrel",
  "tiktok",
  "terminal",
  "truth",
  "viral",
  "wif"
]);

function splitHeadline(value: string): string[] {
  const punctuationSegments = value.split(/\s*[:;|–—]\s*/).filter(Boolean);
  const breakerPattern = new RegExp(`\\b(?:${HEADLINE_BREAKERS.join("|")})\\b`, "i");
  return punctuationSegments.flatMap((segment) => segment.split(breakerPattern)).filter(Boolean);
}

function isAtomicTrendPhrase(value: string): boolean {
  const normalized = normalizePhrase(value);
  const tokens = tokenize(normalized);
  if (tokens.length === 0 || tokens.length > 5) return false;
  if (/[:;|–—]/.test(value)) return false;
  const breakerPattern = new RegExp(`\\b(?:${HEADLINE_BREAKERS.join("|")})\\b`, "i");
  return !breakerPattern.test(normalized);
}

function extractQuotedPhrases(value: string): string[] {
  return [...value.matchAll(/["“”'‘’]([^"“”'‘’]{2,80})["“”'‘’]/g)].map((match) => match[1]);
}

function extractHashtags(value: string): string[] {
  return [...value.matchAll(/#([a-zA-Z0-9_]{2,40})/g)].map((match) => match[1]);
}

function extractProperNounPhrases(value: string): string[] {
  const chunks: string[] = [];
  const pattern =
    /\b(?:[A-Z][a-z0-9]+|[A-Z]{2,})(?:\s+(?:the|of|and|[A-Z][a-z0-9]+|[A-Z]{2,})){0,5}\b/g;
  for (const match of value.matchAll(pattern)) {
    chunks.push(match[0]);
  }
  return chunks;
}

function addCandidate(candidates: Set<string>, value: string): void {
  const normalized = normalizePhrase(value);
  if (normalized) candidates.add(normalized);
}

function isSpamTrendPhrase(normalized: string): boolean {
  return HARD_NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isUsefulTrendCandidate(candidate: string): boolean {
  if (isSpamTrendPhrase(candidate)) return false;
  const tokens = tokenize(candidate);
  const content = contentTokens(candidate);
  if (tokens.length === 0 || tokens.length > 6) return false;
  if (content.length === 0) return false;
  if (tokens.every((token) => WEAK_TOPIC_TOKENS.has(token))) return false;
  if (tokens.length === 1) {
    const [token] = tokens;
    return token.length >= 4 && !WEAK_TOPIC_TOKENS.has(token);
  }
  return true;
}

function trendCandidateRank(candidate: string): number {
  const tokens = tokenize(candidate);
  const content = contentTokens(candidate);
  const memeContext = tokens.filter((token) => MEME_CONTEXT_TOKENS.has(token)).length;
  const weakPenalty = tokens.filter((token) => WEAK_TOPIC_TOKENS.has(token)).length;
  const lengthScore = tokens.length >= 2 && tokens.length <= 4 ? 2 : 0;
  return content.length * 2 + memeContext * 3 + lengthScore - weakPenalty;
}

interface OpenAiMemeTopicRaw {
  canonicalPhrase?: string;
  aliases?: string[];
  likelySymbols?: string[];
  topicType?: TrendTopicType;
  memeabilityScore?: number;
  tokenizationLikelihood?: number;
  velocityScore?: number;
  noveltyScore?: number;
  saturationRisk?: number;
  evidenceUrls?: string[];
  reasonCodes?: string[];
  riskFlags?: string[];
  launchThesis?: string;
}

function openAiMemeTopicFromObservation(observation: TrendObservation): OpenAiMemeTopicRaw | undefined {
  if (observation.source !== OPENAI_MEME_RADAR_SOURCE) return undefined;
  if (!isJsonObject(observation.raw)) return undefined;
  const topic = observation.raw.openAiMemeTopic;
  if (!isJsonObject(topic)) return undefined;
  return {
    canonicalPhrase: stringValue(topic.canonicalPhrase),
    aliases: stringArray(topic.aliases),
    likelySymbols: stringArray(topic.likelySymbols),
    topicType: topicTypeValue(topic.topicType),
    memeabilityScore: scoreValue(topic.memeabilityScore),
    tokenizationLikelihood: scoreValue(topic.tokenizationLikelihood),
    velocityScore: scoreValue(topic.velocityScore),
    noveltyScore: scoreValue(topic.noveltyScore),
    saturationRisk: scoreValue(topic.saturationRisk),
    evidenceUrls: stringArray(topic.evidenceUrls),
    reasonCodes: stringArray(topic.reasonCodes),
    riskFlags: stringArray(topic.riskFlags),
    launchThesis: stringValue(topic.launchThesis)
  };
}

function buildStructuredTopicRaw(
  phrase: string,
  topics: OpenAiMemeTopicRaw[],
  evidenceUrls: string[]
): JsonObject | undefined {
  if (!topics.length) return undefined;
  const canonicalPhrase = topics.find((topic) => topic.canonicalPhrase)?.canonicalPhrase ?? phrase;
  return compactJsonObject({
    canonicalPhrase,
    aliases: uniqueStrings(topics.flatMap((topic) => topic.aliases ?? [])),
    likelySymbols: uniqueStrings(topics.flatMap((topic) => topic.likelySymbols ?? [])),
    topicType: mostCommonTopicType(topics.map((topic) => topic.topicType).filter(isTrendTopicType)),
    memeabilityScore: scoreFromStructuredTopics(topics, "memeabilityScore"),
    tokenizationLikelihood: scoreFromStructuredTopics(topics, "tokenizationLikelihood"),
    velocityScore: scoreFromStructuredTopics(topics, "velocityScore"),
    noveltyScore: scoreFromStructuredTopics(topics, "noveltyScore"),
    saturationRisk: scoreFromStructuredTopics(topics, "saturationRisk"),
    evidenceUrls,
    reasonCodes: uniqueStrings(topics.flatMap((topic) => topic.reasonCodes ?? [])),
    riskFlags: uniqueStrings(topics.flatMap((topic) => topic.riskFlags ?? [])),
    launchThesis: topics.find((topic) => topic.launchThesis)?.launchThesis
  });
}

function scoreFromStructuredTopics(topics: OpenAiMemeTopicRaw[], key: keyof OpenAiMemeTopicRaw): number | undefined {
  const values = topics.map((topic) => topic[key]).filter((value): value is number => typeof value === "number");
  if (!values.length) return undefined;
  return round(clamp(values.reduce((sum, value) => sum + value, 0) / values.length));
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function scoreValue(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value) : undefined;
}

function stringArray(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function topicTypeValue(value: JsonValue | undefined): TrendTopicType | undefined {
  return typeof value === "string" && isTrendTopicType(value) ? value : undefined;
}

function isTrendTopicType(value: unknown): value is TrendTopicType {
  return (
    value === "person" ||
    value === "animal" ||
    value === "politics" ||
    value === "sports" ||
    value === "entertainment" ||
    value === "internet_phrase" ||
    value === "ai" ||
    value === "crypto" ||
    value === "other"
  );
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function compactJsonObject(values: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as JsonObject;
}

async function safeFetch(source: TrendSource, signal?: AbortSignal): Promise<TrendObservation[]> {
  try {
    return await source.fetchObservations(signal);
  } catch {
    return [];
  }
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function mostCommonTopicType(values: TrendTopicType[]): TrendTopicType | undefined {
  return mostCommon(values) as TrendTopicType | undefined;
}
