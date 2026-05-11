#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { config } from "dotenv";
import {
  BirdeyeEnricher,
  CompositeEnricher,
  DefaultFeatureExtractor,
  DefaultPaperBroker,
  DexScreenerEnricher,
  GeckoTerminalEnricher,
  HeuristicScorer,
  JsonlLaunchFeed,
  MemeTrendEngine,
  MemoryStore,
  OpenAiMemeTrendSource,
  PostgresStore,
  PumpApiLaunchFeed,
  ReplayRunner,
  StaticFixtureEnricher,
  StaticTrendSource,
  TokenMetadataEnricher,
  TokenMemeMatcher,
  TradingPipeline,
  generateDailyReport,
  generateMemeReport,
  type Enricher,
  type LaunchFeed,
  type Store,
  type TokenEnrichment,
  type TokenLaunch,
  type TrendObservation,
  type TrendSource
} from "@moonshot/core";

loadWorkspaceEnv();

const program = new Command();

program
  .name("moonshot-bot")
  .description("Solana launchpad paper trader with replayable scoring and simulated execution.")
  .version("0.1.0");

program
  .command("demo")
  .description("Run the full dry-run pipeline on the bundled fixture and write a Markdown report.")
  .option("--fixture <path>", "JSONL fixture path", "fixtures/pumpapi-events.jsonl")
  .option("--report <path>", "Report path", "reports/demo.md")
  .action(async (options: { fixture: string; report: string }) => {
    const store = new MemoryStore();
    await refreshTrends(store, fixtureTrendSources());
    const result = await runReplay(options.fixture, store, fixtureEnricher());
    const report = await generateDailyReport(store);
    await writeText(options.report, report);
    console.log(`Processed ${result.events} events and ${result.snapshots} snapshots.`);
    console.log(`Report written to ${resolve(options.report)}.`);
  });

program
  .command("replay")
  .description("Replay a JSONL event file deterministically; use --database-url to persist in Postgres.")
  .requiredOption("--fixture <path>", "JSONL fixture path")
  .option("--report <path>", "Report path", "reports/replay.md")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .action(async (options: { fixture: string; report: string; databaseUrl?: string }) => {
    const store = createStore(options.databaseUrl);
    try {
      await refreshTrends(store, options.fixture.includes("fixture") ? fixtureTrendSources() : liveTrendSources(store));
      const result = await runReplay(options.fixture, store, options.fixture.includes("fixture") ? fixtureEnricher() : liveEnricher());
      const report = await generateDailyReport(store);
      await writeText(options.report, report);
      console.log(`Processed ${result.events} events and ${result.snapshots} snapshots.`);
      console.log(`Report written to ${resolve(options.report)}.`);
    } finally {
      await closeStore(store);
    }
  });

program
  .command("ingest")
  .description("Run ingestion against a fixture or a live PumpApi-compatible stream.")
  .option("--source <source>", "fixture or pumpapi", "fixture")
  .option("--fixture <path>", "JSONL fixture path", "fixtures/pumpapi-events.jsonl")
  .option("--duration-seconds <seconds>", "Stop live ingestion after this many seconds", "60")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .action(async (options: { source: string; fixture: string; durationSeconds: string; databaseUrl?: string }) => {
    const store = createStore(options.databaseUrl);
    try {
      if (options.source === "fixture") {
        await refreshTrends(store, fixtureTrendSources());
        const result = await runReplay(options.fixture, store, fixtureEnricher());
        console.log(`Processed ${result.events} fixture events.`);
        return;
      }

      await refreshTrends(store, liveTrendSources(store));
      const feed = new PumpApiLaunchFeed();
      const pipeline = createPipeline(store, liveEnricher());
      const durationMs = Number(options.durationSeconds) * 1000;
      const result = await runStreaming(feed, pipeline, durationMs);
      console.log(`Processed ${result.events} live events.`);
    } finally {
      await closeStore(store);
    }
  });

program
  .command("stream-test")
  .description("Inspect token create events from a fixture or PumpApi stream without matching, scoring, or paper trading.")
  .option("--source <source>", "fixture or pumpapi", "fixture")
  .option("--fixture <path>", "JSONL fixture path", "fixtures/pumpapi-events.jsonl")
  .option("--duration-seconds <seconds>", "Stop stream testing after this many seconds", "60")
  .option("--max-launches <count>", "Stop after this many create events", "25")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--persist", "Persist only raw create events and token_launches", false)
  .action(async (options: StreamTestOptions) => {
    if (options.persist && !options.databaseUrl) throw new Error("DATABASE_URL is required when using --persist.");
    const store = options.persist ? createStore(options.databaseUrl) : undefined;
    try {
      const result = await runLaunchStreamTest(createLaunchFeed(options.source, options.fixture), {
        durationMs: parsePositiveNumberOption(options.durationSeconds, "--duration-seconds") * 1000,
        maxLaunches: parsePositiveIntegerOption(options.maxLaunches, "--max-launches"),
        store
      });
      console.log(
        `Stream test complete: ${result.events} events read, ${result.launches} launches, ${result.ignoredEvents} non-create events ignored, ${result.persistedLaunches} launches persisted.`
      );
    } finally {
      if (store) await closeStore(store);
    }
  });

program
  .command("trend-refresh")
  .description("Run the OpenAI meme trend radar and store active meme/current-event topics.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--fixture", "Use fixture trend observations instead of live web sources", false)
  .action(async (options: { databaseUrl?: string; fixture: boolean }) => {
    const store = createStore(options.databaseUrl);
    try {
      const result = await refreshTrends(store, options.fixture ? fixtureTrendSources() : liveTrendSources(store));
      console.log(`Stored ${result.observations.length} trend observations and ${result.topics.length} topics.`);
      if (!options.fixture) await printLatestTrendRefreshRun(store);
    } finally {
      await closeStore(store);
    }
  });

program
  .command("match-token")
  .description("Run token meme matching locally against active DB topics or deterministic fixture topics.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--name <name>", "Token name to test")
  .option("--symbol <symbol>", "Token symbol to test")
  .option("--uri <uri>", "Token metadata URI or text to include in matching")
  .option("--mint <mint>", "Mint identifier to use for optional persistence")
  .option("--fixture-topics", "Use bundled fixture topics instead of active database topics", false)
  .option("--persist", "Persist the local token launch and meme match to the configured database", false)
  .option("--min-score <score>", "Meme relevance threshold", "0.7")
  .action(async (options: MatchTokenOptions) => {
    if (![options.name, options.symbol, options.uri].some((value) => value && value.trim().length > 0)) {
      throw new Error("Provide at least one of --name, --symbol, or --uri.");
    }
    if (!options.fixtureTopics && !options.databaseUrl) {
      throw new Error("DATABASE_URL is required unless --fixture-topics is used.");
    }
    if (options.persist && !options.databaseUrl) {
      throw new Error("DATABASE_URL is required when using --persist.");
    }

    const minScore = parseNumberOption(options.minScore, "--min-score");
    const store = options.fixtureTopics && !options.persist ? new MemoryStore() : createStore(options.databaseUrl);
    try {
      if (options.fixtureTopics) await refreshTrends(store, fixtureTrendSources());

      const observedAt = new Date();
      const topics = await listTopicsForMatching(store, options.fixtureTopics, observedAt);
      const launch = buildLocalTokenLaunch(options, observedAt);
      const match = await new TokenMemeMatcher({ minScore }).match({ launch, topics, observedAt });

      if (options.persist) {
        await store.upsertTokenLaunch(launch);
        await store.upsertTokenMemeMatch(match);
      }

      printTokenMatchResult({
        source: options.fixtureTopics ? "fixture topics" : "active database topics",
        topicsLoaded: topics.length,
        minScore,
        persisted: options.persist,
        launch,
        match
      });
    } finally {
      await closeStore(store);
    }
  });

program
  .command("match-launches")
  .description("Run meme matching for persisted token_launches without enrichment, scoring, or paper trading.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--limit <count>", "Max persisted launches to inspect", "100")
  .option("--since-hours <hours>", "Only inspect launches created in the last N hours", "72")
  .option("--fixture-topics", "Use bundled fixture topics instead of active database topics", false)
  .option("--include-existing", "Re-match launches that already have a token_meme_match", false)
  .option("--dry-run", "Print match results without writing token_meme_matches", false)
  .option("--skip-metadata", "Skip token URI metadata fetching before matching", false)
  .option("--metadata-timeout-ms <milliseconds>", "Per-token metadata fetch timeout", "2500")
  .option("--min-score <score>", "Meme relevance threshold", "0.7")
  .action(async (options: MatchLaunchesOptions) => {
    if (!options.databaseUrl) throw new Error("DATABASE_URL is required for match-launches.");

    const limit = parsePositiveIntegerOption(options.limit, "--limit");
    const sinceHours = parsePositiveNumberOption(options.sinceHours, "--since-hours");
    const minScore = parseNumberOption(options.minScore, "--min-score");
    const metadataTimeoutMs = parsePositiveIntegerOption(options.metadataTimeoutMs, "--metadata-timeout-ms");
    const store = createStore(options.databaseUrl);

    try {
      const observedAt = new Date();
      const topicStore = options.fixtureTopics && options.dryRun ? new MemoryStore() : store;
      if (options.fixtureTopics) await refreshTrends(topicStore, fixtureTrendSources());

      const topics = await listTopicsForMatching(topicStore, options.fixtureTopics, observedAt);
      const since = new Date(observedAt.getTime() - sinceHours * 60 * 60 * 1000);
      const launches = (await store.listTokenLaunches())
        .filter((launch) => launch.createdAt >= since)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);

      const matcher = new TokenMemeMatcher({ minScore });
      let skippedExisting = 0;
      let matched = 0;
      let passed = 0;
      let rejected = 0;

      for (const launch of launches) {
        const existing = await store.getLatestTokenMemeMatch(launch.mint);
        if (existing && !options.includeExisting) {
          skippedExisting += 1;
          continue;
        }

        const enrichment = await getMatchingEnrichment(store, launch, {
          fetchMetadata: !options.skipMetadata,
          persist: !options.dryRun,
          timeoutMs: metadataTimeoutMs
        });
        const match = await matcher.match({ launch, topics, enrichment, observedAt });
        matched += 1;
        if (match.rejectFlags.length === 0) passed += 1;
        else rejected += 1;

        if (!options.dryRun) await store.upsertTokenMemeMatch(match);
        printPersistedLaunchMatch(launch, match);
      }

      console.log(
        `Launch matching complete: ${matched} matched (${passed} pass, ${rejected} reject), ${skippedExisting} skipped existing, ${topics.length} topics loaded, persisted=${options.dryRun ? "no" : "yes"}.`
      );
      if (launches.length === 0) {
        console.log("No persisted launches were found in the requested window. Run stream-test with --persist first, or increase --since-hours.");
      }
      if (topics.length === 0) {
        console.log("No topics were available. Run trend-refresh first, or use --fixture-topics for a deterministic local check.");
      }
    } finally {
      await closeStore(store);
    }
  });

program
  .command("match-stream")
  .description("Stream launches and run meme matching only; no scoring, paper trading, or wallet execution.")
  .option("--source <source>", "fixture or pumpapi", "pumpapi")
  .option("--fixture <path>", "JSONL fixture path", "fixtures/pumpapi-events.jsonl")
  .option("--duration-seconds <seconds>", "Stop streaming after this many seconds", "60")
  .option("--max-launches <count>", "Stop after this many create events", "25")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--fixture-topics", "Use bundled fixture topics instead of active database topics", false)
  .option("--refresh-trends", "Refresh trend topics at startup before matching", false)
  .option("--dry-run", "Print match results without writing raw events, launches, enrichments, or matches", false)
  .option("--skip-metadata", "Skip token URI metadata fetching before matching", false)
  .option("--metadata-timeout-ms <milliseconds>", "Per-token metadata fetch timeout", "2500")
  .option("--min-score <score>", "Meme relevance threshold", "0.7")
  .action(async (options: MatchStreamOptions) => {
    if (!options.databaseUrl && !(options.dryRun && options.fixtureTopics)) {
      throw new Error("DATABASE_URL is required for match-stream unless --dry-run and --fixture-topics are both used.");
    }

    const store = createStore(options.databaseUrl);
    try {
      const result = await runMatchStream(createLaunchFeed(options.source, options.fixture), store, options);
      console.log(
        `Match stream complete: ${result.events} events read, ${result.launches} launches, ${result.matched} matched (${result.passed} pass, ${result.rejected} reject), ${result.persisted} persisted.`
      );
    } finally {
      await closeStore(store);
    }
  });

program
  .command("meme-report")
  .description("Generate a Markdown report of active trends and matched token launches.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--from <iso>", "Start timestamp")
  .option("--to <iso>", "End timestamp")
  .option("--report <path>", "Report path", "reports/meme-report.md")
  .action(async (options: { databaseUrl?: string; from?: string; to?: string; report: string }) => {
    const store = createStore(options.databaseUrl);
    try {
      const report = await generateMemeReport(
        store,
        options.from ? new Date(options.from) : undefined,
        options.to ? new Date(options.to) : undefined
      );
      await writeText(options.report, report);
      console.log(`Meme report written to ${resolve(options.report)}.`);
    } finally {
      await closeStore(store);
    }
  });

program
  .command("retention-prune")
  .description("Delete expired raw/trade events, with optional pruning of uninteresting token launches.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--rejected-hours <hours>", "Raw retention for rejected/uninteresting launches", "48")
  .option("--interesting-days <days>", "Raw retention for watch/paper-buy launches", "14")
  .option("--prune-launches", "Also delete expired uninteresting token_launches and dependent rows", false)
  .option("--raw-launch-hours <hours>", "Launch retention for raw-only launches with no match or score", "48")
  .option("--matched-launch-days <days>", "Launch retention for matched launches with no score", "7")
  .option("--rejected-launch-days <days>", "Launch retention for scored rejects with no paper order", "14")
  .option("--dry-run", "Count rows that would be deleted without deleting", false)
  .action(
    async (options: {
      databaseUrl?: string;
      rejectedHours: string;
      interestingDays: string;
      pruneLaunches: boolean;
      rawLaunchHours: string;
      matchedLaunchDays: string;
      rejectedLaunchDays: string;
      dryRun: boolean;
    }) => {
      const store = createStore(options.databaseUrl);
      try {
        const result = await store.pruneRetention({
          now: new Date(),
          rejectedRawRetentionHours: Number(options.rejectedHours),
          interestingRawRetentionDays: Number(options.interestingDays),
          pruneLaunches: options.pruneLaunches,
          rawLaunchRetentionHours: Number(options.rawLaunchHours),
          matchedLaunchRetentionDays: Number(options.matchedLaunchDays),
          rejectedLaunchRetentionDays: Number(options.rejectedLaunchDays),
          dryRun: options.dryRun
        });
        console.log(
          `${options.dryRun ? "Would delete" : "Deleted"} ${result.rawEventsDeleted} raw events and ${
            result.tradeEventsDeleted
          } trade events${options.pruneLaunches ? `, plus ${result.tokenLaunchesDeleted} token launches` : ""}.`
        );
      } finally {
        await closeStore(store);
      }
    }
  );

program
  .command("migrate")
  .description("Apply SQL migrations to Postgres.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .action(async (options: { databaseUrl?: string }) => {
    if (!options.databaseUrl) throw new Error("DATABASE_URL is required for migrate.");
    const store = new PostgresStore(options.databaseUrl);
    try {
      await applyMigrations(store);
      console.log("Migrations applied.");
    } finally {
      await store.close();
    }
  });

program
  .command("report")
  .description("Generate a Markdown report from persisted Postgres data.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--from <iso>", "Start timestamp")
  .option("--to <iso>", "End timestamp")
  .option("--report <path>", "Report path", "reports/report.md")
  .action(async (options: { databaseUrl?: string; from?: string; to?: string; report: string }) => {
    if (!options.databaseUrl) throw new Error("DATABASE_URL is required for report.");
    const store = new PostgresStore(options.databaseUrl);
    try {
      const report = await generateDailyReport(
        store,
        options.from ? new Date(options.from) : undefined,
        options.to ? new Date(options.to) : undefined
      );
      await writeText(options.report, report);
      console.log(`Report written to ${resolve(options.report)}.`);
    } finally {
      await store.close();
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

interface MatchTokenOptions {
  databaseUrl?: string;
  name?: string;
  symbol?: string;
  uri?: string;
  mint?: string;
  fixtureTopics: boolean;
  persist: boolean;
  minScore: string;
}

interface MatchLaunchesOptions {
  databaseUrl?: string;
  limit: string;
  sinceHours: string;
  fixtureTopics: boolean;
  includeExisting: boolean;
  dryRun: boolean;
  skipMetadata: boolean;
  metadataTimeoutMs: string;
  minScore: string;
}

interface MatchStreamOptions {
  source: string;
  fixture: string;
  durationSeconds: string;
  maxLaunches: string;
  databaseUrl?: string;
  fixtureTopics: boolean;
  refreshTrends: boolean;
  dryRun: boolean;
  skipMetadata: boolean;
  metadataTimeoutMs: string;
  minScore: string;
}

interface StreamTestOptions {
  source: string;
  fixture: string;
  durationSeconds: string;
  maxLaunches: string;
  databaseUrl?: string;
  persist: boolean;
}

async function runLaunchStreamTest(
  feed: LaunchFeed,
  options: { durationMs: number; maxLaunches: number; store?: Store }
): Promise<{ events: number; launches: number; ignoredEvents: number; persistedLaunches: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.durationMs);
  let events = 0;
  let launches = 0;
  let ignoredEvents = 0;
  let persistedLaunches = 0;

  try {
    for await (const event of feed.stream(controller.signal)) {
      events += 1;
      if (!event.tokenLaunch) {
        ignoredEvents += 1;
        continue;
      }

      launches += 1;
      printLaunchEvent(event.tokenLaunch);
      if (options.store) {
        await options.store.upsertRawEvent(event);
        await options.store.upsertTokenLaunch(event.tokenLaunch);
        persistedLaunches += 1;
      }
      if (launches >= options.maxLaunches) {
        controller.abort();
        break;
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  return { events, launches, ignoredEvents, persistedLaunches };
}

async function runMatchStream(
  feed: LaunchFeed,
  store: Store,
  options: MatchStreamOptions
): Promise<{ events: number; launches: number; matched: number; passed: number; rejected: number; persisted: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), parsePositiveNumberOption(options.durationSeconds, "--duration-seconds") * 1000);
  const observedAt = new Date();
  const topicStore = options.fixtureTopics && options.dryRun ? new MemoryStore() : store;
  if (options.fixtureTopics) {
    await refreshTrends(topicStore, fixtureTrendSources());
  } else if (options.refreshTrends) {
    await refreshTrends(store, liveTrendSources(store));
  }
  const topics = await listTopicsForMatching(topicStore, options.fixtureTopics, observedAt);
  const matcher = new TokenMemeMatcher({ minScore: parseNumberOption(options.minScore, "--min-score") });
  const metadataTimeoutMs = parsePositiveIntegerOption(options.metadataTimeoutMs, "--metadata-timeout-ms");
  const maxLaunches = parsePositiveIntegerOption(options.maxLaunches, "--max-launches");
  let events = 0;
  let launches = 0;
  let matched = 0;
  let passed = 0;
  let rejected = 0;
  let persisted = 0;

  try {
    for await (const event of feed.stream(controller.signal)) {
      events += 1;
      if (!event.tokenLaunch) continue;

      launches += 1;
      if (!options.dryRun) {
        await store.upsertRawEvent(event);
        await store.upsertTokenLaunch(event.tokenLaunch);
      }

      const enrichment = await getMatchingEnrichment(store, event.tokenLaunch, {
        fetchMetadata: !options.skipMetadata,
        persist: !options.dryRun,
        timeoutMs: metadataTimeoutMs
      });
      const match = await matcher.match({ launch: event.tokenLaunch, topics, enrichment, observedAt: event.timestamp });
      matched += 1;
      if (match.rejectFlags.length === 0) passed += 1;
      else rejected += 1;
      if (!options.dryRun) {
        await store.upsertTokenMemeMatch(match);
        persisted += 1;
      }
      printPersistedLaunchMatch(event.tokenLaunch, match);

      if (launches >= maxLaunches) {
        controller.abort();
        break;
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  if (topics.length === 0) {
    console.log("No topics were available. Run trend-refresh first, use --refresh-trends, or use --fixture-topics for a deterministic check.");
  }
  return { events, launches, matched, passed, rejected, persisted };
}

function createLaunchFeed(source: string, fixturePath: string): LaunchFeed {
  if (source === "fixture") return new JsonlLaunchFeed(fixturePath);
  if (source === "pumpapi") return new PumpApiLaunchFeed();
  throw new Error(`Unsupported stream-test source "${source}". Use fixture or pumpapi.`);
}

function printLaunchEvent(launch: TokenLaunch): void {
  console.log(
    [
      `[launch ${launch.createdAt.toISOString()}]`,
      launch.name ?? "-",
      `(${launch.symbol ?? "-"})`,
      `mint=${launch.mint}`,
      `creator=${launch.creator ?? "-"}`,
      `pool=${launch.pool}`,
      `uri=${launch.uri ?? "-"}`
    ].join(" ")
  );
}

function buildLocalTokenLaunch(options: MatchTokenOptions, observedAt: Date): TokenLaunch {
  const mint = options.mint?.trim() || `local-${slugify([options.symbol, options.name, options.uri].filter(Boolean).join("-")) || "token"}`;
  return {
    mint,
    source: "local-token-match",
    signature: `local-token-match:${mint}:${observedAt.getTime()}`,
    pool: "local",
    name: options.name?.trim(),
    symbol: options.symbol?.trim(),
    uri: options.uri?.trim(),
    createdAt: observedAt,
    raw: {
      mode: "local-token-match",
      fixtureTopics: options.fixtureTopics
    }
  };
}

function printTokenMatchResult(input: {
  source: string;
  topicsLoaded: number;
  minScore: number;
  persisted: boolean;
  launch: TokenLaunch;
  match: Awaited<ReturnType<TokenMemeMatcher["match"]>>;
}): void {
  const status = input.match.rejectFlags.length === 0 ? "pass" : "reject";
  console.log(`Token: ${input.launch.name ?? "-"} (${input.launch.symbol ?? "-"})`);
  console.log(`Topic source: ${input.source}`);
  console.log(`Topics loaded: ${input.topicsLoaded}`);
  console.log(`Meme relevance: ${input.match.memeRelevanceScore.toFixed(3)} / threshold ${input.minScore.toFixed(3)} -> ${status}`);
  console.log(`Matched topic: ${formatMatchedTopic(input.match)}`);
  console.log(`Reasons: ${input.match.reasons.length > 0 ? input.match.reasons.join(", ") : "none"}`);
  console.log(`Reject flags: ${input.match.rejectFlags.length > 0 ? input.match.rejectFlags.join(", ") : "none"}`);
  console.log(`Evidence: ${input.match.evidenceUrls.length > 0 ? input.match.evidenceUrls.join(", ") : "none"}`);
  console.log(`Persisted: ${input.persisted ? "yes" : "no"}`);
  if (input.topicsLoaded === 0) {
    console.log("No active topics were available. Run trend-refresh first or use --fixture-topics for a deterministic local check.");
  }
}

function printPersistedLaunchMatch(launch: TokenLaunch, match: Awaited<ReturnType<TokenMemeMatcher["match"]>>): void {
  const status = match.rejectFlags.length === 0 ? "PASS" : "REJECT";
  console.log(
    [
      `[${status}]`,
      launch.name ?? "-",
      `(${launch.symbol ?? "-"})`,
      `mint=${launch.mint}`,
      `score=${match.memeRelevanceScore.toFixed(3)}`,
      `topic=${formatMatchedTopic(match)}`,
      `reasons=${match.reasons.length > 0 ? match.reasons.join("|") : "none"}`,
      `rejects=${match.rejectFlags.length > 0 ? match.rejectFlags.join("|") : "none"}`
    ].join(" ")
  );
}

async function getMatchingEnrichment(
  store: Store,
  launch: TokenLaunch,
  options: { fetchMetadata: boolean; persist: boolean; timeoutMs: number }
): Promise<TokenEnrichment | null> {
  const existing = await store.getLatestEnrichment(launch.mint);
  if (!options.fetchMetadata) return existing ?? null;
  if (hasMetadataEnrichment(existing)) return existing ?? null;

  try {
    const metadata = await new TokenMetadataEnricher({ timeoutMs: options.timeoutMs }).enrich(launch);
    if (!metadata) return existing ?? null;
    if (options.persist) await store.upsertTokenEnrichment(metadata);
    return metadata;
  } catch {
    return existing ?? null;
  }
}

function hasMetadataEnrichment(enrichment?: TokenEnrichment | null): boolean {
  if (!enrichment) return false;
  if (enrichment.provider.includes("token-metadata-uri")) return true;
  return typeof enrichment.raw === "object" && enrichment.raw !== null && !Array.isArray(enrichment.raw) && "metadataText" in enrichment.raw;
}

function formatMatchedTopic(match: Awaited<ReturnType<TokenMemeMatcher["match"]>>): string {
  if (match.memeRelevanceScore <= 0 || !match.canonicalPhrase) return "none";
  return `${match.canonicalPhrase}${match.topicType ? ` (${match.topicType})` : ""}`;
}

async function listTopicsForMatching(store: Store, fixtureTopics: boolean, observedAt: Date) {
  if (fixtureTopics) return store.listTrendTopics(undefined, 500);
  const activeSince = new Date(observedAt.getTime() - 48 * 60 * 60 * 1000);
  return store.listTrendTopics(activeSince, 500);
}

function parseNumberOption(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number.`);
  return parsed;
}

function parsePositiveNumberOption(value: string, name: string): number {
  const parsed = parseNumberOption(value, name);
  if (parsed <= 0) throw new Error(`${name} must be greater than 0.`);
  return parsed;
}

function parsePositiveIntegerOption(value: string, name: string): number {
  const parsed = parsePositiveNumberOption(value, name);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function runReplay(fixturePath: string, store: Store, enricher: Enricher) {
  const feed = new JsonlLaunchFeed(fixturePath);
  const pipeline = createPipeline(store, enricher);
  return new ReplayRunner(feed, pipeline).run();
}

async function runStreaming(feed: LaunchFeed, pipeline: TradingPipeline, durationMs: number): Promise<{ events: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), durationMs);
  let events = 0;
  try {
    for await (const event of feed.stream(controller.signal)) {
      await pipeline.processEvent(event);
      events += 1;
    }
  } finally {
    clearTimeout(timeout);
  }
  return { events };
}

function createPipeline(store: Store, enricher: Enricher): TradingPipeline {
  return new TradingPipeline(
    store,
    enricher,
    new DefaultFeatureExtractor(store),
    new HeuristicScorer(),
    new DefaultPaperBroker(store),
    new TokenMemeMatcher()
  );
}

function createStore(databaseUrl?: string): Store {
  return databaseUrl ? new PostgresStore(databaseUrl) : new MemoryStore();
}

async function closeStore(store: Store): Promise<void> {
  if (store instanceof PostgresStore) await store.close();
}

async function applyMigrations(store: PostgresStore): Promise<void> {
  const files = ["migrations/001_initial_schema.sql"];
  for (const file of files) {
    const sql = await readFile(file, "utf8");
    await store.runMigration(sql);
  }
}

async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

async function refreshTrends(store: Store, sources: TrendSource[]) {
  return new MemeTrendEngine(store, sources).refresh();
}

async function printLatestTrendRefreshRun(store: Store): Promise<void> {
  const [run] = await store.listTrendRefreshRuns();
  if (!run) return;
  console.log(
    `Trend radar run: ${run.status} | model=${run.model} | topics=${run.topicsFound} | web_searches=${run.webSearchCalls} | estimated_cost=$${run.estimatedCostUsd.toFixed(4)}`
  );
  if (run.errorText) console.log(`Trend radar error: ${run.errorText}`);
}

function liveEnricher(): Enricher {
  return new CompositeEnricher([new TokenMetadataEnricher(), new DexScreenerEnricher(), new GeckoTerminalEnricher(), new BirdeyeEnricher()]);
}

function liveTrendSources(store: Store): TrendSource[] {
  return [new OpenAiMemeTrendSource({ store })];
}

function fixtureTrendSources(): TrendSource[] {
  return [new StaticTrendSource("fixture-trends", fixtureTrendObservations())];
}

function fixtureTrendObservations(): TrendObservation[] {
  const observedAt = new Date("2026-05-08T11:55:00.000Z");
  const cases = [
    ["Moon AI Sol", "https://example.com/moon-ai-sol", 1, 50_000],
    ["dogwifhat", "https://www.coindesk.com/markets/2023/12/14/crypto-trader-turns-1k-into-100k-on-solanas-newest-memecoin-dogwifhat", 0.9, 25_000],
    ["Moo Deng baby hippo", "https://www.coingecko.com/learn/what-is-moodeng-crypto-hippo-memecoin-solana?locale=en", 1, 200_000],
    ["Peanut the Squirrel", "https://www.coingecko.com/en/coins/peanut-the-squirrel", 1, 150_000],
    ["Just a Chill Guy", "https://www.kucoin.com/news/articles/all-about-chillguy-the-viral-tiktok-memecoin-surging-over-6-000-to-a-700m-market-cap", 1, 120_000],
    ["Official Trump memecoin", "https://www.coingecko.com/learn/what-is-trump-memecoin-crypto", 1, 500_000],
    ["Truth Terminal AI GOAT Fartcoin", "https://www.coingecko.com/learn/what-is-fartcoin-ai-memecoin-crypto?locale=en", 0.95, 90_000]
  ] as const;

  return cases.map(([phrase, url, weight, traffic], index) => ({
    id: `fixture-trend:${index}`,
    source: "fixture-trends",
    phrase,
    observedAt,
    url,
    title: phrase,
    traffic,
    weight,
    geo: "US",
    raw: { fixture: true }
  }));
}

function fixtureEnricher(): Enricher {
  const at = (value: string) => new Date(value);
  const values: Record<string, Partial<TokenEnrichment>> = {
    MoonMint111111111111111111111111111111111111: {
      observedAt: at("2026-05-08T12:00:05.000Z"),
      priceSol: 0.00000062,
      liquidityUsd: 22_500,
      holderCount: 145,
      topHolderShare: 0.08,
      devHoldingShare: 0.02,
      insiderShare: 0.03,
      bundlerShare: 0.01,
      sniperShare: 0.04,
      organicScore: 0.76,
      sentimentKeywords: ["ai", "sol"],
      socialLinks: { x: "https://x.example/moonai" },
      raw: { fixture: true }
    },
    RugMint2222222222222222222222222222222222222: {
      observedAt: at("2026-05-08T12:05:05.000Z"),
      priceSol: 0.0000012,
      liquidityUsd: 4_000,
      holderCount: 22,
      topHolderShare: 0.34,
      devHoldingShare: 0.18,
      insiderShare: 0.22,
      bundlerShare: 0.19,
      sniperShare: 0.16,
      organicScore: 0.12,
      sentimentKeywords: [],
      socialLinks: {},
      raw: { fixture: true }
    }
  };
  return new StaticFixtureEnricher(values);
}

function loadWorkspaceEnv(): void {
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env"), resolve(process.cwd(), "../../.env")];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    config({ path, override: false });
    return;
  }
}
