const quickLoop = [
  {
    title: "Configure env",
    body: "Keep one repo-root .env file. Use a dedicated OpenAI project key and set OpenAI-side budget controls before live trend refreshes.",
    command: "test -f .env || cp .env.example .env"
  },
  {
    title: "Start Postgres",
    body: "Runs the project database in Docker on host port 5433, leaving any machine-level Postgres on 5432 alone.",
    command: "docker compose up -d db"
  },
  {
    title: "Apply schema",
    body: "Creates or updates the command-center tables, including trend radar audit and cost tracking tables.",
    command: "npm run migrate"
  },
  {
    title: "Open command center",
    body: "Starts the Next.js app and reads the same Postgres data through DATABASE_URL in the root .env file.",
    command: "npm run web:dev"
  }
];

const envLines = [
  "DATABASE_URL=postgres://moonshot:moonshot@127.0.0.1:5433/moonshot",
  "OPENAI_API_KEY=sk-...",
  "OPENAI_TREND_MODEL=gpt-5.4-mini",
  "OPENAI_TREND_REFRESH_MINUTES=15",
  "OPENAI_TREND_MONTHLY_BUDGET_USD=1000",
  "OPENAI_TREND_DAILY_BUDGET_USD=100",
  "OPENAI_TREND_ESTIMATED_REFRESH_COST_USD=0.10",
  "OPENAI_TREND_MAX_TOPICS=20",
  "OPENAI_TREND_MAX_TOOL_CALLS=2",
  "OPENAI_TREND_MAX_OUTPUT_TOKENS=12000",
  "PUMPAPI_STREAM_URL=wss://stream.pumpapi.io/",
  "NEXT_PUBLIC_REFRESH_SECONDS=30"
];

const liveTrendLoop = [
  "docker compose up -d db",
  "npm run migrate",
  "npm run start --workspace @moonshot/bot -- trend-refresh",
  "npm run web:dev"
];

const fixtureLoop = ["docker compose up -d db", "npm run migrate", "npm run replay:fixture", "npm run web:dev"];

const launchStreamLoop = [
  "npm run stream:test -- --source fixture --max-launches 10",
  "npm run stream:test -- --source fixture --max-launches 10 --persist",
  "npm run stream:test -- --source pumpapi --duration-seconds 60 --max-launches 10",
  "npm run stream:test -- --source pumpapi --duration-seconds 60 --max-launches 10 --persist"
];

const tokenMatchLoop = [
  'npm run match:token -- --fixture-topics --name "Moo Deng" --symbol MOODENG',
  "npm run stream:test -- --source fixture --max-launches 10 --persist",
  "npm run match:launches -- --fixture-topics --limit 10 --since-hours 24000 --skip-metadata --dry-run",
  "npm run match:launches -- --fixture-topics --limit 10 --since-hours 24000 --skip-metadata",
  "npm run match:stream -- --source fixture --fixture-topics --max-launches 10 --skip-metadata --dry-run",
  "npm run start --workspace @moonshot/bot -- trend-refresh",
  "npm run stream:test -- --source pumpapi --duration-seconds 60 --max-launches 10 --persist",
  "npm run match:launches -- --limit 25 --since-hours 72 --dry-run",
  "npm run match:launches -- --limit 25 --since-hours 72",
  "npm run match:stream -- --source pumpapi --duration-seconds 60 --max-launches 25 --dry-run",
  "npm run match:stream -- --source pumpapi --duration-seconds 60 --max-launches 25",
  'npm run match:token -- --name "<token name>" --symbol "<SYMBOL>"',
  'npm run match:token -- --name "<token name>" --symbol "<SYMBOL>" --persist'
];

const retentionLoop = [
  "npm run retention:launch-dry-run",
  "npm run start --workspace @moonshot/bot -- retention-prune --prune-launches --dry-run",
  "npm run start --workspace @moonshot/bot -- retention-prune --prune-launches",
  "npm run start --workspace @moonshot/bot -- retention-prune --prune-launches --raw-launch-hours 48 --matched-launch-days 7 --rejected-launch-days 14"
];

const resetLoop = [
  "docker compose down -v",
  "docker compose up -d db",
  "npm run migrate",
  "npm run replay:fixture",
  "npm run web:dev"
];

const inspectCommands = [
  {
    label: "Docker service status",
    command: "docker compose ps"
  },
  {
    label: "Database login check",
    command: 'docker compose exec db psql -U moonshot -d moonshot -c "select current_user, current_database();"'
  },
  {
    label: "Fixture row counts",
    command:
      "node -e \"const {Client}=require('pg');(async()=>{const c=new Client({connectionString:'postgres://moonshot:moonshot@127.0.0.1:5433/moonshot'});await c.connect();const r=await c.query('select (select count(*) from token_launches) launches, (select count(*) from score_snapshots) scores, (select count(*) from trend_topics) topics, (select count(*) from paper_positions) positions');console.log(r.rows[0]);await c.end();})().catch(e=>{console.error(e.message);process.exit(1);})\""
  },
  {
    label: "Latest trend radar runs",
    command:
      "docker compose exec db psql -U moonshot -d moonshot -c \"select started_at, status, model, topics_found, web_search_calls, estimated_cost_usd, left(coalesce(error_text, ''), 120) as error from trend_refresh_runs order by started_at desc limit 5;\""
  },
  {
    label: "Active topic sample",
    command:
      'docker compose exec db psql -U moonshot -d moonshot -c "select canonical_phrase, topic_type, velocity_score, novelty_score, source_coverage, last_seen from trend_topics order by last_seen desc limit 10;"'
  },
  {
    label: "Latest launches",
    command:
      'docker compose exec db psql -U moonshot -d moonshot -c "select mint, name, symbol, source, created_at from token_launches order by created_at desc limit 10;"'
  },
  {
    label: "Latest token matches",
    command:
      'docker compose exec db psql -U moonshot -d moonshot -c "select mint, canonical_phrase, meme_relevance_score, reject_flags, observed_at from token_meme_matches order by observed_at desc limit 10;"'
  }
];

const troubleshooting = [
  {
    issue: "Dashboard says DATABASE_URL is not configured",
    fix: "Restart npm run web:dev after editing .env. The app loads the repo-root .env at server startup."
  },
  {
    issue: "Migration says role moonshot does not exist",
    fix: "You are probably connecting to another Postgres. This repo uses 127.0.0.1:5433 for Docker."
  },
  {
    issue: "Dashboard connects but shows no launches",
    fix: "Run npm run replay:fixture. npm run demo only uses memory and writes reports/demo.md."
  },
  {
    issue: "stream-test sees no live launches",
    fix: "Increase --duration-seconds or verify PUMPAPI_STREAM_URL. The stream-test command does not call OpenAI, enrichment, scoring, or paper trading."
  },
  {
    issue: "trend-refresh stores 0 topics",
    fix: "Check the latest trend_refresh_runs row. If status is error, read error_text. If status is skipped_duplicate, that 15-minute window already has a successful run."
  },
  {
    issue: "match-token returns NO_MATCHABLE_TOPICS",
    fix: "The active radar topics were too weak or risky for matching. Inspect Radar Review, run another trend-refresh later, or use --fixture-topics to test matcher mechanics."
  },
  {
    issue: "match-launches finds no launches",
    fix: "Run npm run stream:test with --persist first, or increase --since-hours if you are matching older fixture data."
  },
  {
    issue: "match-stream is slow",
    fix: "Metadata URI fetches have a short timeout, but slow gateways can still add latency. Use --skip-metadata to isolate stream and matcher behavior."
  },
  {
    issue: "match-token says DATABASE_URL is required",
    fix: "Use --fixture-topics for a no-database matcher check, or make sure DATABASE_URL is set in the repo-root .env before matching against live radar topics."
  },
  {
    issue: "OpenAI response is incomplete because of max_output_tokens",
    fix: "Keep the live-like topic count and raise OPENAI_TREND_MAX_OUTPUT_TOKENS. The current default is 12000."
  },
  {
    issue: "Docker database has old test data",
    fix: "Use docker compose down -v, then migrate and replay again. This deletes only the Docker volume for this project."
  }
];

export default function LocalLoopPage() {
  return (
    <div className="page-wrap space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Development runbook</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Local Development</h1>
        </div>
        <div className="surface-muted rounded-full px-3 py-1.5 text-sm font-semibold text-muted">
          Postgres host port 5433
        </div>
      </header>

      <section className="panel rounded-md p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Fast path</h2>
        <div className="mt-4 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[680px]:grid-cols-1">
          {quickLoop.map((step, index) => (
            <div className="field-tile rounded-md p-4" key={step.title}>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Step {index + 1}</div>
              <h3 className="mt-2 font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-5 text-muted">{step.body}</p>
              <CommandBlock command={step.command} />
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-4 max-[1120px]:grid-cols-1">
        <div className="panel rounded-md p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Root .env</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            These values mirror the intended live trend radar shape. OpenAI project budgets should be the primary cost control; the app-level values are broad backstops.
          </p>
          <PreBlock lines={envLines} />
        </div>

        <div className="panel rounded-md p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Trend radar loop</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Use this when tuning meme trend quality. It runs the OpenAI-only radar, writes topics and audit rows, then opens the command center for inspection.
          </p>
          <PreBlock lines={liveTrendLoop} />
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 max-[1120px]:grid-cols-1">
        <div className="panel rounded-md p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Clean reset</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Use this when you want a fresh database before tuning matcher thresholds, score gates, or paper-trading behavior.
          </p>
          <PreBlock lines={resetLoop} />
          <p className="mt-3 text-sm leading-6 text-muted">
            The reset removes the Docker volume for this project. It does not affect Homebrew Postgres or other local databases.
          </p>
        </div>

        <div className="panel rounded-md p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Fixture loop</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Use this when tuning deterministic scoring, matching, broker behavior, and reports without spending OpenAI tokens.
          </p>
          <PreBlock lines={fixtureLoop} />
        </div>
      </section>

      <section className="panel rounded-md p-5">
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 max-[980px]:grid-cols-1">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Launch stream loop</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Use this before token matching. It verifies the raw launch feed shape by printing token create events and optionally storing only raw create events plus token_launches.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              This command intentionally skips OpenAI trend refresh, enrichment, matching, scoring, and paper trading.
            </p>
          </div>
          <PreBlock lines={launchStreamLoop} />
        </div>
      </section>

      <section className="panel rounded-md p-5">
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 max-[980px]:grid-cols-1">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Token matching loop</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Use this after the launch stream loop. The single-token command proves matcher mechanics, match-launches runs across persisted launches, and match-stream streams new launches through the matcher without scoring or paper trading.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              Run with --dry-run first. Drop --dry-run when you want token metadata enrichments and token_meme_matches written for command-center inspection.
            </p>
          </div>
          <PreBlock lines={tokenMatchLoop} />
        </div>
      </section>

      <section className="panel rounded-md p-5">
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5 max-[980px]:grid-cols-1">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Retention loop</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Use this to keep the local database cheap while preserving launches that were matched, scored, watched, bought, or had paper-trading activity.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              Always run the dry-run first. Launch pruning deletes token_launches and cascades dependent rows for uninteresting expired tokens.
            </p>
          </div>
          <PreBlock lines={retentionLoop} />
        </div>
      </section>

      <section className="panel rounded-md p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Inspect data</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 max-[1120px]:grid-cols-1">
          {inspectCommands.map((item) => (
            <div key={item.label}>
              <div className="text-sm font-semibold text-ink">{item.label}</div>
              <CommandBlock command={item.command} />
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)] gap-4 max-[1120px]:grid-cols-1">
        <div className="panel overflow-hidden rounded-md">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">What each command means</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Writes Postgres</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                <CommandRow command="npm run demo" writes="No" purpose="Runs the pipeline in memory and writes reports/demo.md." />
                <CommandRow command="npm run replay:fixture" writes="Yes" purpose="Replays fixtures into Postgres and writes reports/replay.md." />
                <CommandRow command="npm run start --workspace @moonshot/bot -- trend-refresh" writes="Yes" purpose="Runs the OpenAI meme radar and writes topics, observations, and refresh audit rows." />
                <CommandRow command="npm run stream:test -- --source pumpapi" writes="Optional" purpose="Prints live token create events; add --persist to store only raw creates and token launches." />
                <CommandRow command="npm run match:launches -- --dry-run" writes="No" purpose="Matches persisted token launches against active topics without writing token_meme_matches." />
                <CommandRow command="npm run match:launches" writes="Yes" purpose="Matches persisted token launches, fetches token metadata, and writes token_meme_matches for command-center inspection." />
                <CommandRow command="npm run match:stream -- --dry-run" writes="No" purpose="Streams launches through metadata fetch and matching without writing rows." />
                <CommandRow command="npm run match:stream" writes="Yes" purpose="Streams launches, writes raw creates, token launches, metadata enrichments, and token_meme_matches only." />
                <CommandRow command={'npm run match:token -- --name "..." --symbol "..."'} writes="Optional" purpose="Tests token text against active or fixture topics; add --persist to store the local match." />
                <CommandRow command="npm run retention:launch-dry-run" writes="No" purpose="Counts expired raw/trade events and uninteresting token launches without deleting them." />
                <CommandRow command="npm run migrate" writes="Yes" purpose="Applies SQL schema migrations to the configured database." />
                <CommandRow command="npm run web:dev" writes="No" purpose="Starts the read-only Next.js command center." />
                <CommandRow command="npm run check" writes="No" purpose="Runs TypeScript checks across workspaces." />
                <CommandRow command="npm test" writes="No" purpose="Runs unit and integration tests." />
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel rounded-md p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Troubleshooting</h2>
          <div className="mt-4 divide-y divide-line/80">
            {troubleshooting.map((item) => (
              <div className="py-3 first:pt-0 last:pb-0" key={item.issue}>
                <div className="text-sm font-semibold text-ink">{item.issue}</div>
                <div className="mt-1 text-sm leading-5 text-muted">{item.fix}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function CommandBlock({ command }: { command: string }) {
  return (
    <pre className="code-block mt-3 overflow-x-auto rounded-md px-3 py-2 text-xs leading-5">
      <code>{command}</code>
    </pre>
  );
}

function PreBlock({ lines }: { lines: string[] }) {
  return (
    <pre className="code-block mt-4 overflow-x-auto rounded-md p-3 text-xs leading-6">
      <code>{lines.join("\n")}</code>
    </pre>
  );
}

function CommandRow({ command, writes, purpose }: { command: string; writes: string; purpose: string }) {
  return (
    <tr>
      <td className="mono-cell text-ink">{command}</td>
      <td>{writes}</td>
      <td className="text-muted">{purpose}</td>
    </tr>
  );
}
