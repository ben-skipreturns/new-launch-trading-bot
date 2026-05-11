import type { TokenEnrichment, TokenLaunch, TokenMemeMatch, TrendTopic, TrendTopicType } from "../domain/types.js";
import { TokenMemeMatcher } from "./tokenMemeMatcher.js";
import { generateAliases, normalizePhrase, slugify } from "./text.js";

export type MatcherCalibrationExpectation = "pass" | "reject";

export interface MatcherCalibrationFixture {
  id: string;
  description: string;
  expected: MatcherCalibrationExpectation;
  observedAt: string;
  launch: {
    symbol: string;
    name: string;
    uri?: string;
  };
  metadataText?: string;
  topics: MatcherCalibrationTopicFixture[];
}

export interface MatcherCalibrationTopicFixture {
  phrase: string;
  aliases?: string[];
  likelySymbols?: string[];
  topicType?: TrendTopicType;
  firstSeen: string;
  lastSeen: string;
  sourceCoverage?: number;
  velocityScore?: number;
  noveltyScore?: number;
  memeabilityScore?: number;
  tokenizationLikelihood?: number;
  saturationRisk?: number;
  riskFlags?: string[];
}

export interface MatcherCalibrationResult {
  fixture: MatcherCalibrationFixture;
  match: TokenMemeMatch;
  passedExpectation: boolean;
}

export interface MatcherCalibrationSummary {
  total: number;
  expectedPasses: number;
  expectedRejects: number;
  passedExpectations: number;
  failedExpectations: number;
}

export interface MatcherCalibrationRun {
  summary: MatcherCalibrationSummary;
  results: MatcherCalibrationResult[];
}

const BASE_OBSERVED_AT = "2026-05-08T12:00:00.000Z";

export const matcherCalibrationFixtures: MatcherCalibrationFixture[] = [
  positive("moodeng-name", "MOODENG", "Moo Deng", "Moo Deng baby hippo", "animal", ["moo deng", "moodeng"]),
  positive("pnut-name", "PNUT", "Peanut", "Peanut the Squirrel", "animal", ["peanut", "pnut"]),
  positive("chillguy-name", "CHILLGUY", "Just a Chill Guy", "Just a Chill Guy", "internet_phrase", ["chillguy", "chill guy"]),
  positive("wif-symbol", "WIF", "dogwifhat", "dogwifhat", "internet_phrase", ["wif", "dog wif hat"]),
  positive("goat-ai", "GOAT", "Goatseus Maximus", "Truth Terminal AI GOAT Fartcoin", "ai", ["goat", "truth terminal"]),
  positive("fartcoin-metadata", "FART", "FRT", "Truth Terminal AI GOAT Fartcoin", "ai", ["fartcoin", "fart coin"], {
    metadataText: "Fartcoin AI meme from the Truth Terminal internet culture cycle"
  }),
  positive("bome-archive", "BOME", "Book of Meme", "Book of Meme Solana archive", "internet_phrase", ["book of meme", "bome"]),
  positive("slerf-drama", "SLERF", "Slerf", "SLERF launch drama", "crypto", ["slerf"]),
  positive("popcat-name", "POPCAT", "Popcat", "Popcat cat meme", "animal", ["popcat", "pop cat"]),
  positive("giga-name", "GIGA", "Gigachad", "Gigachad GIGA meme", "internet_phrase", ["giga", "gigachad"]),
  {
    id: "generic-cat-copycat",
    description: "Generic CAT should not pass a specific fresh cat topic without specific metadata.",
    expected: "reject",
    observedAt: BASE_OBSERVED_AT,
    launch: { symbol: "CAT", name: "Cat" },
    topics: [
      topic("Ganymede blind cat", "animal", {
        aliases: ["ganymede blind cat", "ganymede", "blind cat", "cat"],
        likelySymbols: ["GANY", "BLIND", "CAT"],
        sourceCoverage: 3,
        memeabilityScore: 0.86,
        tokenizationLikelihood: 0.78,
        saturationRisk: 0.55
      })
    ]
  },
  {
    id: "generic-dog-copycat",
    description: "Generic DOG should not pass dogwifhat without the WIF-specific hook.",
    expected: "reject",
    observedAt: BASE_OBSERVED_AT,
    launch: { symbol: "DOG", name: "Dog" },
    topics: [topic("dogwifhat", "internet_phrase", { aliases: ["dogwifhat", "wif", "dog wif hat"], sourceCoverage: 3 })]
  },
  {
    id: "stale-moodeng",
    description: "A stale topic outside the active window should not match even when token text matches.",
    expected: "reject",
    observedAt: BASE_OBSERVED_AT,
    launch: { symbol: "MOODENG", name: "Moo Deng" },
    topics: [
      topic("Moo Deng baby hippo", "animal", {
        aliases: ["moo deng", "moodeng"],
        firstSeen: "2026-05-01T10:00:00.000Z",
        lastSeen: "2026-05-01T12:00:00.000Z"
      })
    ]
  },
  {
    id: "future-topic-lookahead",
    description: "A topic first seen after the match timestamp must not be visible to the matcher.",
    expected: "reject",
    observedAt: BASE_OBSERVED_AT,
    launch: { symbol: "BANANA", name: "Future Banana" },
    topics: [
      topic("Future banana", "internet_phrase", {
        aliases: ["future banana", "banana"],
        firstSeen: "2026-05-08T12:05:00.000Z",
        lastSeen: "2026-05-08T12:10:00.000Z"
      })
    ]
  },
  {
    id: "forced-acronym",
    description: "A forced near-acronym should not pass without an actual alias/symbol fit.",
    expected: "reject",
    observedAt: BASE_OBSERVED_AT,
    launch: { symbol: "MGM", name: "MGM" },
    topics: [topic("Met Gala meme fest", "entertainment", { aliases: ["met gala meme fest", "gala"], likelySymbols: ["GALA", "MGF"] })]
  },
  {
    id: "weak-generic-river",
    description: "A weak one-source generic topic should remain unmatchable.",
    expected: "reject",
    observedAt: BASE_OBSERVED_AT,
    launch: { symbol: "RIVER", name: "River" },
    topics: [
      topic("river", "other", {
        aliases: ["river"],
        sourceCoverage: 1,
        memeabilityScore: 0.65,
        tokenizationLikelihood: 0.55,
        riskFlags: ["generic_name", "weak_token_name"]
      })
    ]
  },
  {
    id: "metadata-only-negative",
    description: "Sparse name/symbol should not pass when metadata carries no topic text.",
    expected: "reject",
    observedAt: BASE_OBSERVED_AT,
    launch: { symbol: "MD", name: "MD" },
    metadataText: "official community token with moon utility",
    topics: [topic("Moo Deng baby hippo", "animal", { aliases: ["moo deng", "moodeng"] })]
  },
  {
    id: "public-figure-stale-spam",
    description: "Public-figure spam should fail when the relevant topic is stale.",
    expected: "reject",
    observedAt: BASE_OBSERVED_AT,
    launch: { symbol: "TRUMP", name: "Official Trump" },
    topics: [
      topic("Official Trump memecoin", "politics", {
        aliases: ["official trump", "trump"],
        firstSeen: "2026-04-01T12:00:00.000Z",
        lastSeen: "2026-04-02T12:00:00.000Z"
      })
    ]
  }
];

export async function runMatcherCalibration(
  fixtures: MatcherCalibrationFixture[] = matcherCalibrationFixtures,
  options: { minScore?: number } = {}
): Promise<MatcherCalibrationRun> {
  const matcher = new TokenMemeMatcher({ minScore: options.minScore });
  const results: MatcherCalibrationResult[] = [];
  for (const fixture of fixtures) {
    const observedAt = new Date(fixture.observedAt);
    const match = await matcher.match({
      launch: launchFromFixture(fixture, observedAt),
      topics: fixture.topics.map(topicFromFixture),
      enrichment: enrichmentFromFixture(fixture, observedAt),
      observedAt
    });
    const actual = match.rejectFlags.length === 0 ? "pass" : "reject";
    results.push({ fixture, match, passedExpectation: actual === fixture.expected });
  }
  return {
    summary: {
      total: results.length,
      expectedPasses: fixtures.filter((fixture) => fixture.expected === "pass").length,
      expectedRejects: fixtures.filter((fixture) => fixture.expected === "reject").length,
      passedExpectations: results.filter((result) => result.passedExpectation).length,
      failedExpectations: results.filter((result) => !result.passedExpectation).length
    },
    results
  };
}

function positive(
  id: string,
  symbol: string,
  name: string,
  phrase: string,
  topicType: TrendTopicType,
  aliases: string[],
  options: { metadataText?: string } = {}
): MatcherCalibrationFixture {
  return {
    id,
    description: `${name} should match ${phrase}.`,
    expected: "pass",
    observedAt: BASE_OBSERVED_AT,
    launch: { symbol, name },
    metadataText: options.metadataText,
    topics: [topic(phrase, topicType, { aliases, likelySymbols: [symbol], sourceCoverage: 3 })]
  };
}

function topic(
  phrase: string,
  topicType: TrendTopicType,
  overrides: Partial<Omit<MatcherCalibrationTopicFixture, "phrase" | "topicType">> = {}
): MatcherCalibrationTopicFixture {
  return {
    phrase,
    topicType,
    aliases: overrides.aliases,
    likelySymbols: overrides.likelySymbols,
    firstSeen: overrides.firstSeen ?? "2026-05-08T11:30:00.000Z",
    lastSeen: overrides.lastSeen ?? "2026-05-08T11:58:00.000Z",
    sourceCoverage: overrides.sourceCoverage ?? 3,
    velocityScore: overrides.velocityScore ?? 0.82,
    noveltyScore: overrides.noveltyScore ?? 0.72,
    memeabilityScore: overrides.memeabilityScore ?? 0.86,
    tokenizationLikelihood: overrides.tokenizationLikelihood ?? 0.78,
    saturationRisk: overrides.saturationRisk ?? 0.42,
    riskFlags: overrides.riskFlags ?? []
  };
}

function launchFromFixture(fixture: MatcherCalibrationFixture, observedAt: Date): TokenLaunch {
  return {
    mint: `Calibration${fixture.id}`,
    source: "matcher-calibration",
    signature: `matcher-calibration:${fixture.id}`,
    pool: "fixture",
    name: fixture.launch.name,
    symbol: fixture.launch.symbol,
    uri: fixture.launch.uri,
    createdAt: observedAt,
    raw: { calibrationFixture: fixture.id }
  };
}

function enrichmentFromFixture(fixture: MatcherCalibrationFixture, observedAt: Date): TokenEnrichment | null {
  if (!fixture.metadataText) return null;
  return {
    mint: `Calibration${fixture.id}`,
    observedAt,
    provider: "fixture-metadata",
    sentimentKeywords: [],
    socialLinks: {},
    raw: { metadataText: fixture.metadataText }
  };
}

function topicFromFixture(fixture: MatcherCalibrationTopicFixture): TrendTopic {
  const aliases = [
    ...new Set(
      [
        normalizePhrase(fixture.phrase),
        ...generateAliases(fixture.phrase),
        ...(fixture.aliases ?? []),
        ...(fixture.likelySymbols ?? [])
      ]
        .map((alias) => normalizePhrase(alias))
        .filter(Boolean)
    )
  ];
  return {
    id: `trend:${slugify(fixture.phrase)}`,
    canonicalPhrase: normalizePhrase(fixture.phrase),
    aliases,
    topicType: fixture.topicType ?? "other",
    sourceCoverage: fixture.sourceCoverage ?? 1,
    velocityScore: fixture.velocityScore ?? 0.5,
    noveltyScore: fixture.noveltyScore ?? 0.5,
    firstSeen: new Date(fixture.firstSeen),
    lastSeen: new Date(fixture.lastSeen),
    evidenceUrls: [`https://example.com/${slugify(fixture.phrase)}`],
    raw: {
      openAiMemeTopic: {
        canonicalPhrase: normalizePhrase(fixture.phrase),
        aliases,
        likelySymbols: fixture.likelySymbols ?? [],
        topicType: fixture.topicType ?? "other",
        memeabilityScore: fixture.memeabilityScore ?? 0.5,
        tokenizationLikelihood: fixture.tokenizationLikelihood ?? 0.5,
        saturationRisk: fixture.saturationRisk ?? 0.5,
        riskFlags: fixture.riskFlags ?? []
      }
    }
  };
}
