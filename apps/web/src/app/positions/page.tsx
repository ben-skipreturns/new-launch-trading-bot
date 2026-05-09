import Link from "next/link";
import { EmptyState } from "../../components/empty-state";
import { ErrorPanel } from "../../components/error-panel";
import { StatusBadge } from "../../components/status-badge";
import { getPositionList } from "../../lib/data";
import { formatAge, formatDate, formatPct, formatSol, shortMint } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const positions = await getPositionList();

  return (
    <div className="page-wrap space-y-5">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Paper portfolio</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Positions</h1>
      </header>

      <ErrorPanel message={positions.ok ? undefined : positions.error} />

      <section className="panel overflow-hidden rounded-md">
        {positions.data.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th>Entry</th>
                  <th>Latest</th>
                  <th>Bought</th>
                  <th>Open</th>
                  <th>Moonbag</th>
                  <th>Invested</th>
                  <th>Realized</th>
                  <th>Open value</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {positions.data.map((position) => (
                  <tr key={position.mint}>
                    <td className="min-w-[190px]">
                      <Link className="font-semibold hover:text-accent" href={`/launches/${position.mint}`}>
                        {position.symbol ?? position.name ?? shortMint(position.mint)}
                      </Link>
                      <div className="mono-cell mt-0.5 text-muted">{shortMint(position.mint)}</div>
                    </td>
                    <td>
                      <StatusBadge label={position.status} tone={position.status === "open" ? "open" : "closed"} />
                    </td>
                    <td>
                      <div>{formatAge(position.openedAt)}</div>
                      <div className="text-xs text-muted">{formatDate(position.openedAt)}</div>
                    </td>
                    <td>{formatSol(position.entryPriceSol, 8)}</td>
                    <td>{formatSol(position.latestPriceSol, 8)}</td>
                    <td>{position.tokensBought.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td>{position.tokensOpen.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td>{formatPct(position.moonbagPct)}</td>
                    <td>{formatSol(position.solInvested)}</td>
                    <td>{formatSol(position.solRealized)}</td>
                    <td>{formatSol(position.estimatedOpenValueSol)}</td>
                    <td className={position.estimatedPnlSol >= 0 ? "font-semibold text-buy" : "font-semibold text-reject"}>
                      {formatSol(position.estimatedPnlSol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="No positions found" body="Positions appear after a launch passes meme relevance, risk, freshness, and EV gates." />
          </div>
        )}
      </section>
    </div>
  );
}
