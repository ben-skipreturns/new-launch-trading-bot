import { describe, expect, it } from "vitest";
import { calculateDashboardMetrics, calculatePositionDerivedValues, sortLaunches } from "./aggregate";
import type { LaunchListItem, PositionListItem } from "./types";

describe("command-center aggregate helpers", () => {
  it("summarizes dashboard metrics from launches, positions, and order counts", () => {
    const metrics = calculateDashboardMetrics({
      activeTopics: 7,
      filledBuys: 4,
      filledSells: 3,
      launches: [
        launch({ mint: "a", expectedValueScore: 0.8 }),
        launch({ mint: "b", expectedValueScore: 0.4 })
      ],
      positions: [
        position({
          mint: "a",
          status: "open",
          solInvested: 0.05,
          solRealized: 0.1,
          tokensBought: 1_000,
          tokensOpen: 500,
          estimatedOpenValueSol: 0.2,
          estimatedPnlSol: 0.25
        }),
        position({ mint: "b", status: "closed", solInvested: 0.05, solRealized: 0.01, tokensOpen: 0, estimatedOpenValueSol: 0, estimatedPnlSol: -0.04 })
      ]
    });

    expect(metrics).toMatchObject({
      activeTopics: 7,
      recentCandidates: 2,
      openPositions: 1,
      closedPositions: 1,
      filledBuys: 4,
      filledSells: 3,
      estimatedOpenValueSol: 0.2,
      estimatedTotalPnlSol: 0.21
    });
    expect(metrics.realizedPnlSol).toBeCloseTo(0.035);
  });

  it("derives moonbag exposure and estimated PnL from position balances", () => {
    const derived = calculatePositionDerivedValues({
      tokensBought: 1_000,
      tokensOpen: 450,
      solInvested: 0.05,
      solRealized: 0.12,
      entryPriceSol: 0.00005,
      latestPriceSol: 0.0004
    });

    expect(derived.moonbagPct).toBe(45);
    expect(derived.estimatedOpenValueSol).toBeCloseTo(0.18);
    expect(derived.estimatedPnlSol).toBeCloseTo(0.25);
  });

  it("sorts launches by latest timestamp, meme relevance, risk, and expected value", () => {
    const launches = [
      launch({ mint: "old", latestScoreAt: new Date("2026-01-01T00:00:00Z"), memeRelevanceScore: 0.8, riskScore: 0.2, expectedValueScore: 0.2 }),
      launch({ mint: "new", latestScoreAt: new Date("2026-01-02T00:00:00Z"), memeRelevanceScore: 0.5, riskScore: 0.9, expectedValueScore: 0.9 })
    ];

    expect(sortLaunches(launches).map((item) => item.mint)).toEqual(["new", "old"]);
    expect(sortLaunches(launches, "meme").map((item) => item.mint)).toEqual(["old", "new"]);
    expect(sortLaunches(launches, "risk").map((item) => item.mint)).toEqual(["new", "old"]);
    expect(sortLaunches(launches, "ev").map((item) => item.mint)).toEqual(["new", "old"]);
  });
});

function launch(overrides: Partial<LaunchListItem>): LaunchListItem {
  return {
    mint: "mint",
    decision: "watch",
    graduationProbability: 0.5,
    riskScore: 0.2,
    trendScore: 0.5,
    expectedValueScore: 0.5,
    memeRelevanceScore: 0.5,
    latestScoreAt: new Date("2026-01-01T00:00:00Z"),
    reasons: [],
    ...overrides
  };
}

function position(overrides: Partial<PositionListItem>): PositionListItem {
  return {
    mint: "mint",
    status: "open",
    openedAt: new Date("2026-01-01T00:00:00Z"),
    entryPriceSol: 0.00005,
    tokensOpen: 1_000,
    tokensBought: 1_000,
    solInvested: 0.05,
    solRealized: 0,
    estimatedOpenValueSol: 0.05,
    estimatedPnlSol: 0,
    moonbagPct: 100,
    ...overrides
  };
}
