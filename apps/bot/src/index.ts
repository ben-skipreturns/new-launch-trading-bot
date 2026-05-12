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
  EventProcessingPool,
  GeckoTerminalEnricher,
  HeuristicScorer,
  JsonlLaunchFeed,
  JupiterPriceEnricher,
  LivePositionSupervisor,
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
  buildMemeMatchSaturationContext,
  matcherCalibrationFixtures,
  runMatcherCalibration,
  type Enricher,
  type EventProcessingMetrics,
  type JsonValue,
  type LaunchEvent,
  type LaunchFeed,
  type PumpApiStreamStatusEvent,
  type Store,
  type StreamHealthRun,
  type StreamHealthStatus,
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
  .option("--trend-source <source>", "fixture or live trend topics", "fixture")
  .option("--enrichment-source <source>", "fixture or live token enrichment", "fixture")
  .action(async (options: ReplayOptions) => {
    const store = createStore(options.databaseUrl);
    try {
      const trendSource = parseReplaySourceOption(options.trendSource, "--trend-source");
      const enrichmentSource = parseReplaySourceOption(options.enrichmentSource, "--enrichment-source");
      if (trendSource === "fixture") await refreshTrends(store, fixtureTrendSources());
      else await refreshLiveTrendsOrFailWithTimeout(store);
      const result = await runReplay(options.fixture, store, enrichmentSource === "fixture" ? fixtureEnricher() : liveEnricher());
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
  .option("--trend-refresh-minutes <minutes>", "Refresh live trend topics while streaming", process.env.OPENAI_TREND_REFRESH_MINUTES ?? "15")
  .option("--position-check-seconds <seconds>", "Capture age/open-position snapshots while streaming", "30")
  .option("--stale-timeout-seconds <seconds>", "Reconnect PumpApi if no messages arrive for this long", "30")
  .option("--max-reconnects <count>", "Maximum PumpApi reconnect attempts during this run", "20")
  .option("--max-feed-queue <count>", "Maximum provider events buffered before reconnecting", process.env.PUMPAPI_MAX_FEED_QUEUE ?? "1000")
  .option(
    "--processing-concurrency <count>",
    "Concurrent live event processors, ordered per mint",
    process.env.LIVE_PROCESSING_CONCURRENCY ?? "4"
  )
  .option("--max-processing-queue <count>", "Maximum live events waiting for processors", process.env.LIVE_MAX_PROCESSING_QUEUE ?? "500")
  .option("--catch-up-limit <count>", "Persisted unscored launches to recover before live streaming", process.env.LIVE_CATCH_UP_LIMIT ?? "250")
  .option("--catch-up-hours <hours>", "Catch-up window for persisted unscored launches", process.env.LIVE_CATCH_UP_HOURS ?? "24")
  .option("--allow-empty-trends", "Continue live ingestion even when no active trend topics are available", false)
  .action(async (options: IngestOptions) => {
    if (options.source === "pumpapi" && !options.databaseUrl) throw new Error("DATABASE_URL is required for live pumpapi ingestion.");
    const store = createStore(options.databaseUrl);
    const health = options.source === "pumpapi" ? createStreamHealthRun(options.source) : undefined;
    const shutdown = createShutdownSignal();
    try {
      if (options.source === "fixture") {
        await refreshTrends(store, fixtureTrendSources());
        const result = await runReplay(options.fixture, store, fixtureEnricher());
        console.log(`Processed ${result.events} fixture events.`);
        return;
      }

      if (health) await store.upsertStreamHealthRun(health);
      await refreshLiveTrendsOrFailWithTimeout(store, { allowEmptyTopics: options.allowEmptyTrends, signal: shutdown.signal });
      const feed = createLaunchFeed(options.source, options.fixture, streamFeedOptions(options, store, health));
      const pipeline = createPipeline(store, liveEnricher());
      const durationMs = parsePositiveNumberOption(options.durationSeconds, "--duration-seconds") * 1000;
      const result = await runStreaming(feed, pipeline, durationMs, {
        store,
        health,
        trendRefreshMs: parsePositiveNumberOption(options.trendRefreshMinutes, "--trend-refresh-minutes") * 60 * 1000,
        positionCheckMs: parsePositiveNumberOption(options.positionCheckSeconds, "--position-check-seconds") * 1000,
        processingConcurrency: parsePositiveIntegerOption(options.processingConcurrency, "--processing-concurrency"),
        maxProcessingQueue: parsePositiveIntegerOption(options.maxProcessingQueue, "--max-processing-queue"),
        catchUpLimit: parseNonNegativeIntegerOption(options.catchUpLimit, "--catch-up-limit"),
        catchUpHours: parsePositiveNumberOption(options.catchUpHours, "--catch-up-hours"),
        allowEmptyTrends: options.allowEmptyTrends,
        signal: shutdown.signal
      });
      if (health) await finishStreamHealthRun(store, health, shutdown.signal.aborted ? "aborted" : "completed");
      console.log(`Processed ${result.events} live events.`);
    } catch (error) {
      const aborted = shutdown.signal.aborted && isAbortError(error);
      if (health) await finishStreamHealthRun(store, health, aborted ? "aborted" : "error", aborted ? undefined : error);
      if (aborted) {
        console.log("Live ingestion aborted.");
        return;
      }
      throw error;
    } finally {
      shutdown.dispose();
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
  .option("--stale-timeout-seconds <seconds>", "Reconnect PumpApi if no messages arrive for this long", "30")
  .option("--max-reconnects <count>", "Maximum PumpApi reconnect attempts during this run", "20")
  .option("--max-feed-queue <count>", "Maximum provider events buffered before reconnecting", process.env.PUMPAPI_MAX_FEED_QUEUE ?? "1000")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--persist", "Persist only raw create events and token_launches", false)
  .action(async (options: StreamTestOptions) => {
    if (options.persist && !options.databaseUrl) throw new Error("DATABASE_URL is required when using --persist.");
    const store = options.persist ? createStore(options.databaseUrl) : undefined;
    const health = createStreamHealthRun(options.source);
    const shutdown = createShutdownSignal();
    try {
      if (store) await store.upsertStreamHealthRun(health);
      const result = await runLaunchStreamTest(createLaunchFeed(options.source, options.fixture, streamFeedOptions(options, store, health)), {
        durationMs: parsePositiveNumberOption(options.durationSeconds, "--duration-seconds") * 1000,
        maxLaunches: parsePositiveIntegerOption(options.maxLaunches, "--max-launches"),
        store,
        health,
        signal: shutdown.signal
      });
      await finishStreamHealthRun(store, health, shutdown.signal.aborted ? "aborted" : "completed");
      console.log(
        `Stream test complete: ${result.events} events read, ${result.launches} launches, ${result.ignoredEvents} non-create events ignored, ${result.persistedLaunches} launches persisted, ${result.duplicateLaunches} duplicates, ${health?.parserRejects ?? 0} parser rejects, ${formatRate(health?.launchesPerMinute)} launches/min.`
      );
    } catch (error) {
      const aborted = shutdown.signal.aborted && isAbortError(error);
      await finishStreamHealthRun(store, health, aborted ? "aborted" : "error", aborted ? undefined : error);
      if (aborted) {
        console.log("Stream test aborted.");
        return;
      }
      throw error;
    } finally {
      shutdown.dispose();
      if (store) await closeStore(store);
    }
  });

program
  .command("trend-refresh")
  .description("Run the OpenAI meme trend radar and store active meme/current-event topics.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--fixture", "Use fixture trend observations instead of live web sources", false)
  .option("--allow-empty-trends", "Exit successfully even when no active trend topics are available", false)
  .action(async (options: { databaseUrl?: string; fixture: boolean; allowEmptyTrends: boolean }) => {
    if (!options.fixture && !options.databaseUrl) throw new Error("DATABASE_URL is required for live trend-refresh.");
    const store = createStore(options.databaseUrl);
    const shutdown = createShutdownSignal();
    try {
      const result = options.fixture
        ? await refreshTrends(store, fixtureTrendSources())
        : await refreshLiveTrendsOrFailWithTimeout(store, { allowEmptyTopics: options.allowEmptyTrends, signal: shutdown.signal });
      if (shutdown.signal.aborted) {
        console.log("Trend refresh aborted.");
        return;
      }
      console.log(`Stored ${result.observations.length} trend observations and ${result.topics.length} topics.`);
      if (!options.fixture) await printLatestTrendRefreshRun(store);
    } catch (error) {
      if (shutdown.signal.aborted && isAbortError(error)) {
        console.log("Trend refresh aborted.");
        return;
      }
      throw error;
    } finally {
      shutdown.dispose();
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
      const match = await createTokenMemeMatcher(minScore, options.fixtureTopics).match({ launch, topics, observedAt });

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
      const launches = await store.listTokenLaunches({ createdAfter: since, limit, order: "desc" });

      const matcher = createTokenMemeMatcher(minScore, options.fixtureTopics);
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
        const saturation = await buildMemeMatchSaturationContext(store, launch, observedAt);
        const match = await matcher.match({ launch, topics, enrichment, saturation, observedAt });
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
  .option("--stale-timeout-seconds <seconds>", "Reconnect PumpApi if no messages arrive for this long", "30")
  .option("--max-reconnects <count>", "Maximum PumpApi reconnect attempts during this run", "20")
  .option("--max-feed-queue <count>", "Maximum provider events buffered before reconnecting", process.env.PUMPAPI_MAX_FEED_QUEUE ?? "1000")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--fixture-topics", "Use bundled fixture topics instead of active database topics", false)
  .option("--refresh-trends", "Refresh trend topics at startup before matching", false)
  .option("--allow-empty-trends", "Continue matching even when no active trend topics are available", false)
  .option("--dry-run", "Print match results without writing raw events, launches, enrichments, or matches", false)
  .option("--skip-metadata", "Skip token URI metadata fetching before matching", false)
  .option("--metadata-timeout-ms <milliseconds>", "Per-token metadata fetch timeout", "2500")
  .option("--min-score <score>", "Meme relevance threshold", "0.7")
  .action(async (options: MatchStreamOptions) => {
    if (!options.databaseUrl && !(options.dryRun && options.fixtureTopics)) {
      throw new Error("DATABASE_URL is required for match-stream unless --dry-run and --fixture-topics are both used.");
    }

    const store = createStore(options.databaseUrl);
    const health = !options.dryRun ? createStreamHealthRun(options.source) : undefined;
    const shutdown = createShutdownSignal();
    try {
      if (health) await store.upsertStreamHealthRun(health);
      const result = await runMatchStream(
        createLaunchFeed(options.source, options.fixture, streamFeedOptions(options, store, health)),
        store,
        options,
        health,
        shutdown.signal
      );
      if (health) await finishStreamHealthRun(store, health, shutdown.signal.aborted ? "aborted" : "completed");
      console.log(
        `Match stream complete: ${result.events} events read, ${result.launches} launches, ${result.matched} matched (${result.passed} pass, ${result.rejected} reject), ${result.persisted} persisted, ${result.duplicateLaunches} duplicates, ${health?.parserRejects ?? 0} parser rejects, ${formatRate(health?.launchesPerMinute)} launches/min.`
      );
    } catch (error) {
      const aborted = shutdown.signal.aborted && isAbortError(error);
      if (health) await finishStreamHealthRun(store, health, aborted ? "aborted" : "error", aborted ? undefined : error);
      if (aborted) {
        console.log("Match stream aborted.");
        return;
      }
      throw error;
    } finally {
      shutdown.dispose();
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
    if (!options.databaseUrl) throw new Error("DATABASE_URL is required for meme-report.");
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
  .command("match-calibration")
  .description("Run deterministic token matcher calibration fixtures and write a Markdown report.")
  .option("--report <path>", "Report path", "reports/matcher-calibration.md")
  .option("--min-score <score>", "Meme relevance threshold", "0.7")
  .option("--fail-on-mismatch", "Exit non-zero if any calibration fixture fails its expected outcome", false)
  .action(async (options: { report: string; minScore: string; failOnMismatch: boolean }) => {
    const minScore = parseNumberOption(options.minScore, "--min-score");
    const run = await runMatcherCalibration(matcherCalibrationFixtures, { minScore });
    await writeText(options.report, formatMatcherCalibrationReport(run));
    console.log(
      `Matcher calibration complete: ${run.summary.passedExpectations}/${run.summary.total} expectations passed, ${run.summary.failedExpectations} failed.`
    );
    console.log(`Report written to ${resolve(options.report)}.`);
    if (options.failOnMismatch && run.summary.failedExpectations > 0) process.exitCode = 1;
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
      if (!options.databaseUrl) throw new Error("DATABASE_URL is required for retention-prune.");
      const store = createStore(options.databaseUrl);
      try {
        const rejectedRawRetentionHours = parsePositiveNumberOption(options.rejectedHours, "--rejected-hours");
        const interestingRawRetentionDays = parsePositiveNumberOption(options.interestingDays, "--interesting-days");
        const rawLaunchRetentionHours = parsePositiveNumberOption(options.rawLaunchHours, "--raw-launch-hours");
        const matchedLaunchRetentionDays = parsePositiveNumberOption(options.matchedLaunchDays, "--matched-launch-days");
        const rejectedLaunchRetentionDays = parsePositiveNumberOption(options.rejectedLaunchDays, "--rejected-launch-days");
        const result = await store.pruneRetention({
          now: new Date(),
          rejectedRawRetentionHours,
          interestingRawRetentionDays,
          pruneLaunches: options.pruneLaunches,
          rawLaunchRetentionHours,
          matchedLaunchRetentionDays,
          rejectedLaunchRetentionDays,
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

interface IngestOptions {
  source: string;
  fixture: string;
  durationSeconds: string;
  databaseUrl?: string;
  trendRefreshMinutes: string;
  positionCheckSeconds: string;
  staleTimeoutSeconds: string;
  maxReconnects: string;
  maxFeedQueue: string;
  processingConcurrency: string;
  maxProcessingQueue: string;
  catchUpLimit: string;
  catchUpHours: string;
  allowEmptyTrends: boolean;
}

interface ReplayOptions {
  fixture: string;
  report: string;
  databaseUrl?: string;
  trendSource: string;
  enrichmentSource: string;
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
  staleTimeoutSeconds: string;
  maxReconnects: string;
  maxFeedQueue: string;
  databaseUrl?: string;
  fixtureTopics: boolean;
  refreshTrends: boolean;
  allowEmptyTrends: boolean;
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
  staleTimeoutSeconds: string;
  maxReconnects: string;
  maxFeedQueue: string;
  databaseUrl?: string;
  persist: boolean;
}

interface PumpApiFeedCliOptions {
  staleTimeoutMs?: number;
  maxReconnects?: number;
  maxQueueSize?: number;
  onStatus?: (event: PumpApiStreamStatusEvent) => void;
}

function streamFeedOptions(
  options: Pick<StreamTestOptions | MatchStreamOptions | IngestOptions, "staleTimeoutSeconds" | "maxReconnects" | "maxFeedQueue">,
  store?: Store,
  health?: StreamHealthRun
): PumpApiFeedCliOptions {
  return {
    staleTimeoutMs: parsePositiveNumberOption(options.staleTimeoutSeconds, "--stale-timeout-seconds") * 1000,
    maxReconnects: parsePositiveIntegerOption(options.maxReconnects, "--max-reconnects"),
    maxQueueSize: parsePositiveIntegerOption(options.maxFeedQueue, "--max-feed-queue"),
    onStatus: health ? createStreamStatusHandler(store, health) : undefined
  };
}

function createStreamHealthRun(source: string): StreamHealthRun {
  const startedAt = new Date();
  return {
    id: `stream:${source}:${startedAt.toISOString()}:${Math.random().toString(36).slice(2, 8)}`,
    source,
    startedAt,
    status: "running",
    eventsRead: 0,
    launchesRead: 0,
    duplicateLaunches: 0,
    parserRejects: 0,
    reconnects: 0,
    staleWarnings: 0,
    eventsPerMinute: 0,
    launchesPerMinute: 0,
    duplicateRate: 0,
    parserRejectRate: 0,
    raw: { statusEvents: [] }
  };
}

interface ShutdownSignal {
  signal: AbortSignal;
  dispose(): void;
}

function createShutdownSignal(): ShutdownSignal {
  const controller = new AbortController();
  let aborting = false;
  const handleSignal = (signalName: NodeJS.Signals) => {
    if (aborting) process.exit(shutdownExitCode(signalName));
    aborting = true;
    process.exitCode = shutdownExitCode(signalName);
    console.error(`Received ${signalName}; shutting down gracefully.`);
    controller.abort();
  };
  const onSigint = () => handleSignal("SIGINT");
  const onSigterm = () => handleSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return {
    signal: controller.signal,
    dispose() {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    }
  };
}

function shutdownExitCode(signalName: NodeJS.Signals): number {
  return signalName === "SIGINT" ? 130 : 143;
}

function createStreamStatusHandler(store: Store | undefined, health: StreamHealthRun): (event: PumpApiStreamStatusEvent) => void {
  return (event) => {
    if (event.type === "connected") {
      health.connectedAt ??= event.at;
      health.status = "running";
    }
    if (event.type === "disconnected") health.disconnectedAt = event.at;
    if (event.type === "reconnecting") health.reconnects += 1;
    if (event.type === "parser_reject") {
      health.parserRejects += 1;
      appendParserRejectSample(health, event);
    }
    if (event.type === "stale") {
      health.staleWarnings += 1;
      health.status = "stale";
    }
    if (event.type === "error") {
      health.errorText = event.errorText;
      health.status = "error";
    }
    if (event.type === "queue_overflow") {
      health.errorText = event.errorText;
      health.status = "error";
    }
    if (event.lastEventAt) health.lastEventAt = event.lastEventAt;
    updateStreamHealthMetrics(health);
    appendStreamRawStatus(health, event);
    scheduleStreamHealthPersist(store, health);
  };
}

interface StreamHealthPersistState {
  timeout?: NodeJS.Timeout;
  inFlight?: Promise<void>;
  pending: boolean;
}

const streamHealthPersistStates = new WeakMap<StreamHealthRun, StreamHealthPersistState>();
const STREAM_HEALTH_FLUSH_MS = 1000;

function streamHealthPersistState(health: StreamHealthRun): StreamHealthPersistState {
  let state = streamHealthPersistStates.get(health);
  if (!state) {
    state = { pending: false };
    streamHealthPersistStates.set(health, state);
  }
  return state;
}

function scheduleStreamHealthPersist(store: Store | undefined, health: StreamHealthRun | undefined, delayMs = STREAM_HEALTH_FLUSH_MS): void {
  if (!store || !health) return;
  const state = streamHealthPersistState(health);
  state.pending = true;
  if (state.timeout) return;
  state.timeout = setTimeout(() => {
    state.timeout = undefined;
    void flushStreamHealthPersist(store, health).catch(() => undefined);
  }, delayMs);
}

async function flushStreamHealthPersist(store: Store, health: StreamHealthRun): Promise<void> {
  const state = streamHealthPersistState(health);
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = undefined;
  }
  if (state.inFlight) {
    state.pending = true;
    await state.inFlight.catch(() => undefined);
    return;
  }

  state.pending = false;
  state.inFlight = store.upsertStreamHealthRun(health);
  try {
    await state.inFlight;
  } finally {
    state.inFlight = undefined;
    if (state.pending) scheduleStreamHealthPersist(store, health, 0);
  }
}

async function persistStreamHealthNow(store: Store | undefined, health: StreamHealthRun): Promise<void> {
  if (!store) return;
  const state = streamHealthPersistState(health);
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = undefined;
  }
  state.pending = false;
  if (state.inFlight) await state.inFlight.catch(() => undefined);
  await store.upsertStreamHealthRun(health);
}

async function recordStreamHealthEvent(
  store: Store | undefined,
  health: StreamHealthRun | undefined,
  event: LaunchEvent,
  duplicateLaunch: boolean
): Promise<void> {
  if (!health) return;
  health.eventsRead += 1;
  health.lastEventAt = event.timestamp;
  if (event.tokenLaunch) {
    health.launchesRead += 1;
    if (duplicateLaunch) health.duplicateLaunches += 1;
    appendAcceptedCreateSample(health, event);
  }
  if (health.status === "stale") health.status = "running";
  updateStreamHealthMetrics(health);
  scheduleStreamHealthPersist(store, health);
}

async function finishStreamHealthRun(
  store: Store | undefined,
  health: StreamHealthRun,
  status: Exclude<StreamHealthStatus, "running" | "stale">,
  error?: unknown
): Promise<void> {
  health.status = status;
  health.disconnectedAt = new Date();
  if (error) health.errorText = error instanceof Error ? error.message : String(error);
  updateStreamHealthMetrics(health);
  await persistStreamHealthNow(store, health);
}

async function isDuplicateLaunch(store: Store | undefined, seenLaunches: Set<string>, launch: TokenLaunch): Promise<boolean> {
  const seen = seenLaunches.has(launch.mint);
  seenLaunches.add(launch.mint);
  if (seen) return true;
  if (!store) return false;
  return Boolean(await store.getTokenLaunch(launch.mint));
}

function appendStreamRawStatus(health: StreamHealthRun, event: PumpApiStreamStatusEvent): void {
  const raw = isJsonRecord(health.raw) ? health.raw : {};
  const existing = Array.isArray(raw.statusEvents) ? raw.statusEvents : [];
  const nextEvent: Record<string, JsonValue> = {
    type: event.type,
    at: event.at.toISOString()
  };
  if (event.attempt !== undefined) nextEvent.attempt = event.attempt;
  if (event.delayMs !== undefined) nextEvent.delayMs = event.delayMs;
  if (event.lastEventAt) nextEvent.lastEventAt = event.lastEventAt.toISOString();
  if (event.errorText) nextEvent.errorText = event.errorText;
  if (event.parserRejectReason) nextEvent.parserRejectReason = event.parserRejectReason;
  health.raw = {
    ...raw,
    statusEvents: [...existing.slice(-24), nextEvent]
  };
}

function appendAcceptedCreateSample(health: StreamHealthRun, event: LaunchEvent): void {
  if (!event.tokenLaunch) return;
  appendStreamSample(health, "acceptedCreateSamples", {
    at: new Date().toISOString(),
    signature: event.signature,
    mint: event.tokenLaunch.mint,
    name: event.tokenLaunch.name ?? null,
    symbol: event.tokenLaunch.symbol ?? null,
    payload: compactJsonValue(event.raw)
  });
}

function appendParserRejectSample(health: StreamHealthRun, event: PumpApiStreamStatusEvent): void {
  appendStreamSample(health, "parserRejectSamples", {
    at: event.at.toISOString(),
    reason: event.parserRejectReason ?? "unknown",
    errorText: event.errorText ?? null,
    payload: event.payload ? compactJsonValue(event.payload) : null,
    payloadText: event.payloadText ?? null
  });
}

function appendStreamSample(health: StreamHealthRun, key: "acceptedCreateSamples" | "parserRejectSamples", sample: Record<string, JsonValue>): void {
  const raw = isJsonRecord(health.raw) ? health.raw : {};
  const existing = Array.isArray(raw[key]) ? raw[key] : [];
  health.raw = {
    ...raw,
    [key]: [...existing.slice(-9), sample]
  };
}

function updateStreamHealthMetrics(health: StreamHealthRun): void {
  const elapsedMinutes = Math.max((Date.now() - health.startedAt.getTime()) / 60_000, 1 / 60);
  const totalProviderMessages = health.eventsRead + health.parserRejects;
  health.eventsPerMinute = roundMetric(health.eventsRead / elapsedMinutes);
  health.launchesPerMinute = roundMetric(health.launchesRead / elapsedMinutes);
  health.duplicateRate = roundMetric(health.launchesRead > 0 ? health.duplicateLaunches / health.launchesRead : 0);
  health.parserRejectRate = roundMetric(totalProviderMessages > 0 ? health.parserRejects / totalProviderMessages : 0);
  const raw = isJsonRecord(health.raw) ? health.raw : {};
  health.raw = {
    ...raw,
    metrics: {
      eventsPerMinute: health.eventsPerMinute,
      launchesPerMinute: health.launchesPerMinute,
      duplicateRate: health.duplicateRate,
      parserRejectRate: health.parserRejectRate
    }
  };
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

function compactJsonValue(value: JsonValue, depth = 0): JsonValue {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length <= 500 ? value : `${value.slice(0, 500)}...`;
  if (Array.isArray(value)) return depth >= 3 ? `[${value.length} items]` : value.slice(0, 20).map((item) => compactJsonValue(item, depth + 1));
  const out: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value).slice(0, 40)) out[key] = compactJsonValue(item, depth + 1);
  return out;
}

function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function runLaunchStreamTest(
  feed: LaunchFeed,
  options: { durationMs: number; maxLaunches: number; store?: Store; health?: StreamHealthRun; signal?: AbortSignal }
): Promise<{ events: number; launches: number; ignoredEvents: number; persistedLaunches: number; duplicateLaunches: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.durationMs);
  const abortFromParent = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abortFromParent, { once: true });
  const seenLaunches = new Set<string>();
  let events = 0;
  let launches = 0;
  let ignoredEvents = 0;
  let persistedLaunches = 0;
  let duplicateLaunches = 0;

  try {
    for await (const event of feed.stream(controller.signal)) {
      events += 1;
      if (!event.tokenLaunch) {
        await recordStreamHealthEvent(options.store, options.health, event, false);
        ignoredEvents += 1;
        continue;
      }

      const duplicate = await isDuplicateLaunch(options.store, seenLaunches, event.tokenLaunch);
      if (duplicate) duplicateLaunches += 1;
      await recordStreamHealthEvent(options.store, options.health, event, duplicate);
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
    options.signal?.removeEventListener("abort", abortFromParent);
  }

  return { events, launches, ignoredEvents, persistedLaunches, duplicateLaunches };
}

async function runMatchStream(
  feed: LaunchFeed,
  store: Store,
  options: MatchStreamOptions,
  health?: StreamHealthRun,
  signal?: AbortSignal
): Promise<{ events: number; launches: number; matched: number; passed: number; rejected: number; persisted: number; duplicateLaunches: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), parsePositiveNumberOption(options.durationSeconds, "--duration-seconds") * 1000);
  const abortFromParent = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromParent, { once: true });
  try {
    const observedAt = new Date();
    const topicStore = options.fixtureTopics && options.dryRun ? new MemoryStore() : store;
    if (options.fixtureTopics) {
      await refreshTrends(topicStore, fixtureTrendSources());
    } else if (options.refreshTrends) {
      await refreshLiveTrendsOrFailWithTimeout(store, { allowEmptyTopics: options.allowEmptyTrends, signal: controller.signal });
    }
    const topics = await listTopicsForMatching(topicStore, options.fixtureTopics, observedAt);
    const matcher = createTokenMemeMatcher(parseNumberOption(options.minScore, "--min-score"), options.fixtureTopics);
    const metadataTimeoutMs = parsePositiveIntegerOption(options.metadataTimeoutMs, "--metadata-timeout-ms");
    const maxLaunches = parsePositiveIntegerOption(options.maxLaunches, "--max-launches");
    const seenLaunches = new Set<string>();
    let events = 0;
    let launches = 0;
    let matched = 0;
    let passed = 0;
    let rejected = 0;
    let persisted = 0;
    let duplicateLaunches = 0;

    for await (const event of feed.stream(controller.signal)) {
      events += 1;
      if (!event.tokenLaunch) {
        await recordStreamHealthEvent(options.dryRun ? undefined : store, health, event, false);
        continue;
      }

      const duplicate = await isDuplicateLaunch(options.dryRun ? undefined : store, seenLaunches, event.tokenLaunch);
      if (duplicate) duplicateLaunches += 1;
      await recordStreamHealthEvent(options.dryRun ? undefined : store, health, event, duplicate);
      launches += 1;
      if (!options.dryRun) {
        await store.upsertRawEvent(event);
        await store.upsertTokenLaunch(event.tokenLaunch);
      }

      const enrichment = await getMatchingEnrichment(store, event.tokenLaunch, {
        fetchMetadata: !options.skipMetadata,
        persist: !options.dryRun,
        timeoutMs: metadataTimeoutMs,
        signal: controller.signal
      });
      const saturation = await buildMemeMatchSaturationContext(store, event.tokenLaunch, event.timestamp);
      const match = await matcher.match({ launch: event.tokenLaunch, topics, enrichment, saturation, observedAt: event.timestamp });
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

    if (topics.length === 0) {
      console.log("No topics were available. Run trend-refresh first, use --refresh-trends, or use --fixture-topics for a deterministic check.");
    }
    return { events, launches, matched, passed, rejected, persisted, duplicateLaunches };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function createLaunchFeed(source: string, fixturePath: string, options?: PumpApiFeedCliOptions): LaunchFeed {
  if (source === "fixture") return new JsonlLaunchFeed(fixturePath);
  if (source === "pumpapi") {
    return new PumpApiLaunchFeed({
      staleTimeoutMs: options?.staleTimeoutMs,
      maxReconnects: options?.maxReconnects,
      maxQueueSize: options?.maxQueueSize,
      onStatus: options?.onStatus
    });
  }
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

function formatMatcherCalibrationReport(run: Awaited<ReturnType<typeof runMatcherCalibration>>): string {
  const lines = [
    "# Matcher Calibration",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Total fixtures: ${run.summary.total}`,
    `- Expected passes: ${run.summary.expectedPasses}`,
    `- Expected rejects: ${run.summary.expectedRejects}`,
    `- Passed expectations: ${run.summary.passedExpectations}`,
    `- Failed expectations: ${run.summary.failedExpectations}`,
    "",
    "## Fixtures",
    "",
    "| Result | Expected | Actual | Score | Fixture | Topic | Reject flags |",
    "| --- | --- | --- | ---: | --- | --- | --- |"
  ];
  for (const result of run.results) {
    const actual = result.match.rejectFlags.length === 0 ? "pass" : "reject";
    lines.push(
      [
        result.passedExpectation ? "ok" : "fail",
        result.fixture.expected,
        actual,
        result.match.memeRelevanceScore.toFixed(3),
        escapeMarkdownTableCell(result.fixture.id),
        escapeMarkdownTableCell(result.match.canonicalPhrase ?? "none"),
        escapeMarkdownTableCell(result.match.rejectFlags.join(", ") || "none")
      ].join(" | ").replace(/^/, "| ") + " |"
    );
  }
  lines.push("");
  return lines.join("\n");
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function getMatchingEnrichment(
  store: Store,
  launch: TokenLaunch,
  options: { fetchMetadata: boolean; persist: boolean; timeoutMs: number; signal?: AbortSignal }
): Promise<TokenEnrichment | null> {
  const existing = await store.getLatestEnrichment(launch.mint);
  if (!options.fetchMetadata) return existing ?? null;
  if (hasMetadataEnrichment(existing)) return existing ?? null;

  try {
    const metadata = await new TokenMetadataEnricher({ timeoutMs: options.timeoutMs }).enrich(launch, options.signal);
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

function createTokenMemeMatcher(minScore: number, fixtureTopics = false): TokenMemeMatcher {
  return new TokenMemeMatcher({
    minScore,
    activeTopicWindowMs: fixtureTopics ? null : undefined
  });
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

function parseNonNegativeIntegerOption(value: string, name: string): number {
  const parsed = parseNumberOption(value, name);
  if (parsed < 0 || !Number.isInteger(parsed)) throw new Error(`${name} must be a non-negative integer.`);
  return parsed;
}

function parseReplaySourceOption(value: string, name: string): "fixture" | "live" {
  if (value === "fixture" || value === "live") return value;
  throw new Error(`${name} must be "fixture" or "live".`);
}

function formatRate(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "0.000";
  return value.toFixed(3);
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

async function runStreaming(
  feed: LaunchFeed,
  pipeline: TradingPipeline,
  durationMs: number,
  options: LiveStreamingOptions = {}
): Promise<{ events: number }> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abortFromParent, { once: true });
  let timeout: NodeJS.Timeout | undefined;
  const stopBackgroundWork: BackgroundLoopHandle[] = [];
  let runFailure: unknown;
  const failRun = (error: unknown) => {
    if (!runFailure) runFailure = error;
    controller.abort();
  };
  let events = 0;
  const seenLaunches = new Set<string>();
  try {
    if (options.store && options.catchUpLimit && options.catchUpLimit > 0) {
      const result = await catchUpUnscoredLaunches(options.store, pipeline, {
        limit: options.catchUpLimit,
        since: new Date(Date.now() - (options.catchUpHours ?? 24) * 60 * 60 * 1000),
        signal: controller.signal
      });
      if (result.processed > 0 || result.inspected > 0) {
        console.log(
          `Catch-up inspected ${result.inspected} persisted unscored launches and recovered ${result.processed} score snapshots.`
        );
      }
    }

    timeout = setTimeout(() => controller.abort(), durationMs);
    const processor = new EventProcessingPool({
      concurrency: options.processingConcurrency ?? 1,
      maxQueuedEvents: options.maxProcessingQueue ?? 100,
      onFailure: (error) => {
        console.error(`event processing failed: ${error instanceof Error ? error.message : String(error)}`);
        failRun(error);
      },
      onMetrics: (metrics) => updateStreamProcessingHealth(options.store, options.health, metrics)
    });
    if (options.store) {
      const supervisor = new LivePositionSupervisor(options.store, pipeline, {
        openPositionSnapshotIntervalMs: options.positionCheckMs
      });
      stopBackgroundWork.push(
        startBackgroundLoop("position-supervisor", options.positionCheckMs ?? 30_000, (signal) => supervisor.captureDueSnapshots(new Date(), signal), controller, {
          onFailure: failRun
        })
      );
    }
    if (options.store && options.trendRefreshMs) {
      stopBackgroundWork.push(
        startBackgroundLoop(
          "trend-refresh",
          options.trendRefreshMs,
          (signal) => refreshLiveTrendsOrFailWithTimeout(options.store as Store, { allowEmptyTopics: options.allowEmptyTrends, signal }),
          controller,
          { runImmediately: false, onFailure: failRun }
        )
      );
    }

    try {
      for await (const event of feed.stream(controller.signal)) {
        const duplicateLaunch = event.tokenLaunch ? await isDuplicateLaunch(options.store, seenLaunches, event.tokenLaunch) : false;
        await recordStreamHealthEvent(options.store, options.health, event, duplicateLaunch);
        if (options.store) {
          await options.store.upsertRawEvent(event);
          if (event.tokenLaunch) await options.store.upsertTokenLaunch(event.tokenLaunch);
        }
        await processor.add(event.mint ?? event.tokenLaunch?.mint ?? event.tradeEvent?.mint ?? event.signature, () =>
          pipeline.processEvent(event, {
            rawEventAlreadyStored: Boolean(options.store),
            signal: controller.signal
          })
        );
        events += 1;
      }
    } catch (error) {
      failRun(error);
    } finally {
      await Promise.all(stopBackgroundWork.map((loop) => loop.stop().catch((error) => failRun(error))));
      try {
        await processor.drain();
      } catch (error) {
        failRun(error);
      }
    }
    if (runFailure) throw runFailure;
  } finally {
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
    await Promise.all(stopBackgroundWork.map((loop) => loop.stop().catch(() => undefined)));
  }
  return { events };
}

interface CatchUpResult {
  inspected: number;
  processed: number;
}

async function catchUpUnscoredLaunches(
  store: Store,
  pipeline: TradingPipeline,
  options: { limit: number; since: Date; signal?: AbortSignal }
): Promise<CatchUpResult> {
  const launches = await store.listUnscoredTokenLaunches({ createdAfter: options.since, limit: options.limit, order: "asc" });
  let processed = 0;
  for (const launch of launches) {
    if (options.signal?.aborted) break;
    const event = buildCatchUpLaunchEvent(launch, new Date());
    const score = await pipeline.processEvent(event, {
      rawEventAlreadyStored: true,
      signal: options.signal
    });
    if (score) processed += 1;
  }
  return { inspected: launches.length, processed };
}

function buildCatchUpLaunchEvent(launch: TokenLaunch, observedAt: Date): LaunchEvent {
  return {
    eventType: "create",
    source: launch.source,
    signature: `catch-up:${launch.signature}`,
    mint: launch.mint,
    pool: launch.pool,
    timestamp: observedAt,
    tokenLaunch: launch,
    raw: {
      catchUp: true,
      originalSignature: launch.signature,
      launchCreatedAt: launch.createdAt.toISOString()
    }
  };
}

interface LiveStreamingOptions {
  store?: Store;
  health?: StreamHealthRun;
  trendRefreshMs?: number;
  positionCheckMs?: number;
  processingConcurrency?: number;
  maxProcessingQueue?: number;
  allowEmptyTrends?: boolean;
  catchUpLimit?: number;
  catchUpHours?: number;
  signal?: AbortSignal;
}

function updateStreamProcessingHealth(store: Store | undefined, health: StreamHealthRun | undefined, metrics: EventProcessingMetrics): void {
  if (!health) return;
  const raw = isJsonRecord(health.raw) ? health.raw : {};
  health.raw = {
    ...raw,
    processing: {
      active: metrics.active,
      queued: metrics.queued,
      concurrency: metrics.concurrency,
      maxQueuedEvents: metrics.maxQueuedEvents,
      oldestQueuedMs: metrics.oldestQueuedMs
    }
  };
  scheduleStreamHealthPersist(store, health);
}

interface BackgroundLoopHandle {
  stop(): Promise<void>;
}

function startBackgroundLoop(
  name: string,
  intervalMs: number,
  task: (signal: AbortSignal) => Promise<unknown>,
  controller: AbortController,
  options: { runImmediately?: boolean; onFailure?: (error: unknown) => void; stopTimeoutMs?: number } = {}
): BackgroundLoopHandle {
  let stopped = false;
  let running: Promise<void> | undefined;
  let runController: AbortController | undefined;
  let stopPromise: Promise<void> | undefined;
  const stopTimeoutMs = options.stopTimeoutMs ?? Math.max(5_000, Math.min(intervalMs, 30_000));
  const run = () => {
    if (running || stopped || controller.signal.aborted) return;
    const taskController = new AbortController();
    runController = taskController;
    const abortFromParent = () => taskController.abort();
    controller.signal.addEventListener("abort", abortFromParent, { once: true });
    if (controller.signal.aborted) taskController.abort();
    running = (async () => {
      try {
        await task(taskController.signal);
      } catch (error) {
        if (taskController.signal.aborted && isAbortError(error)) return;
        console.error(`${name} failed: ${error instanceof Error ? error.message : String(error)}`);
        options.onFailure?.(error);
        controller.abort();
      } finally {
        controller.signal.removeEventListener("abort", abortFromParent);
        running = undefined;
        if (runController === taskController) runController = undefined;
      }
    })();
  };
  const timer = setInterval(() => void run(), intervalMs);
  if (options.runImmediately ?? true) void run();
  return {
    async stop() {
      stopPromise ??= (async () => {
        stopped = true;
        clearInterval(timer);
        runController?.abort();
        if (running) await waitWithTimeout(running, stopTimeoutMs, `${name} did not stop within ${stopTimeoutMs}ms.`);
      })();
      await stopPromise;
    }
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));
}

async function waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
  const files = [
    "migrations/001_initial_schema.sql",
    "migrations/002_launch_readiness_indexes.sql",
    "migrations/003_live_launch_hardening.sql",
    "migrations/004_latest_launch_state.sql",
    "migrations/005_trend_refresh_run_leases.sql"
  ];
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

async function refreshLiveTrendsOrFail(store: Store, options: { allowEmptyTopics?: boolean; signal?: AbortSignal } = {}) {
  const result = await new MemeTrendEngine(store, liveTrendSources(store), { failOnAllSourcesError: true }).refresh(options.signal);
  if (!options.allowEmptyTopics) await assertActiveTrendTopics(store);
  return result;
}

async function refreshLiveTrendsOrFailWithTimeout(
  store: Store,
  options: { allowEmptyTopics?: boolean; signal?: AbortSignal; timeoutMs?: number } = {}
) {
  const timeoutMs = options.timeoutMs ?? numberEnv("LIVE_TREND_REFRESH_TIMEOUT_MS", 60_000);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromParent = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    return await refreshLiveTrendsOrFail(store, {
      allowEmptyTopics: options.allowEmptyTopics,
      signal: controller.signal
    });
  } catch (error) {
    if (timedOut && isAbortError(error)) throw new Error(`Live trend refresh did not complete within ${timeoutMs}ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

async function assertActiveTrendTopics(store: Store): Promise<void> {
  const activeSince = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const topics = await store.listTrendTopics(activeSince, 1);
  if (topics.length === 0) {
    throw new Error("No active trend topics are available; refusing to continue live mode without --allow-empty-trends.");
  }
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
  return new CompositeEnricher(
    [new TokenMetadataEnricher(), new DexScreenerEnricher(), new JupiterPriceEnricher(), new GeckoTerminalEnricher(), new BirdeyeEnricher()],
    {
      perProviderTimeoutMs: numberEnv("LIVE_ENRICHER_TIMEOUT_MS", 3000)
    }
  );
}

function liveTrendSources(store: Store): TrendSource[] {
  return [new OpenAiMemeTrendSource({ store })];
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
