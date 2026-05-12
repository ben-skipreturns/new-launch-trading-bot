import type { TokenLaunch } from "../domain/types.js";
import type { Store } from "../storage/store.js";
import { TradingPipeline } from "./tradingPipeline.js";

export interface LivePositionSupervisorOptions {
  ageMilestonesSeconds?: number[];
  maxAgeBackfillMs?: number;
  openPositionSnapshotIntervalMs?: number;
  refreshOpenPositionEnrichment?: boolean;
}

export class LivePositionSupervisor {
  private readonly ageMilestonesSeconds: number[];
  private readonly maxAgeBackfillMs: number;
  private readonly openPositionSnapshotIntervalMs: number;
  private readonly refreshOpenPositionEnrichment: boolean;

  constructor(
    private readonly store: Store,
    private readonly pipeline: TradingPipeline,
    options: LivePositionSupervisorOptions = {}
  ) {
    this.ageMilestonesSeconds = options.ageMilestonesSeconds ?? [15, 30, 60, 180, 300];
    this.maxAgeBackfillMs = options.maxAgeBackfillMs ?? 30 * 60 * 1000;
    this.openPositionSnapshotIntervalMs = options.openPositionSnapshotIntervalMs ?? 30_000;
    this.refreshOpenPositionEnrichment = options.refreshOpenPositionEnrichment ?? true;
  }

  async captureDueAgeSnapshots(asOf = new Date()): Promise<{ launches: number; snapshots: number }> {
    const launches = await this.store.listTokenLaunches({
      createdAfter: new Date(asOf.getTime() - this.maxAgeBackfillMs)
    });
    let snapshots = 0;
    let eligibleLaunches = 0;

    for (const launch of launches) {
      if (asOf.getTime() - launch.createdAt.getTime() > this.maxAgeBackfillMs) continue;
      eligibleLaunches += 1;
      snapshots += await this.captureDueLaunchAgeSnapshots(launch, asOf);
    }

    return { launches: eligibleLaunches, snapshots };
  }

  async captureDueLaunchAgeSnapshots(launch: TokenLaunch, asOf = new Date()): Promise<number> {
    let snapshots = 0;
    for (const ageSeconds of this.ageMilestonesSeconds) {
      const snapshotAt = new Date(launch.createdAt.getTime() + ageSeconds * 1000);
      if (snapshotAt > asOf) continue;
      const score = await this.pipeline.captureSnapshot(launch.mint, snapshotAt, "age", String(ageSeconds));
      if (score) snapshots += 1;
    }
    return snapshots;
  }

  async captureOpenPositionSnapshots(asOf = new Date()): Promise<{ positions: number; snapshots: number }> {
    const positions = await this.store.listOpenPositions();
    let snapshots = 0;
    const bucket = Math.floor(asOf.getTime() / this.openPositionSnapshotIntervalMs);
    for (const position of positions) {
      const snapshotAt = new Date(Math.max(asOf.getTime(), position.openedAt.getTime()));
      const score = await this.pipeline.captureSnapshot(position.mint, snapshotAt, "age", `open-position:${bucket}`, {
        refreshEnrichment: this.refreshOpenPositionEnrichment
      });
      if (score) snapshots += 1;
    }
    return { positions: positions.length, snapshots };
  }

  async captureDueSnapshots(asOf = new Date()): Promise<{ launches: number; positions: number; snapshots: number }> {
    const age = await this.captureDueAgeSnapshots(asOf);
    const open = await this.captureOpenPositionSnapshots(asOf);
    return {
      launches: age.launches,
      positions: open.positions,
      snapshots: age.snapshots + open.snapshots
    };
  }
}
