import type { LaunchFeed } from "../domain/interfaces.js";
import type { LaunchEvent } from "../domain/types.js";
import { secondsBetween } from "../utils/time.js";
import { TradingPipeline } from "./tradingPipeline.js";

export interface ReplayRunnerOptions {
  ageMilestonesSeconds?: number[];
}

type ScheduledItem =
  | { type: "event"; at: Date; event: LaunchEvent }
  | { type: "age"; at: Date; mint: string; ageSeconds: number };

export class ReplayRunner {
  private readonly ageMilestonesSeconds: number[];

  constructor(
    private readonly feed: LaunchFeed,
    private readonly pipeline: TradingPipeline,
    options: ReplayRunnerOptions = {}
  ) {
    this.ageMilestonesSeconds = options.ageMilestonesSeconds ?? [15, 30, 60, 180, 300];
  }

  async run(signal?: AbortSignal): Promise<{ events: number; snapshots: number }> {
    const events: LaunchEvent[] = [];
    for await (const event of this.feed.stream(signal)) {
      events.push(event);
    }

    const schedule = this.createSchedule(events);
    let processedEvents = 0;
    let snapshots = 0;
    for (const item of schedule) {
      if (signal?.aborted) break;
      if (item.type === "event") {
        processedEvents += 1;
        const score = await this.pipeline.processEvent(item.event);
        if (score) snapshots += 1;
      } else {
        const score = await this.pipeline.captureSnapshot(item.mint, item.at, "age", String(item.ageSeconds));
        if (score) snapshots += 1;
      }
    }
    return { events: processedEvents, snapshots };
  }

  private createSchedule(events: LaunchEvent[]): ScheduledItem[] {
    const schedule: ScheduledItem[] = [];
    for (const event of events) {
      schedule.push({ type: "event", at: event.timestamp, event });
      if (event.tokenLaunch?.mint) {
        for (const ageSeconds of this.ageMilestonesSeconds) {
          schedule.push({
            type: "age",
            at: new Date(event.tokenLaunch.createdAt.getTime() + ageSeconds * 1000),
            mint: event.tokenLaunch.mint,
            ageSeconds
          });
        }
      }
    }
    return schedule
      .filter((item) => item.type === "event" || secondsBetween(new Date(0), item.at) > 0)
      .sort((a, b) => a.at.getTime() - b.at.getTime() || (a.type === "event" ? -1 : 1));
  }
}
