import type { TrendSource } from "../domain/interfaces.js";
import type { JsonValue, TrendObservation, TrendTopic, TrendTopicType } from "../domain/types.js";
import type { Store } from "../storage/store.js";
import { clamp, round } from "../utils/math.js";
import { generateAliases, normalizePhrase, slugify, tokenize } from "./text.js";

export class MemeTrendEngine {
  constructor(
    private readonly store: Store,
    private readonly sources: TrendSource[]
  ) {}

  async refresh(signal?: AbortSignal): Promise<{ observations: TrendObservation[]; topics: TrendTopic[] }> {
    const observations = (await Promise.all(this.sources.map((source) => safeFetch(source, signal)))).flat();
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
      const aliases = [...new Set(items.flatMap((item) => [normalizePhrase(item.phrase), ...generateAliases(item.phrase)]))];
      const firstSeen = new Date(Math.min(...items.map((item) => item.observedAt.getTime())));
      const lastSeen = new Date(Math.max(...items.map((item) => item.observedAt.getTime())));
      const sources = new Set(items.map((item) => item.source));
      const evidenceUrls = [...new Set(items.map((item) => item.url).filter((url): url is string => Boolean(url)))].slice(0, 10);
      const totalWeight = items.reduce((sum, item) => sum + item.weight + Math.log10((item.traffic ?? 0) + 1) / 6, 0);
      const velocityScore = round(clamp(totalWeight / 6 + sources.size * 0.08));
      const referenceTime = Math.max(...items.map((item) => item.observedAt.getTime()));
      const ageHours = Math.max(1, (referenceTime - firstSeen.getTime()) / (60 * 60 * 1000));
      const noveltyScore = round(clamp(1 / Math.sqrt(ageHours / 12)));
      return {
        id: `trend:${slugify(phrase)}`,
        canonicalPhrase: phrase,
        aliases,
        topicType: classifyTopic(phrase),
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
          }))
        } as JsonValue
      } satisfies TrendTopic;
    })
    .sort((a, b) => b.velocityScore - a.velocityScore || b.sourceCoverage - a.sourceCoverage);
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
