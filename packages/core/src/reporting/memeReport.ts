import type { Store } from "../storage/store.js";
import { round } from "../utils/math.js";

export async function generateMemeReport(store: Store, from?: Date, to?: Date): Promise<string> {
  const topics = await store.listTrendTopics(from, 50);
  const matches = await store.listTokenMemeMatches(from, to);
  const scores = await store.listScoreSnapshots(from, to);
  const latestScoreByMint = new Map(scores.map((score) => [score.mint, score]));

  return [
    "# Meme Relevance Report",
    "",
    `Window: ${from?.toISOString() ?? "beginning"} to ${to?.toISOString() ?? "now"}`,
    "",
    "## Active Topics",
    "",
    ...(topics.length
      ? topics.map(
          (topic) =>
            `- ${topic.canonicalPhrase}: type=${topic.topicType}, velocity=${topic.velocityScore}, novelty=${topic.noveltyScore}, sources=${topic.sourceCoverage}, evidence=${topic.evidenceUrls[0] ?? "none"}`
        )
      : ["- No active topics."]),
    "",
    "## Matched Launches",
    "",
    ...(matches.length
      ? matches
          .sort((a, b) => b.memeRelevanceScore - a.memeRelevanceScore)
          .map((match) => {
            const score = latestScoreByMint.get(match.mint);
            return `- ${match.mint}: meme=${round(match.memeRelevanceScore, 4)}, topic=${match.canonicalPhrase ?? "none"}, decision=${
              score?.decision ?? "none"
            }, reasons=${[...match.reasons, ...(score?.reasons ?? [])].slice(0, 8).join(",") || "none"}`;
          })
      : ["- No token meme matches."]),
    ""
  ].join("\n");
}
