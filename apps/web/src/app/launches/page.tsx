import Link from "next/link";
import { EmptyState } from "../../components/empty-state";
import { ErrorPanel } from "../../components/error-panel";
import { DecisionBadge, RiskBadge } from "../../components/status-badge";
import { getLaunchList } from "../../lib/data";
import { formatAge, formatDate, formatScore, formatSol, shortMint } from "../../lib/format";

type SortKey = "latest" | "meme" | "risk" | "ev";

export const dynamic = "force-dynamic";

const sortKeys: SortKey[] = ["latest", "meme", "risk", "ev"];

export default async function LaunchesPage({ searchParams }: { searchParams?: Promise<{ sort?: string }> }) {
  const params = await searchParams;
  const sort = sortKeys.includes(params?.sort as SortKey) ? (params?.sort as SortKey) : "latest";
  const launches = await getLaunchList(sort);

  return (
    <div className="page-wrap space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Scored launches</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Launches</h1>
        </div>
        <div className="flex rounded-md border border-line bg-white p-1">
          {sortKeys.map((key) => (
            <Link
              className={`rounded px-3 py-1.5 text-sm font-semibold ${sort === key ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              href={`/launches?sort=${key}`}
              key={key}
            >
              {key === "ev" ? "EV" : key}
            </Link>
          ))}
        </div>
      </header>

      <ErrorPanel message={launches.ok ? undefined : launches.error} />

      <section className="panel overflow-hidden rounded-md">
        {launches.data.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Decision</th>
                  <th>Meme</th>
                  <th>Topic</th>
                  <th>Risk</th>
                  <th>EV</th>
                  <th>Price</th>
                  <th>Latest score</th>
                  <th>Reasons</th>
                </tr>
              </thead>
              <tbody>
                {launches.data.map((launch) => (
                  <tr key={launch.mint}>
                    <td className="min-w-[190px]">
                      <Link className="font-semibold hover:text-accent" href={`/launches/${launch.mint}`}>
                        {launch.symbol ?? launch.name ?? shortMint(launch.mint)}
                      </Link>
                      <div className="mono-cell mt-0.5 text-muted">{shortMint(launch.mint)}</div>
                      {launch.createdAt ? <div className="mt-0.5 text-xs text-muted">created {formatAge(launch.createdAt)}</div> : null}
                    </td>
                    <td>
                      <DecisionBadge decision={launch.decision} />
                    </td>
                    <td>{formatScore(launch.memeRelevanceScore)}</td>
                    <td className="max-w-[220px]">
                      <div className="truncate">{launch.memeTopic ?? "-"}</div>
                      {launch.memeTopicType ? <div className="text-xs text-muted">{launch.memeTopicType.replace("_", " ")}</div> : null}
                    </td>
                    <td>
                      <div className="space-y-1">
                        <RiskBadge riskScore={launch.riskScore} />
                        <div className="text-xs text-muted">{formatScore(launch.riskScore)}</div>
                      </div>
                    </td>
                    <td>{formatScore(launch.expectedValueScore)}</td>
                    <td>{formatSol(launch.latestPriceSol, 8)}</td>
                    <td>
                      <div>{formatAge(launch.latestScoreAt)}</div>
                      <div className="text-xs text-muted">{formatDate(launch.latestScoreAt)}</div>
                    </td>
                    <td className="max-w-[300px] text-sm text-muted">
                      {launch.reasons.slice(0, 3).join(", ") || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="No launches found" body="Run the bot ingest or replay command to generate score snapshots." />
          </div>
        )}
      </section>
    </div>
  );
}
