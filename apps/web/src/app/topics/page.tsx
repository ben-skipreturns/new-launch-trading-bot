import { EmptyState } from "../../components/empty-state";
import { ErrorPanel } from "../../components/error-panel";
import { StatusBadge } from "../../components/status-badge";
import { getTopicList } from "../../lib/data";
import { formatAge, formatDate, formatScore } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const topics = await getTopicList();

  return (
    <div className="page-wrap space-y-5">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Trend cache</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">Topics</h1>
      </header>

      <ErrorPanel message={topics.ok ? undefined : topics.error} />

      <section className="panel overflow-hidden rounded-md">
        {topics.data.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Type</th>
                  <th>Velocity</th>
                  <th>Novelty</th>
                  <th>Sources</th>
                  <th>Matches</th>
                  <th>Last seen</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {topics.data.map((topic) => (
                  <tr key={topic.id}>
                    <td className="min-w-[220px]">
                      <div className="font-semibold">{topic.canonicalPhrase}</div>
                      <div className="text-xs text-muted">first seen {formatDate(topic.firstSeen)}</div>
                    </td>
                    <td>
                      <StatusBadge label={topic.topicType.replace("_", " ")} tone="open" />
                    </td>
                    <td>{formatScore(topic.velocityScore)}</td>
                    <td>{formatScore(topic.noveltyScore)}</td>
                    <td>{topic.sourceCoverage}</td>
                    <td>{topic.matchedLaunches}</td>
                    <td>
                      <div>{formatAge(topic.lastSeen)}</div>
                      <div className="text-xs text-muted">{formatDate(topic.lastSeen)}</div>
                    </td>
                    <td className="max-w-[360px]">
                      {topic.evidenceUrls.length ? (
                        <div className="space-y-1">
                          {topic.evidenceUrls.slice(0, 2).map((url) => (
                            <a className="block truncate text-sm font-medium text-accent hover:text-ink" href={url} key={url} rel="noreferrer" target="_blank">
                              {url}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="No topics found" body="Use trend-refresh or ingestion startup to poll free trend sources." />
          </div>
        )}
      </section>
    </div>
  );
}
