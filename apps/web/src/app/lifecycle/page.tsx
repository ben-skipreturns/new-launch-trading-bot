import { StatusBadge } from "../../components/status-badge";

export const dynamic = "force-static";

const lifecycleStages = [
  {
    step: "1",
    title: "Radar Refresh",
    route: "Radar Review",
    state: "trend_refresh_runs",
    body: "OpenAI scans current meme-shaped topics and separates active, watch, and rejected candidates.",
    output: "Only active topics can influence matching. Watch and rejected candidates are audit-only."
  },
  {
    step: "2",
    title: "Active Topic Cache",
    route: "Topics",
    state: "trend_topics, trend_observations",
    body: "Accepted topics are normalized with aliases, likely symbols, scores, evidence URLs, and source coverage.",
    output: "These topics become the current cultural context for launch filtering."
  },
  {
    step: "3",
    title: "Launch Ingestion",
    route: "Launches",
    state: "token_launches, raw_events",
    body: "The launch feed sees a new token create/pool event and stores durable launch metadata plus short-lived raw payloads.",
    output: "Every launch gets a mint-centered identity before enrichment or scoring."
  },
  {
    step: "4",
    title: "Meme Match Gate",
    route: "Launches",
    state: "token_meme_matches",
    body: "Token name, symbol, URI metadata, socials, and text are matched against active topics with deterministic fuzzy rules.",
    output: "No sufficient meme relevance means no paper buy, even if early on-chain activity looks strong."
  },
  {
    step: "5",
    title: "Feature + Score",
    route: "Launches",
    state: "feature_snapshots, score_snapshots",
    body: "The bot snapshots on-chain microstructure, enrichment freshness, risk signals, and meme evidence at time-consistent checkpoints.",
    output: "The scorer emits reject, watch, or paper_buy with reason codes."
  },
  {
    step: "6",
    title: "Paper Position",
    route: "Positions",
    state: "paper_orders, paper_positions, exit_events",
    body: "A paper_buy simulates an entry, then exit rules manage partial sells, stops, timeouts, and moonbag exposure.",
    output: "Position and exit records become the basis for PnL and strategy review."
  },
  {
    step: "7",
    title: "Retention",
    route: "Local Development",
    state: "retention_runs",
    body: "Retention pruning deletes bulky raw/trade payloads after they age out while preserving durable experiment records.",
    output: "Storage stays cheap without losing launch, score, match, order, position, and PnL history."
  }
];

const lifecycleStates = [
  {
    label: "active",
    tone: "buy" as const,
    body: "Can influence token matching and paper-buy gates."
  },
  {
    label: "watch",
    tone: "watch" as const,
    body: "Visible for review, but cannot trigger paper buys."
  },
  {
    label: "rejected",
    tone: "reject" as const,
    body: "Preserved as evidence/audit, but removed from active decisioning."
  },
  {
    label: "aged out",
    tone: "neutral" as const,
    body: "Raw/trade payloads have been pruned according to retention settings."
  }
];

const retentionRows = [
  {
    data: "Raw provider events for rejected/uninteresting launches",
    retention: "48 hours by default",
    reason: "Enough time for debugging without paying to keep low-value payloads."
  },
  {
    data: "Raw/trade events for watch, paper-buy, or filled-order mints",
    retention: "14 days by default",
    reason: "Keeps richer audit data around for candidates that mattered."
  },
  {
    data: "Launches, meme matches, snapshots, paper orders, positions, exits",
    retention: "Indefinite",
    reason: "These are the experiment record and PnL basis."
  },
  {
    data: "Radar runs, active topics, rejected radar candidates",
    retention: "Indefinite for now",
    reason: "Needed to evaluate whether the meme radar is too strict or too loose."
  }
];

export default function LifecyclePage() {
  return (
    <div className="page-wrap space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Operational docs</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Lifecycle</h1>
        </div>
        <div className="max-w-[32rem] text-sm leading-5 text-muted">
          How a meme topic and token launch move from radar discovery to paper trading, audit history, and cheap retention.
        </div>
      </header>

      <section className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
        {lifecycleStates.map((item) => (
          <div className="panel rounded-md p-4" key={item.label}>
            <StatusBadge label={item.label} tone={item.tone} />
            <p className="mt-3 text-sm leading-5 text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="panel rounded-md p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">End-to-end flow</h2>
        <div className="mt-5 grid gap-3">
          {lifecycleStages.map((stage, index) => (
            <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(220px,0.35fr)] gap-4 rounded-md border border-line bg-panel-muted/45 p-4 max-[820px]:grid-cols-1" key={stage.title}>
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-panel text-sm font-semibold text-ink">
                {stage.step}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{stage.title}</h3>
                  {index < lifecycleStages.length - 1 ? <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">then</span> : null}
                </div>
                <p className="mt-2 text-sm leading-5 text-muted">{stage.body}</p>
                <p className="mt-2 text-sm leading-5 text-ink">{stage.output}</p>
              </div>
              <div className="space-y-2 text-sm">
                <Field label="Primary view" value={stage.route} />
                <Field label="Primary tables" value={stage.state} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)] gap-4 max-[1080px]:grid-cols-1">
        <div className="panel overflow-hidden rounded-md">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">What gets pruned</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Retention</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {retentionRows.map((row) => (
                  <tr key={row.data}>
                    <td className="font-semibold text-ink">{row.data}</td>
                    <td>{row.retention}</td>
                    <td className="text-muted">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel rounded-md p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">Removal semantics</h2>
          <div className="mt-4 space-y-4 text-sm leading-5 text-muted">
            <p>
              A launch is removed from active consideration when it fails the meme gate, fails risk/scoring gates, or completes its paper-position lifecycle.
            </p>
            <p>
              Durable records are intentionally retained so reports and later backtests can explain why a token was rejected, watched, bought, or exited.
            </p>
            <p>
              The expensive part is raw event volume. That is what retention pruning targets.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-tile rounded-md p-3">
      <div className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
