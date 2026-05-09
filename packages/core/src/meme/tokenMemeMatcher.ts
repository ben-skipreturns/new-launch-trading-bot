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

    const scored = input.topics
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
              sourceCoverage: scored.topic.sourceCoverage
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
  const score = clamp(matchStrength * (0.62 + sourceBoost + velocityBoost + noveltyBoost));
  return {
    topic,
    score,
    matchStrength,
    reasons: [...new Set(reasons)]
  };
}
