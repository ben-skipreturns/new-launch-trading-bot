import type { MemeMatcher } from "../domain/interfaces.js";
import type { JsonObject, JsonValue, TokenMemeMatch, TrendTopic } from "../domain/types.js";
import { clamp, round } from "../utils/math.js";
import {
  acronym,
  compactPhrase,
  consonantSkeleton,
  contentTokens,
  genericTokenWordCount,
  isGenericOnly,
  isGenericTokenWord,
  normalizePhrase,
  similarity,
  tokenize
} from "./text.js";

export interface TokenMemeMatcherOptions {
  minScore?: number;
  activeTopicWindowMs?: number | null;
  requireTopicFirstSeenBeforeObservedAt?: boolean;
}

export class TokenMemeMatcher implements MemeMatcher {
  private readonly minScore: number;
  private readonly activeTopicWindowMs: number | null;
  private readonly requireTopicFirstSeenBeforeObservedAt: boolean;

  constructor(options: TokenMemeMatcherOptions = {}) {
    this.minScore = options.minScore ?? 0.7;
    this.activeTopicWindowMs = options.activeTopicWindowMs === undefined ? 48 * 60 * 60 * 1000 : options.activeTopicWindowMs;
    this.requireTopicFirstSeenBeforeObservedAt = options.requireTopicFirstSeenBeforeObservedAt ?? true;
  }

  async match(input: Parameters<MemeMatcher["match"]>[0]): Promise<TokenMemeMatch> {
    const candidateParts = buildCandidateTextParts(input);
    const candidateText = Object.values(candidateParts).filter(Boolean).join(" ");
    const normalizedCandidate = normalizePhrase(candidateText);
    const candidateSymbol = normalizePhrase(input.launch.symbol ?? "");
    const rejectFlags: string[] = [];
    if (!normalizedCandidate) rejectFlags.push("NO_TOKEN_TEXT");
    if (isGenericOnly(normalizedCandidate)) rejectFlags.push("GENERIC_TOKEN_TEXT");
    if (isGenericSymbolOnly(candidateSymbol, normalizedCandidate)) rejectFlags.push("GENERIC_SYMBOL_ONLY");

    const temporalTopics = input.topics.filter((topic) =>
      isTemporallyEligibleTrendTopic(topic, input.observedAt, {
        activeTopicWindowMs: this.activeTopicWindowMs,
        requireTopicFirstSeenBeforeObservedAt: this.requireTopicFirstSeenBeforeObservedAt
      })
    );
    if (input.topics.length > 0 && temporalTopics.length === 0) rejectFlags.push("NO_TEMPORALLY_MATCHABLE_TOPICS");

    const matchableTopics = temporalTopics.filter(isMatchableTrendTopic);
    if (input.topics.length > 0 && matchableTopics.length === 0) rejectFlags.push("NO_MATCHABLE_TOPICS");

    const scored = matchableTopics
      .map((topic) => scoreTopic(topic, normalizedCandidate, candidateSymbol))
      .sort((a, b) => b.score - a.score)[0];
    const best = scored && scored.matchStrength > 0 ? scored : undefined;

    const reasons = best?.reasons ?? [];
    const score = best ? round(best.score) : 0;
    if (score < this.minScore) rejectFlags.push("MEME_RELEVANCE_TOO_LOW");

    return {
      mint: input.launch.mint,
      observedAt: input.observedAt,
      memeRelevanceScore: score,
      topicId: best?.topic.id,
      canonicalPhrase: best?.topic.canonicalPhrase,
      topicType: best?.topic.topicType,
      aliases: best?.topic.aliases ?? [],
      evidenceUrls: best?.topic.evidenceUrls ?? [],
      reasons,
      rejectFlags,
      raw: {
        candidateText: normalizedCandidate,
        candidateParts,
        topicsLoaded: input.topics.length,
        temporallyEligibleTopics: temporalTopics.length,
        matchableTopics: matchableTopics.length,
        observedAt: input.observedAt.toISOString(),
        activeTopicWindowMs: this.activeTopicWindowMs,
        bestTopic: best
          ? {
              id: best.topic.id,
              canonicalPhrase: best.topic.canonicalPhrase,
              matchStrength: best.matchStrength,
              matchedAliases: best.matchedAliases,
              scoreComponents: best.scoreComponents,
              velocityScore: best.topic.velocityScore,
              noveltyScore: best.topic.noveltyScore,
              sourceCoverage: best.topic.sourceCoverage,
              saturationRisk: saturationRisk(best.topic)
            }
          : null
      } as JsonValue
    };
  }
}

interface CandidateTextParts extends JsonObject {
  name: string | null;
  symbol: string | null;
  uriText: string | null;
  metadataText: string | null;
  socialText: string | null;
  sentimentText: string | null;
}

interface TopicMatchDiagnostics {
  alias: string;
  reason: string;
  strength: number;
}

interface ScoreComponents extends JsonObject {
  sourceBoost: number;
  velocityBoost: number;
  noveltyBoost: number;
  saturationRisk: number;
  saturationPenalty: number;
  evidencePenalty: number;
  genericPenalty: number;
  multiplier: number;
}

function scoreTopic(topic: TrendTopic, candidateText: string, candidateSymbol: string): {
  topic: TrendTopic;
  score: number;
  matchStrength: number;
  reasons: string[];
  matchedAliases: TopicMatchDiagnostics[];
  scoreComponents: ScoreComponents;
} {
  const candidateCompact = compactPhrase(candidateText);
  const candidateTokens = new Set(tokenize(candidateText));
  const candidateContent = contentTokens(candidateText);
  const reasons: string[] = [];
  const matchedAliases: TopicMatchDiagnostics[] = [];
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
      matchStrength = recordMatch(matchStrength, matchedAliases, reasons, aliasNormalized, "EXACT_PHRASE_MATCH", 0.96);
    }
    if (
      aliasCompact.length >= 4 &&
      ((aliasNormalized.includes(" ") && candidateCompact.includes(aliasCompact)) ||
        (aliasCompact.length >= 8 && candidateCompact.includes(aliasCompact)) ||
        candidateSymbol === aliasCompact)
    ) {
      matchStrength = recordMatch(matchStrength, matchedAliases, reasons, aliasNormalized, "COMPACT_PHRASE_MATCH", 0.92);
    }
    if (candidateSymbol && aliasNormalized.length >= 3 && candidateSymbol === aliasNormalized) {
      matchStrength = recordMatch(matchStrength, matchedAliases, reasons, aliasNormalized, "SYMBOL_ALIAS_MATCH", 0.86);
    }
    if (aliasTokens.length > 0 && aliasTokens.every((token) => candidateTokens.has(token))) {
      matchStrength = recordMatch(matchStrength, matchedAliases, reasons, aliasNormalized, "TOKEN_SET_MATCH", aliasTokens.length >= 2 ? 0.86 : 0.55);
    }
    if (candidateSymbol && aliasAcronym.length >= 2 && candidateSymbol === aliasAcronym) {
      matchStrength = recordMatch(matchStrength, matchedAliases, reasons, aliasNormalized, "ACRONYM_SYMBOL_MATCH", 0.84);
    }
    if (candidateSymbol && aliasSkeleton.length >= 3 && symbolSkeleton === aliasSkeleton) {
      matchStrength = recordMatch(matchStrength, matchedAliases, reasons, aliasNormalized, "CONSONANT_SYMBOL_MATCH", 0.88);
    }
    const fuzzy = Math.max(similarity(aliasNormalized, candidateText), similarity(aliasCompact, candidateCompact));
    if (fuzzy >= 0.84) {
      matchStrength = recordMatch(matchStrength, matchedAliases, reasons, aliasNormalized, "FUZZY_MATCH", 0.74);
    }
    if (aliasContent.length > 0 && candidateContent.length > 0 && aliasContent.every((token) => candidateContent.includes(token))) {
      matchStrength = recordMatch(matchStrength, matchedAliases, reasons, aliasNormalized, "CONTENT_WORD_MATCH", 0.78);
    }
  }

  const sourceBoost = clamp(topic.sourceCoverage / 3) * 0.08;
  const velocityBoost = topic.velocityScore * 0.22;
  const noveltyBoost = topic.noveltyScore * 0.08;
  const topicSaturationRisk = saturationRisk(topic);
  const openAiTopic = hasOpenAiMemeTopic(topic);
  const saturationPenalty = 1 - topicSaturationRisk * 0.32;
  const evidencePenalty = openAiTopic && topic.sourceCoverage < 2 ? 0.9 : 1;
  const genericPenalty = genericMatchPenalty({
    candidateText,
    candidateSymbol,
    candidateContent,
    matchStrength,
    matchedAliases,
    topic
  });
  if (topicSaturationRisk >= 0.75) reasons.push("HIGH_SATURATION_TOPIC");
  if (openAiTopic && topic.sourceCoverage < 2) reasons.push("SINGLE_SOURCE_TOPIC");
  if (genericPenalty < 1) reasons.push("GENERIC_COPYCAT_PENALTY");
  const multiplier = (0.62 + sourceBoost + velocityBoost + noveltyBoost) * saturationPenalty * evidencePenalty * genericPenalty;
  const score = clamp(matchStrength * multiplier);
  return {
    topic,
    score,
    matchStrength,
    reasons: [...new Set(reasons)],
    matchedAliases,
    scoreComponents: {
      sourceBoost: round(sourceBoost),
      velocityBoost: round(velocityBoost),
      noveltyBoost: round(noveltyBoost),
      saturationRisk: round(topicSaturationRisk),
      saturationPenalty: round(saturationPenalty),
      evidencePenalty: round(evidencePenalty),
      genericPenalty: round(genericPenalty),
      multiplier: round(multiplier)
    }
  };
}

function isTemporallyEligibleTrendTopic(
  topic: TrendTopic,
  observedAt: Date,
  options: { activeTopicWindowMs: number | null; requireTopicFirstSeenBeforeObservedAt: boolean }
): boolean {
  if (options.requireTopicFirstSeenBeforeObservedAt && topic.firstSeen.getTime() > observedAt.getTime()) return false;
  if (options.activeTopicWindowMs === null) return true;
  return topic.lastSeen.getTime() >= observedAt.getTime() - options.activeTopicWindowMs;
}

function buildCandidateTextParts(input: Parameters<MemeMatcher["match"]>[0]): CandidateTextParts {
  const socialText = Object.values(input.enrichment?.socialLinks ?? {}).filter(Boolean).join(" ") || null;
  const sentimentText = input.enrichment?.sentimentKeywords?.join(" ") || null;
  return {
    name: input.launch.name ?? null,
    symbol: input.launch.symbol ?? null,
    uriText: uriTextForMatching(input.launch.uri),
    metadataText: metadataTextFromRaw(input.enrichment?.raw),
    socialText,
    sentimentText
  };
}

function uriTextForMatching(uri?: string): string | null {
  if (!uri) return null;
  if (/^(https?|ipfs|ar):/i.test(uri)) return null;
  return uri;
}

function metadataTextFromRaw(raw: JsonValue | undefined): string | null {
  if (!isRecord(raw)) return null;
  const direct = raw.metadataText;
  if (typeof direct === "string" && direct.trim()) return direct;
  const metadata = raw.metadata;
  if (isRecord(metadata)) {
    const text = [
      metadata.name,
      metadata.symbol,
      metadata.description,
      metadata.image,
      metadata.external_url,
      metadata.website,
      metadata.twitter,
      metadata.x,
      metadata.telegram
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ");
    if (text) return text;
  }
  for (const value of Object.values(raw)) {
    if (isRecord(value)) {
      const nested = metadataTextFromRaw(value as JsonValue);
      if (nested) return nested;
    }
  }
  return null;
}

function recordMatch(
  currentStrength: number,
  matchedAliases: TopicMatchDiagnostics[],
  reasons: string[],
  alias: string,
  reason: string,
  strength: number
): number {
  reasons.push(reason);
  matchedAliases.push({ alias, reason, strength: round(strength) });
  return Math.max(currentStrength, strength);
}

function isGenericSymbolOnly(candidateSymbol: string, candidateText: string): boolean {
  return Boolean(candidateSymbol && isGenericTokenWord(candidateSymbol) && contentTokens(candidateText).length === 0);
}

function genericMatchPenalty(input: {
  candidateText: string;
  candidateSymbol: string;
  candidateContent: string[];
  matchStrength: number;
  matchedAliases: TopicMatchDiagnostics[];
  topic: TrendTopic;
}): number {
  if (input.matchStrength <= 0) return 1;
  const symbolIsGeneric = Boolean(input.candidateSymbol && isGenericTokenWord(input.candidateSymbol));
  const genericOnly = isGenericOnly(input.candidateText);
  const genericWords = genericTokenWordCount(input.candidateText);
  const hasSpecificCandidateWords = input.candidateContent.length > 0;
  const hasStrongSpecificMatch = input.matchedAliases.some(
    (match) =>
      match.strength >= 0.9 &&
      (match.reason === "EXACT_PHRASE_MATCH" || match.reason === "COMPACT_PHRASE_MATCH") &&
      contentTokens(match.alias).length > 0
  );

  if (genericOnly || (symbolIsGeneric && !hasSpecificCandidateWords)) return 0.25;
  if (genericWords > 0 && !hasSpecificCandidateWords) return 0.4;
  if (symbolIsGeneric && !hasStrongSpecificMatch) return 0.68;
  if (saturationRisk(input.topic) >= 0.7 && !hasStrongSpecificMatch && genericWords > 0) return 0.78;
  return 1;
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
