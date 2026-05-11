import { describe, expect, it } from "vitest";
import { buildMemeMatchSaturationContext, MemoryStore } from "../index.js";
import type { TokenLaunch, TokenMemeMatch } from "../domain/types.js";

describe("buildMemeMatchSaturationContext", () => {
  it("counts recent topic, same-symbol, and same-name pressure without lookahead", async () => {
    const store = new MemoryStore();
    const observedAt = new Date("2026-05-08T12:00:00.000Z");
    await store.upsertTokenMemeMatch(match("Prior1", "MOODENG", "Moo Deng", "moo deng baby hippo", new Date("2026-05-08T11:58:00.000Z")));
    await store.upsertTokenMemeMatch(match("Prior2", "MOODENG", "Other Deng", "moo deng baby hippo", new Date("2026-05-08T11:59:00.000Z")));
    await store.upsertTokenMemeMatch(match("Old", "MOODENG", "Moo Deng", "moo deng baby hippo", new Date("2026-05-08T11:00:00.000Z")));
    await store.upsertTokenMemeMatch(match("Future", "MOODENG", "Moo Deng", "moo deng baby hippo", new Date("2026-05-08T12:01:00.000Z")));

    const context = await buildMemeMatchSaturationContext(store, launch("MOODENG", "Moo Deng"), observedAt, { windowMs: 10 * 60 * 1000 });

    expect(context.topics).toEqual([
      {
        topicId: "trend:moo-deng",
        canonicalPhrase: "moo deng baby hippo",
        matchCount: 2,
        sameSymbolCount: 2,
        sameNameCount: 1
      }
    ]);
  });
});

function launch(symbol: string, name: string): TokenLaunch {
  return {
    mint: "CurrentMint",
    source: "test",
    signature: "sig-current",
    pool: "pump",
    symbol,
    name,
    createdAt: new Date("2026-05-08T12:00:00.000Z"),
    raw: {}
  };
}

function match(mint: string, symbol: string, name: string, canonicalPhrase: string, observedAt: Date): TokenMemeMatch {
  return {
    mint,
    observedAt,
    memeRelevanceScore: 0.82,
    topicId: "trend:moo-deng",
    canonicalPhrase,
    topicType: "animal",
    aliases: ["moo deng", "moodeng"],
    evidenceUrls: [],
    reasons: [],
    rejectFlags: [],
    raw: {
      candidateParts: {
        symbol,
        name
      }
    }
  };
}
