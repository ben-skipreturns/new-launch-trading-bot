import type { MemeMatcher } from "../domain/interfaces.js";
import type { JsonValue, TokenMemeMatch, TrendTopic } from "../domain/types.js";
import { clamp, round } from "../utils/math.js";
import { acronym, compactPhrase, consonantSkeleton, contentTokens, isGenericOnly, normalizePhrase, similarity, tokenize } from "./text.js";

export interface TokenMemeMatcherOptions {
  minScore?: number;
}

export class TokenMemeMatcher implements MemeMatcher {
  private readonly minScore: number;

  constructor(options: TokenMemeMatcherOptions = {}) {
    this.minScore = options.minScore ?? 0.7;
  }

  async match(input: Parameters<MemeMatcher["match"]>[0]): Promise<TokenMemeMatch> {
    const candidateText = [
      input.launch.name,
      input.launch.symbol,
      input.launch.uri,
      ...Object.values(input.enrichment?.socialLinks ?? {}),
      ...(input.enrichment?.sentimentKeywords ?? [])
    ]
      .filter(Boolean)
      .join(" ");
    const normalizedCandidate = normalizePhrase(candidateText);
    const candidateSymbol = normalizePhrase(input.launch.symbol ?? "");
    const rejectFlags: string[] = [];
    if (!normalizedCandidate) rejectFlags.push("NO_TOKEN_TEXT");
    if (isGenericOnly(normalizedCandidate)) rejectFlags.push("GENERIC_TOKEN_TEXT");

    const matchableTopics = input.topics.filter(isMatchableTrendTopic);
    if (input.topics.length > 0 && matchableTopics.length === 0) rejectFlags.push("NO_MATCHABLE_TOPICS");

    const scored = matchableTopics
      .map((topic) => scoreTopic(topic, normalizedCandidate, candidateSymbol))
      .sort((a, b) => b.score - a.score)[0];

    const reasons = scored?.reasons ?? [];
    const score = scored ? round(scored.score) : 0;
    if (score < this.minScore) rejectFlags.push("MEME_RELEVANCE_TOO_LOW");

    return {
      mint: input.launch.mint,
      observedAt: input.observedAt,
      memeRelevanceScore: score,
      topicId: scored?.topic.id,
      canonicalPhrase: scored?.topic.canonicalPhrase,
      topicType: scored?.topic.topicType,
      aliases: scored?.topic.aliases ?? [],
      evidenceUrls: scored?.topic.evidenceUrls ?? [],
      reasons,
      rejectFlags,
      raw: {
        candidateText: normalizedCandidate,
        bestTopic: scored
          ? {
              id: scored.topic.id,
              canonicalPhrase: scored.topic.canonicalPhrase,
              matchStrength: scored.matchStrength,
              velocityScore: scored.topic.velocityScore,
              noveltyScore: scored.topic.noveltyScore,
              sourceCoverage: scored.topic.sourceCoverage,
              saturationRisk: saturationRisk(scored.topic)
            }
          : null
      } as JsonValue
    };
  }
}

function scoreTopic(topic: TrendTopic, candidateText: string, candidateSymbol: string): {
  topic: TrendTopic;
  score: number;
  matchStrength: number;
  reasons: string[];
} {
  const candidateCompact = compactPhrase(candidateText);
  const candidateTokens = new Set(tokenize(candidateText));
  const candidateContent = contentTokens(candidateText);
  const reasons: string[] = [];
  let matchStrength = 0;

  for (const alias of topic.aliases) {
    const aliasNormalized = normalizePhrase(alias);
    const aliasCompact = compactPhrase(alias);
    const aliasTokens = tokenize(aliasNormalized);
    const aliasContent = contentTokens(aliasNormalized);
    const aliasAcronym = acronym(aliasNormalized);
    const aliasSkeleton = consonantSkeleton(aliasNormalized);
    const symbolSkeleton = consonantSkeleton(candidateSymbol);

    if (aliasNormalized.includes(" ") && candidateText.includes(aliasNormalized)) {
      matchStrength = Math.max(matchStrength, 0.96);
      reasons.push("EXACT_PHRASE_MATCH");
    }
    if (
      aliasCompact.length >= 4 &&
      ((aliasNormalized.includes(" ") && candidateCompact.includes(aliasCompact)) ||
        (aliasCompact.length >= 8 && candidateCompact.includes(aliasCompact)) ||
        candidateSymbol === aliasCompact)
    ) {
      matchStrength = Math.max(matchStrength, 0.92);
      reasons.push("COMPACT_PHRASE_MATCH");
    }
    if (candidateSymbol && aliasNormalized.length >= 3 && candidateSymbol === aliasNormalized) {
      matchStrength = Math.max(matchStrength, 0.86);
      reasons.push("SYMBOL_ALIAS_MATCH");
    }
    if (aliasTokens.length > 0 && aliasTokens.every((token) => candidateTokens.has(token))) {
      matchStrength = Math.max(matchStrength, aliasTokens.length >= 2 ? 0.86 : 0.55);
      reasons.push("TOKEN_SET_MATCH");
    }
    if (candidateSymbol && aliasAcronym.length >= 2 && candidateSymbol === aliasAcronym) {
      matchStrength = Math.max(matchStrength, 0.84);
      reasons.push("ACRONYM_SYMBOL_MATCH");
    }
    if (candidateSymbol && aliasSkeleton.length >= 3 && symbolSkeleton === aliasSkeleton) {
      matchStrength = Math.max(matchStrength, 0.88);
      reasons.push("CONSONANT_SYMBOL_MATCH");
    }
    const fuzzy = Math.max(similarity(aliasNormalized, candidateText), similarity(aliasCompact, candidateCompact));
    if (fuzzy >= 0.84) {
      matchStrength = Math.max(matchStrength, 0.74);
      reasons.push("FUZZY_MATCH");
    }
    if (aliasContent.length > 0 && candidateContent.length > 0 && aliasContent.every((token) => candidateContent.includes(token))) {
      matchStrength = Math.max(matchStrength, 0.78);
      reasons.push("CONTENT_WORD_MATCH");
    }
  }

  const sourceBoost = clamp(topic.sourceCoverage / 3) * 0.08;
  const velocityBoost = topic.velocityScore * 0.22;
  const noveltyBoost = topic.noveltyScore * 0.08;
  const topicSaturationRisk = saturationRisk(topic);
  const openAiTopic = hasOpenAiMemeTopic(topic);
  const saturationPenalty = 1 - topicSaturationRisk * 0.32;
  const evidencePenalty = openAiTopic && topic.sourceCoverage < 2 ? 0.9 : 1;
  if (topicSaturationRisk >= 0.75) reasons.push("HIGH_SATURATION_TOPIC");
  if (openAiTopic && topic.sourceCoverage < 2) reasons.push("SINGLE_SOURCE_TOPIC");
  const score = clamp(matchStrength * (0.62 + sourceBoost + velocityBoost + noveltyBoost) * saturationPenalty * evidencePenalty);
  return {
    topic,
    score,
    matchStrength,
    reasons: [...new Set(reasons)]
  };
}

function saturationRisk(topic: TrendTopic): number {
  const openAiTopic = openAiMemeTopic(topic);
  if (!isRecord(openAiTopic)) return 0;
  const value = openAiTopic.saturationRisk;
  return typeof value === "number" && Number.isFinite(value) ? clamp(value) : 0;
}

function isMatchableTrendTopic(topic: TrendTopic): boolean {
  const openAiTopic = openAiMemeTopic(topic);
  if (!isRecord(openAiTopic)) return true;
  const riskFlags = stringArray(openAiTopic.riskFlags).map(normalizeReason);
  const hasBlockingRisk = riskFlags.some((flag) =>
    flag === "generic_name" || flag === "promo_language" || flag === "stale_evidence" || flag === "stale_format" || flag === "weak_token_name"
  );
  if (topic.sourceCoverage < 2) return false;
  if (hasBlockingRisk && !hasStrongCurrentEvidence(topic, openAiTopic)) return false;
  if (numberValue(openAiTopic.memeabilityScore) < 0.7) return false;
  if (numberValue(openAiTopic.tokenizationLikelihood) < 0.6) return false;
  if (topic.velocityScore < 0.55) return false;
  if (saturationRisk(topic) >= 0.85 && topic.noveltyScore < 0.65) return false;
  return true;
}

function hasStrongCurrentEvidence(topic: TrendTopic, openAiTopic: Record<string, unknown>): boolean {
  return (
    topic.sourceCoverage >= 3 &&
    numberValue(openAiTopic.memeabilityScore) >= 0.85 &&
    numberValue(openAiTopic.tokenizationLikelihood) >= 0.75 &&
    topic.velocityScore >= 0.8
  );
}

function hasOpenAiMemeTopic(topic: TrendTopic): boolean {
  return Boolean(openAiMemeTopic(topic));
}

function openAiMemeTopic(topic: TrendTopic): unknown {
  if (!isRecord(topic.raw)) return undefined;
  return topic.raw.openAiMemeTopic;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value) : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function normalizeReason(value: string): string {
  return normalizePhrase(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
