import { describe, expect, it } from "vitest";
import { MemoryStore } from "../storage/memoryStore.js";
import type { StreamHealthRun } from "../domain/types.js";

describe("stream health storage", () => {
  it("upserts and returns latest stream health runs first", async () => {
    const store = new MemoryStore();
    const first = healthRun("stream-1", new Date("2026-05-08T12:00:00.000Z"));
    const second = healthRun("stream-2", new Date("2026-05-08T12:05:00.000Z"));

    await store.upsertStreamHealthRun(first);
    await store.upsertStreamHealthRun(second);
    await store.upsertStreamHealthRun({
      ...first,
      eventsRead: 5,
      launchesRead: 2,
      parserRejects: 1,
      eventsPerMinute: 10,
      launchesPerMinute: 4,
      duplicateRate: 0.5,
      parserRejectRate: 0.2,
      status: "completed"
    });

    const runs = await store.listStreamHealthRuns();
    expect(runs.map((run) => run.id)).toEqual(["stream-2", "stream-1"]);
    expect(runs[1]?.eventsRead).toBe(5);
    expect(runs[1]?.launchesRead).toBe(2);
    expect(runs[1]?.parserRejects).toBe(1);
    expect(runs[1]?.launchesPerMinute).toBe(4);
    expect(runs[1]?.status).toBe("completed");
  });
});

function healthRun(id: string, startedAt: Date): StreamHealthRun {
  return {
    id,
    source: "pumpapi",
    startedAt,
    status: "running",
    eventsRead: 0,
    launchesRead: 0,
    duplicateLaunches: 0,
    parserRejects: 0,
    reconnects: 0,
    staleWarnings: 0,
    eventsPerMinute: 0,
    launchesPerMinute: 0,
    duplicateRate: 0,
    parserRejectRate: 0,
    raw: {}
  };
}
