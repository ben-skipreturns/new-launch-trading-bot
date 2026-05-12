import type { DashboardMetrics, LaunchListItem, PositionListItem } from "./types";

export function calculateDashboardMetrics(input: {
  launches: LaunchListItem[];
  positions: PositionListItem[];
  filledBuys: number;
  filledSells: number;
  activeTopics: number;
}): DashboardMetrics {
  const realizedPnlSol = input.positions.reduce((total, position) => total + realizedPositionPnl(position), 0);
  const estimatedOpenValueSol = input.positions.reduce((total, position) => total + position.estimatedOpenValueSol, 0);
  const estimatedTotalPnlSol = input.positions.reduce((total, position) => total + position.estimatedPnlSol, 0);
  return {
    activeTopics: input.activeTopics,
    recentCandidates: input.launches.length,
    openPositions: input.positions.filter((position) => position.status === "open").length,
    closedPositions: input.positions.filter((position) => position.status === "closed").length,
    filledBuys: input.filledBuys,
    filledSells: input.filledSells,
    realizedPnlSol,
    estimatedOpenValueSol,
    estimatedTotalPnlSol
  };
}

function realizedPositionPnl(position: PositionListItem): number {
  if (position.tokensBought <= 0) return position.solRealized - (position.status === "closed" ? position.solInvested : 0);
  const soldFraction =
    position.status === "closed" ? 1 : Math.min(1, Math.max(0, (position.tokensBought - position.tokensOpen) / position.tokensBought));
  return position.solRealized - position.solInvested * soldFraction;
}

export function calculatePositionDerivedValues(input: {
  tokensOpen: number;
  tokensBought: number;
  solInvested: number;
  solRealized: number;
  entryPriceSol: number;
  latestPriceSol?: number;
}): Pick<PositionListItem, "estimatedOpenValueSol" | "estimatedPnlSol" | "moonbagPct"> {
  const latestPriceSol = input.latestPriceSol ?? input.entryPriceSol;
  const estimatedOpenValueSol = input.tokensOpen * latestPriceSol;
  const estimatedPnlSol = input.solRealized + estimatedOpenValueSol - input.solInvested;
  const moonbagPct = input.tokensBought > 0 ? (input.tokensOpen / input.tokensBought) * 100 : 0;
  return { estimatedOpenValueSol, estimatedPnlSol, moonbagPct };
}

export function sortLaunches(items: LaunchListItem[], key: "latest" | "meme" | "risk" | "ev" = "latest"): LaunchListItem[] {
  const sorted = [...items];
  if (key === "meme") return sorted.sort((a, b) => b.memeRelevanceScore - a.memeRelevanceScore);
  if (key === "risk") return sorted.sort((a, b) => b.riskScore - a.riskScore);
  if (key === "ev") return sorted.sort((a, b) => b.expectedValueScore - a.expectedValueScore);
  return sorted.sort((a, b) => (b.latestScoreAt?.getTime() ?? 0) - (a.latestScoreAt?.getTime() ?? 0));
}
