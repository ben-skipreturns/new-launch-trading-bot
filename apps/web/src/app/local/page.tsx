const quickLoop = [
  {
    title: "Start Postgres",
    body: "Runs the project database in Docker on host port 5433, leaving any machine-level Postgres on 5432 alone.",
    command: "docker compose up -d db"
  },
  {
    title: "Apply schema",
    body: "Creates or updates the command-center tables used by replay, scoring, paper positions, topics, and reports.",
    command: "npm run migrate"
  },
  {
    title: "Replay fixture",
    body: "Loads deterministic launch, trend, score, and paper-trade data into Postgres for inspection.",
    command: "npm run replay:fixture"
  },
  {
    title: "Open command center",
    body: "Starts the Next.js app and reads the same Postgres data through DATABASE_URL in the root .env file.",
    command: "npm run web:dev"
  }
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
        <div className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-muted">
          Postgres host port 5433
        </div>
      </header>

      <section className="panel rounded-md p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Fast path</h2>
        <div className="mt-4 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[680px]:grid-cols-1">
          {quickLoop.map((step, index) => (
            <div className="rounded-md border border-line bg-white/75 p-4" key={step.title}>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Step {index + 1}</div>
              <h3 className="mt-2 font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-5 text-muted">{step.body}</p>
              <CommandBlock command={step.command} />
            </div>
          ))}
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
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Inspect data</h2>
          <div className="mt-4 space-y-4">
            {inspectCommands.map((item) => (
              <div key={item.label}>
                <div className="text-sm font-semibold text-ink">{item.label}</div>
                <CommandBlock command={item.command} />
              </div>
            ))}
          </div>
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
    <pre className="mt-3 overflow-x-auto rounded-md border border-line bg-ink px-3 py-2 text-xs leading-5 text-white">
      <code>{command}</code>
    </pre>
  );
}

function PreBlock({ lines }: { lines: string[] }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-md border border-line bg-ink p-3 text-xs leading-6 text-white">
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
