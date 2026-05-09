# Solana New-Launch Moonshot Paper Trader

Dry-run TypeScript bot for researching new Solana launchpad tokens, starting with Pump.fun-style event streams. The first version stores raw events, derives time-bounded features, scores candidates, simulates entries/exits, and writes reproducible reports without wallet credentials.

This is experimental research software for extremely speculative assets. It does not guarantee returns and v1 intentionally disables live wallet execution.

## What Is Implemented

- PumpApi-compatible event normalization for `create`, `buy`, `sell`, `migration`, and `pool_created`.
- Replayable JSONL launch feed plus live WebSocket feed scaffolding.
- Provider enrichers for DEX Screener, GeckoTerminal, Jupiter price data, and Birdeye holder data.
- Cheap meme-relevance filter using free trend sources and deterministic matching.
- Next.js read-only command center for bot health, meme topics, launch decisions, positions, exits, and simulated PnL.
- Time-consistent feature extraction at event, age, and bonding-curve milestones.
- Heuristic scorer with graduation probability, risk score, trend score, expected value score, decision, and reason codes.
- Paper broker with 0.05 SOL entries, max 10 positions, 1 SOL daily cap, fees/slippage, moonshot-skewed 5x/15x/50x exits, a retained moonbag, stop loss, timeout, and trailing stop.
- Postgres schema and Kysely-backed store, plus in-memory demo mode.
- Markdown reporting for candidates, simulated trades, PnL, drawdown, missed winners, false positives, and reason counts.

## Quick Start

```bash
npm install
npm run demo
```

The demo uses `fixtures/pumpapi-events.jsonl`, keeps data in memory, and writes `reports/demo.md`.

## Postgres Mode

```bash
docker compose up -d db
npm run migrate
npm run replay:fixture -- --database-url postgres://moonshot:moonshot@127.0.0.1:5433/moonshot
```

Set `DATABASE_URL` in `.env` to avoid repeating the connection string.

## Live Dry Run

```bash
docker compose up -d db
npm run migrate
npm run start --workspace @moonshot/bot -- ingest --source pumpapi --duration-seconds 300 --database-url "$DATABASE_URL"
npm run start --workspace @moonshot/bot -- report --database-url "$DATABASE_URL" --report reports/live.md
```

Optional provider keys:

- `BIRDEYE_API_KEY`
- `PUMPAPI_STREAM_URL`

The live path still only paper trades. `DisabledExecutionAdapter` throws if live execution is attempted.

## Project Layout

- `packages/core`: domain contracts, normalizers, providers, features, scoring, paper broker, stores, reports.
- `apps/bot`: CLI commands for demo, replay, ingest, migration, and reports.
- `apps/web`: Next.js App Router command center that reads directly from Postgres.
- `migrations`: Postgres schema.
- `fixtures`: deterministic replay data for tests and local demos.

## Commands

- `npm run demo`: run the full pipeline against fixture data and write a report.
- `npm run replay:fixture`: replay the bundled fixture.
- `npm run migrate`: apply database migrations using `DATABASE_URL`.
- `npm run meme-report`: generate a report of active meme topics and matched launches.
- `npm run web:dev`: run the read-only Next.js command center.
- `npm run web:build`: build the command center for deployment.
- `npm run retention:dry-run`: count expired raw/trade events under the cheap retention policy.
- `npm test`: run unit/integration tests.
- `npm run check`: run TypeScript checks.

## Command Center

The web app lives at `apps/web` and is intentionally read-only in v1. It uses `DATABASE_URL` to query the existing Postgres schema and shows an error panel if the database is unavailable instead of crashing the shell.

```bash
docker compose up -d db
npm run migrate
npm run replay:fixture -- --database-url "$DATABASE_URL"
npm run web:dev
```

Pages:

- `/`: bot health, simulated PnL, open moonbags, recent candidates, active meme topics, and recent exits.
- `/launches`: sortable scored launches by latest score, meme relevance, risk, or expected value.
- `/launches/[mint]`: token detail with meme evidence, feature snapshot, score history, paper orders, and exits.
- `/topics`: active trend topics with velocity, novelty, source coverage, evidence, and matched launch counts.
- `/positions`: open and closed paper positions with moonbag exposure and estimated PnL.

## Cheap Meme-Relevance Use Case

The first focused use case is to paper-trade only launches that map to a current cultural trend. The bot now stores trend topics, matches token names/symbols/metadata against those topics, and requires `memeRelevanceScore >= 0.70` before a token can become a `paper_buy`.

Trend sources are intentionally low-cost:

- Google Trends RSS for US trending searches.
- GDELT DOC API for news/event velocity.
- Optional configured RSS/OpenRSS feeds through `MEME_RSS_URLS`.
- Wikimedia pageviews support exists in core for tracked page titles.

Run a trend refresh:

```bash
npm run start --workspace @moonshot/bot -- trend-refresh --database-url "$DATABASE_URL"
```

Generate a meme report:

```bash
npm run meme-report -- --database-url "$DATABASE_URL" --report reports/meme-report.md
```

Raw buy/sell events are treated as temporary evidence. Use `retention-prune` to keep durable launches, feature snapshots, scores, paper trades, and meme matches while deleting old raw/trade events:

```bash
npm run retention:dry-run -- --database-url "$DATABASE_URL"
npm run start --workspace @moonshot/bot -- retention-prune --database-url "$DATABASE_URL"
```
