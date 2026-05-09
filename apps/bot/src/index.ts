#!/usr/bin/env node
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import {
  BirdeyeEnricher,
  CompositeEnricher,
  DefaultFeatureExtractor,
  DefaultPaperBroker,
  DexScreenerEnricher,
  GdeltDocTrendSource,
  GeckoTerminalEnricher,
  GoogleTrendsRssSource,
  HeuristicScorer,
  JsonlLaunchFeed,
  MemeTrendEngine,
  MemoryStore,
  PostgresStore,
  PumpApiLaunchFeed,
  RssTrendSource,
  ReplayRunner,
  StaticFixtureEnricher,
  StaticTrendSource,
  TokenMemeMatcher,
  TradingPipeline,
  generateDailyReport,
  generateMemeReport,
  type Enricher,
  type LaunchFeed,
  type Store,
  type TokenEnrichment,
  type TrendObservation,
  type TrendSource
} from "@moonshot/core";

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
      await refreshTrends(store, options.fixture.includes("fixture") ? fixtureTrendSources() : liveTrendSources());
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

      await refreshTrends(store, liveTrendSources());
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
  .command("trend-refresh")
  .description("Poll free trend sources and store active meme/current-event topics.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--fixture", "Use fixture trend observations instead of live web sources", false)
  .action(async (options: { databaseUrl?: string; fixture: boolean }) => {
    const store = createStore(options.databaseUrl);
    try {
      const result = await refreshTrends(store, options.fixture ? fixtureTrendSources() : liveTrendSources());
      console.log(`Stored ${result.observations.length} trend observations and ${result.topics.length} topics.`);
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
  .description("Delete expired raw/trade events while keeping durable launch, feature, score, paper, and meme-match data.")
  .option("--database-url <url>", "Postgres connection string", process.env.DATABASE_URL)
  .option("--rejected-hours <hours>", "Raw retention for rejected/uninteresting launches", "48")
  .option("--interesting-days <days>", "Raw retention for watch/paper-buy launches", "14")
  .option("--dry-run", "Count rows that would be deleted without deleting", false)
  .action(async (options: { databaseUrl?: string; rejectedHours: string; interestingDays: string; dryRun: boolean }) => {
    const store = createStore(options.databaseUrl);
    try {
      const result = await store.pruneRetention({
        now: new Date(),
        rejectedRawRetentionHours: Number(options.rejectedHours),
        interestingRawRetentionDays: Number(options.interestingDays),
        dryRun: options.dryRun
      });
      console.log(
        `${options.dryRun ? "Would delete" : "Deleted"} ${result.rawEventsDeleted} raw events and ${
          result.tradeEventsDeleted
        } trade events.`
      );
    } finally {
      await closeStore(store);
    }
  });

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

function liveEnricher(): Enricher {
  return new CompositeEnricher([new DexScreenerEnricher(), new GeckoTerminalEnricher(), new BirdeyeEnricher()]);
}

function liveTrendSources(): TrendSource[] {
  const rssUrls = (process.env.MEME_RSS_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  return [
    new GoogleTrendsRssSource(process.env.GOOGLE_TRENDS_RSS_URL),
    new GdeltDocTrendSource(),
    ...(rssUrls.length > 0 ? [new RssTrendSource("configured-rss", rssUrls)] : [])
  ];
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
