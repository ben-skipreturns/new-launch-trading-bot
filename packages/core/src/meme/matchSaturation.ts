import type { MemeMatchSaturationContext, MemeMatchTopicSaturation } from "../domain/interfaces.js";
import type { JsonValue, TokenLaunch, TokenMemeMatch } from "../domain/types.js";
import type { Store } from "../storage/store.js";
import { normalizePhrase } from "./text.js";

export interface BuildMemeMatchSaturationOptions {
  windowMs?: number;
  minScoreForPressure?: number;
}

export async function buildMemeMatchSaturationContext(
  store: Store,
  launch: TokenLaunch,
  observedAt: Date,
  options: BuildMemeMatchSaturationOptions = {}
): Promise<MemeMatchSaturationContext> {
  const recentWindowMs = options.windowMs ?? 10 * 60 * 1000;
  const minScoreForPressure = options.minScoreForPressure ?? 0.4;
  const from = new Date(observedAt.getTime() - recentWindowMs);
  const recentMatches = (await store.listTokenMemeMatches(from, observedAt)).filter(
    (match) => match.mint !== launch.mint && match.memeRelevanceScore >= minScoreForPressure
  );
  return {
    recentWindowMs,
    topics: buildTopicStats(recentMatches, launch)
  };
}

function buildTopicStats(matches: TokenMemeMatch[], launch: TokenLaunch): MemeMatchTopicSaturation[] {
  const currentSymbol = normalizePhrase(launch.symbol ?? "");
  const currentName = normalizePhrase(launch.name ?? "");
  const byTopic = new Map<string, MemeMatchTopicSaturation>();

  for (const match of matches) {
    const topicKey = match.topicId ?? normalizePhrase(match.canonicalPhrase ?? "");
    if (!topicKey) continue;
    const existing =
      byTopic.get(topicKey) ??
      ({
        topicId: match.topicId,
        canonicalPhrase: match.canonicalPhrase,
        matchCount: 0,
        sameSymbolCount: 0,
        sameNameCount: 0
      } satisfies MemeMatchTopicSaturation);
    existing.matchCount += 1;

    const parts = candidateParts(match.raw);
    const priorSymbol = normalizePhrase(parts.symbol ?? "");
    const priorName = normalizePhrase(parts.name ?? "");
    if (currentSymbol && priorSymbol && currentSymbol === priorSymbol) existing.sameSymbolCount += 1;
    if (currentName && priorName && currentName === priorName) existing.sameNameCount += 1;
    byTopic.set(topicKey, existing);
  }

  return [...byTopic.values()];
}

function candidateParts(raw: JsonValue): { symbol?: string; name?: string } {
  if (!isRecord(raw) || !isRecord(raw.candidateParts)) return {};
  return {
    symbol: typeof raw.candidateParts.symbol === "string" ? raw.candidateParts.symbol : undefined,
    name: typeof raw.candidateParts.name === "string" ? raw.candidateParts.name : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
