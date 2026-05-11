import type { Enricher, FeatureExtractor, MemeMatcher, PaperBroker, Scorer } from "../domain/interfaces.js";
import type { LaunchEvent, ScoreSnapshot } from "../domain/types.js";
import { buildMemeMatchSaturationContext } from "../meme/matchSaturation.js";
import type { Store } from "../storage/store.js";

export interface TradingPipelineOptions {
  bondingCurveMilestones?: number[];
  activeTrendWindowMs?: number;
}

export class TradingPipeline {
  private readonly captured = new Set<string>();
  private readonly bondingCurveMilestones: number[];
  private readonly activeTrendWindowMs: number;

  constructor(
    private readonly store: Store,
    private readonly enricher: Enricher | null,
    private readonly featureExtractor: FeatureExtractor,
    private readonly scorer: Scorer,
    private readonly broker: PaperBroker,
    private readonly memeMatcher: MemeMatcher | null = null,
    options: TradingPipelineOptions = {}
  ) {
    this.bondingCurveMilestones = options.bondingCurveMilestones ?? [35, 45, 60, 75, 85];
    this.activeTrendWindowMs = options.activeTrendWindowMs ?? 48 * 60 * 60 * 1000;
  }

  async processEvent(event: LaunchEvent): Promise<ScoreSnapshot | null> {
    await this.store.upsertRawEvent(event);

    if (event.tokenLaunch) {
      await this.store.upsertTokenLaunch(event.tokenLaunch);
      const enrichment = await this.enricher?.enrich(event.tokenLaunch);
      if (enrichment) await this.store.upsertTokenEnrichment(enrichment);
      if (this.memeMatcher) {
        const topics = await this.store.listTrendTopics(new Date(event.timestamp.getTime() - this.activeTrendWindowMs), 500);
        const saturation = await buildMemeMatchSaturationContext(this.store, event.tokenLaunch, event.timestamp);
        const memeMatch = await this.memeMatcher.match({
          launch: event.tokenLaunch,
          topics,
          enrichment,
          saturation,
          observedAt: event.timestamp
        });
        await this.store.upsertTokenMemeMatch(memeMatch);
      }
    }

    if (event.tradeEvent) {
      const launch = await this.store.getTokenLaunch(event.tradeEvent.mint);
      if (!launch) return null;
      await this.store.upsertTradeEvent(event.tradeEvent);
    }

    const mint = event.mint ?? event.tokenLaunch?.mint ?? event.tradeEvent?.mint;
    if (!mint) return null;

    const score = await this.captureSnapshot(mint, event.timestamp, "event", event.signature);
    if (event.tradeEvent?.vSolInBondingCurve) {
      await this.captureBondingCurveMilestones(mint, event.timestamp, event.tradeEvent.vSolInBondingCurve);
    }
    return score;
  }

  async captureSnapshot(
    mint: string,
    asOf: Date,
    triggerType: "event" | "age" | "bonding_curve",
    triggerValue: string
  ): Promise<ScoreSnapshot | null> {
    const key =
      triggerType === "bonding_curve"
        ? `${mint}:${triggerType}:${triggerValue}`
        : `${mint}:${triggerType}:${triggerValue}:${asOf.toISOString()}`;
    if (this.captured.has(key)) return null;
    this.captured.add(key);

    const launch = await this.store.getTokenLaunch(mint);
    if (!launch) return null;
    const enrichment = await this.store.getLatestEnrichment(mint, asOf);
    const features = await this.featureExtractor.extract({
      launch,
      asOf,
      triggerType,
      triggerValue,
      enrichment
    });
    await this.store.insertFeatureSnapshot(features);

    const score = this.scorer.score(features);
    await this.store.insertScoreSnapshot(score);
    await this.broker.onScore(score);
    await this.broker.onPrice(score);
    return score;
  }

  private async captureBondingCurveMilestones(mint: string, asOf: Date, currentVSol: number): Promise<void> {
    for (const milestone of this.bondingCurveMilestones) {
      if (currentVSol >= milestone) {
        await this.captureSnapshot(mint, asOf, "bonding_curve", String(milestone));
      }
    }
  }
}
