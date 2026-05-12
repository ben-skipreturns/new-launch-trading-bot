import { describe, expect, it } from "vitest";
import { buildDecisionReview } from "./decision-review";
import type { LaunchListItem, PositionListItem } from "./types";

describe("decision review aggregates", () => {
  it("builds a sequential funnel and gate breakdowns", () => {
    const review = buildDecisionReview({
      rawCounts: {
        totalLaunches: 4,
        memeMatchedLaunches: 4,
        exitEvents: 1
      },
      launches: [
        launch({
          mint: "buy",
          decision: "paper_buy",
          memeRelevanceScore: 0.9,
          riskScore: 0.2,
          expectedValueScore: 0.85,
          reasons: ["MEME_RELEVANCE_MATCH", "ENTRY_SIGNAL_CONFIDENCE_READY", "LIQUIDITY_FRESH"]
        }),
        launch({
          mint: "low-meme",
          memeRelevanceScore: 0.2,
          reasons: ["MEME_RELEVANCE_TOO_LOW"]
        }),
        launch({
          mint: "risky",
          memeRelevanceScore: 0.8,
          riskScore: 0.72,
          reasons: ["MEME_RELEVANCE_MATCH", "RISK_TOO_HIGH", "HIGH_BOT_SHARE"]
        }),
        launch({
          mint: "weak-flow",
          memeRelevanceScore: 0.8,
          riskScore: 0.2,
          reasons: ["MEME_RELEVANCE_MATCH", "WEAK_NET_SOL_FLOW"]
        })
      ],
      buyOrders: [
        {
          mint: "buy",
          status: "filled",
          reason: "ENTRY_SIGNAL",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          scoreReasons: ["MEME_RELEVANCE_MATCH", "ENTRY_SIGNAL_CONFIDENCE_READY"]
        }
      ],
      positions: [position({ mint: "buy", status: "open" })]
    });

    expect(funnelCounts(review)).toMatchObject({
      "Passed meme gate": 3,
      "Passed risk gate": 2,
      "Passed confidence": 1,
      "Paper-buy signals": 1,
      "Filled paper buys": 1,
      "Open positions": 1,
      "Exit events": 1
    });
    expect(review.gates.find((gate) => gate.key === "meme")).toMatchObject({ inputCount: 4, blocked: 1, passed: 3 });
    expect(review.gates.find((gate) => gate.key === "risk")).toMatchObject({ inputCount: 3, blocked: 1, passed: 2 });
    expect(review.gates.find((gate) => gate.key === "confidence")).toMatchObject({ inputCount: 2, blocked: 1, passed: 1 });
    expect(review.almostBuys.map((item) => item.mint)).toContain("weak-flow");
  });

  it("does not let paper_buy labels skip earlier gates", () => {
    const review = buildDecisionReview({
      rawCounts: {
        totalLaunches: 1,
        memeMatchedLaunches: 1,
        exitEvents: 0
      },
      launches: [
        launch({
          mint: "bad-buy-label",
          decision: "paper_buy",
          memeRelevanceScore: 0.9,
          riskScore: 0.9,
          expectedValueScore: 0.95,
          reasons: ["MEME_RELEVANCE_MATCH", "RISK_TOO_HIGH"]
        })
      ],
      buyOrders: [
        {
          mint: "bad-buy-label",
          status: "filled",
          reason: "ENTRY_SIGNAL",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          scoreReasons: ["MEME_RELEVANCE_MATCH", "RISK_TOO_HIGH"]
        }
      ],
      positions: []
    });

    expect(funnelCounts(review)).toMatchObject({
      "Passed meme gate": 1,
      "Passed risk gate": 0,
      "Paper-buy signals": 0,
      "Filled paper buys": 0
    });
  });
});

function funnelCounts(review: ReturnType<typeof buildDecisionReview>): Record<string, number> {
  return Object.fromEntries(review.funnel.map((step) => [step.label, step.count]));
}

function launch(overrides: Partial<LaunchListItem>): LaunchListItem {
  return {
    mint: "mint",
    decision: "watch",
    graduationProbability: 0.5,
    riskScore: 0.2,
    trendScore: 0.5,
    expectedValueScore: 0.5,
    memeRelevanceScore: 0.8,
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
    latestPriceSol: 0.00025,
    tokensOpen: 600,
    tokensBought: 1000,
    solInvested: 0.05,
    solRealized: 0.1,
    estimatedOpenValueSol: 0.15,
    estimatedPnlSol: 0.2,
    moonbagPct: 60,
    stopPriceSol: 0.00001,
    highPriceSol: 0.00025,
    ladderState: { "5": true, "15": false, "50": false },
    ...overrides
  };
}
