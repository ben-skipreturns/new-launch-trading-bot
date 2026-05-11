import { describe, expect, it } from "vitest";
import { matcherCalibrationFixtures, runMatcherCalibration } from "../index.js";

describe("matcher calibration fixtures", () => {
  it("contains a meaningful mix of expected passes and rejects", () => {
    expect(matcherCalibrationFixtures.length).toBeGreaterThanOrEqual(18);
    expect(matcherCalibrationFixtures.filter((fixture) => fixture.expected === "pass").length).toBeGreaterThanOrEqual(8);
    expect(matcherCalibrationFixtures.filter((fixture) => fixture.expected === "reject").length).toBeGreaterThanOrEqual(8);
  });

  it("matches the expected pass/reject outcome for every fixture", async () => {
    const run = await runMatcherCalibration();

    expect(run.summary.failedExpectations).toBe(0);
    expect(run.results.filter((result) => result.fixture.id === "future-topic-lookahead")[0]?.match.rejectFlags).toContain(
      "NO_TEMPORALLY_MATCHABLE_TOPICS"
    );
    expect(run.results.filter((result) => result.fixture.id === "stale-moodeng")[0]?.match.rejectFlags).toContain(
      "NO_TEMPORALLY_MATCHABLE_TOPICS"
    );
  });
});
