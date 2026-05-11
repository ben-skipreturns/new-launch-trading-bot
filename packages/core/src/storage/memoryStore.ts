import type {
  ExitEvent,
  FeatureSnapshot,
  LaunchEvent,
  PaperOrder,
  PaperPosition,
  RetentionPruneOptions,
  RetentionPruneResult,
  RetentionRun,
  ScoreSnapshot,
  StreamHealthRun,
  TokenEnrichment,
  TokenMemeMatch,
  TokenLaunch,
  TradeEvent,
  TrendRefreshRun,
  TrendObservation,
  TrendTopic
} from "../domain/types.js";
import type { Store } from "./store.js";

export class MemoryStore implements Store {
  readonly rawEvents = new Map<string, LaunchEvent>();
  readonly launches = new Map<string, TokenLaunch>();
  readonly trades = new Map<string, TradeEvent>();
  readonly enrichments: TokenEnrichment[] = [];
  readonly features: FeatureSnapshot[] = [];
  readonly scores: ScoreSnapshot[] = [];
  readonly orders = new Map<string, PaperOrder>();
  readonly positions = new Map<string, PaperPosition>();
  readonly exits = new Map<string, ExitEvent>();
  readonly trendTopics = new Map<string, TrendTopic>();
  readonly trendObservations: Array<TrendObservation & { topicId?: string }> = [];
  readonly trendRefreshRuns: TrendRefreshRun[] = [];
  readonly streamHealthRuns: StreamHealthRun[] = [];
  readonly memeMatches: TokenMemeMatch[] = [];
  readonly retentionRuns: RetentionRun[] = [];

  async upsertRawEvent(event: LaunchEvent): Promise<void> {
    this.rawEvents.set(`${event.source}:${event.signature}:${event.eventType}`, event);
  }

  async upsertTokenLaunch(launch: TokenLaunch): Promise<void> {
    this.launches.set(launch.mint, launch);
  }

  async upsertTradeEvent(event: TradeEvent): Promise<void> {
    this.trades.set(event.signature, event);
  }

  async upsertTokenEnrichment(enrichment: TokenEnrichment): Promise<void> {
    this.enrichments.push(enrichment);
  }

  async insertFeatureSnapshot(snapshot: FeatureSnapshot): Promise<void> {
    this.features.push(snapshot);
  }

  async insertScoreSnapshot(snapshot: ScoreSnapshot): Promise<void> {
    this.scores.push(snapshot);
  }

  async insertPaperOrder(order: PaperOrder): Promise<void> {
    this.orders.set(order.id, order);
  }

  async upsertPaperPosition(position: PaperPosition): Promise<void> {
    this.positions.set(position.mint, position);
  }

  async insertExitEvent(event: ExitEvent): Promise<void> {
    this.exits.set(event.id, event);
  }

  async upsertTrendTopic(topic: TrendTopic): Promise<void> {
    const existing = this.trendTopics.get(topic.id);
    if (!existing) {
      this.trendTopics.set(topic.id, topic);
      return;
    }
    this.trendTopics.set(topic.id, {
      ...topic,
      firstSeen: existing.firstSeen < topic.firstSeen ? existing.firstSeen : topic.firstSeen,
      evidenceUrls: [...new Set([...existing.evidenceUrls, ...topic.evidenceUrls])].slice(0, 10),
      aliases: [...new Set([...existing.aliases, ...topic.aliases])]
    });
  }

  async insertTrendObservation(observation: TrendObservation, topicId?: string): Promise<void> {
    if (!this.trendObservations.some((item) => item.id === observation.id)) {
      this.trendObservations.push({ ...observation, topicId });
    }
  }

  async insertTrendRefreshRun(run: TrendRefreshRun): Promise<void> {
    const existingIndex = this.trendRefreshRuns.findIndex((item) => item.id === run.id);
    if (existingIndex >= 0) {
      this.trendRefreshRuns[existingIndex] = run;
      return;
    }
    this.trendRefreshRuns.push(run);
  }

  async upsertStreamHealthRun(run: StreamHealthRun): Promise<void> {
    const existingIndex = this.streamHealthRuns.findIndex((item) => item.id === run.id);
    if (existingIndex >= 0) {
      this.streamHealthRuns[existingIndex] = run;
      return;
    }
    this.streamHealthRuns.push(run);
  }

  async upsertTokenMemeMatch(match: TokenMemeMatch): Promise<void> {
    const existingIndex = this.memeMatches.findIndex((item) => item.mint === match.mint && item.observedAt.getTime() === match.observedAt.getTime());
    if (existingIndex >= 0) {
      this.memeMatches[existingIndex] = match;
      return;
    }
    this.memeMatches.push(match);
  }

  async insertRetentionRun(run: RetentionRun): Promise<void> {
    this.retentionRuns.push(run);
  }

  async getTokenLaunch(mint: string): Promise<TokenLaunch | undefined> {
    return this.launches.get(mint);
  }

  async listTokenLaunches(): Promise<TokenLaunch[]> {
    return [...this.launches.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listTradeEvents(mint: string, upTo?: Date): Promise<TradeEvent[]> {
    return [...this.trades.values()]
      .filter((trade) => trade.mint === mint && (!upTo || trade.occurredAt <= upTo))
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  async getLatestEnrichment(mint: string, upTo?: Date): Promise<TokenEnrichment | undefined> {
    return this.enrichments
      .filter((item) => item.mint === mint && (!upTo || item.observedAt <= upTo))
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];
  }

  async getOpenPosition(mint: string): Promise<PaperPosition | undefined> {
    const position = this.positions.get(mint);
    return position?.status === "open" ? position : undefined;
  }

  async listOpenPositions(): Promise<PaperPosition[]> {
    return [...this.positions.values()].filter((position) => position.status === "open");
  }

  async listPaperOrders(from?: Date, to?: Date): Promise<PaperOrder[]> {
    return between([...this.orders.values()], (order) => order.createdAt, from, to);
  }

  async listPaperPositions(): Promise<PaperPosition[]> {
    return [...this.positions.values()].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  }

  async listExitEvents(from?: Date, to?: Date): Promise<ExitEvent[]> {
    return between([...this.exits.values()], (event) => event.occurredAt, from, to);
  }

  async listScoreSnapshots(from?: Date, to?: Date): Promise<ScoreSnapshot[]> {
    return between(this.scores, (score) => score.asOf, from, to);
  }

  async listTrendTopics(activeSince?: Date, limit = 250): Promise<TrendTopic[]> {
    return [...this.trendTopics.values()]
      .filter((topic) => !activeSince || topic.lastSeen >= activeSince)
      .sort((a, b) => b.velocityScore - a.velocityScore || b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, limit);
  }

  async listTrendObservations(from?: Date, to?: Date): Promise<TrendObservation[]> {
    return between(this.trendObservations, (observation) => observation.observedAt, from, to);
  }

  async listTrendRefreshRuns(from?: Date, to?: Date): Promise<TrendRefreshRun[]> {
    return between(this.trendRefreshRuns, (run) => run.startedAt, from, to);
  }

  async listStreamHealthRuns(limit = 20): Promise<StreamHealthRun[]> {
    return [...this.streamHealthRuns].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, limit);
  }

  async getLatestTokenMemeMatch(mint: string, upTo?: Date): Promise<TokenMemeMatch | undefined> {
    return this.memeMatches
      .filter((item) => item.mint === mint && (!upTo || item.observedAt <= upTo))
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];
  }

  async listTokenMemeMatches(from?: Date, to?: Date): Promise<TokenMemeMatch[]> {
    return between(this.memeMatches, (match) => match.observedAt, from, to);
  }

  async pruneRetention(options: RetentionPruneOptions): Promise<RetentionPruneResult> {
    const interestingMints = new Set(
      this.scores
        .filter((score) => score.decision === "paper_buy" || score.decision === "watch")
        .map((score) => score.mint)
    );
    for (const order of this.orders.values()) {
      if (order.status === "filled") interestingMints.add(order.mint);
    }
    for (const position of this.positions.values()) interestingMints.add(position.mint);
    for (const exit of this.exits.values()) interestingMints.add(exit.mint);

    const rejectedCutoff = options.now.getTime() - options.rejectedRawRetentionHours * 60 * 60 * 1000;
    const interestingCutoff = options.now.getTime() - options.interestingRawRetentionDays * 24 * 60 * 60 * 1000;
    const rawKeysToDelete = [...this.rawEvents.entries()]
      .filter(([, event]) => isExpired(event.mint, event.timestamp, interestingMints, rejectedCutoff, interestingCutoff))
      .map(([key]) => key);
    const tradeKeysToDelete = [...this.trades.entries()]
      .filter(([, trade]) => isExpired(trade.mint, trade.occurredAt, interestingMints, rejectedCutoff, interestingCutoff))
      .map(([key]) => key);
    const launchKeysToDelete = options.pruneLaunches ? this.expiredLaunchMints(options) : [];

    if (!options.dryRun) {
      rawKeysToDelete.forEach((key) => this.rawEvents.delete(key));
      tradeKeysToDelete.forEach((key) => this.trades.delete(key));
      launchKeysToDelete.forEach((mint) => {
        this.launches.delete(mint);
        [...this.rawEvents.entries()].forEach(([key, event]) => {
          if (event.mint === mint) this.rawEvents.delete(key);
        });
        [...this.trades.entries()].forEach(([key, trade]) => {
          if (trade.mint === mint) this.trades.delete(key);
        });
        this.enrichments.splice(0, this.enrichments.length, ...this.enrichments.filter((item) => item.mint !== mint));
        this.features.splice(0, this.features.length, ...this.features.filter((item) => item.mint !== mint));
        this.scores.splice(0, this.scores.length, ...this.scores.filter((item) => item.mint !== mint));
        [...this.orders.entries()].forEach(([key, order]) => {
          if (order.mint === mint) this.orders.delete(key);
        });
        this.positions.delete(mint);
        [...this.exits.entries()].forEach(([key, exit]) => {
          if (exit.mint === mint) this.exits.delete(key);
        });
        this.memeMatches.splice(0, this.memeMatches.length, ...this.memeMatches.filter((item) => item.mint !== mint));
      });
      await this.insertRetentionRun({
        id: `retention:${options.now.toISOString()}`,
        ranAt: options.now,
        dryRun: false,
        rejectedRawRetentionHours: options.rejectedRawRetentionHours,
        interestingRawRetentionDays: options.interestingRawRetentionDays,
        rawEventsDeleted: rawKeysToDelete.length,
        tradeEventsDeleted: tradeKeysToDelete.length
      });
    }

    return {
      rawEventsDeleted: rawKeysToDelete.length,
      tradeEventsDeleted: tradeKeysToDelete.length,
      tokenLaunchesDeleted: launchKeysToDelete.length
    };
  }

  private expiredLaunchMints(options: RetentionPruneOptions): string[] {
    const rawLaunchCutoff = options.now.getTime() - (options.rawLaunchRetentionHours ?? 48) * 60 * 60 * 1000;
    const matchedLaunchCutoff = options.now.getTime() - (options.matchedLaunchRetentionDays ?? 7) * 24 * 60 * 60 * 1000;
    const rejectedLaunchCutoff = options.now.getTime() - (options.rejectedLaunchRetentionDays ?? 14) * 24 * 60 * 60 * 1000;
    return [...this.launches.values()].filter((launch) => this.isExpiredLaunch(launch, rawLaunchCutoff, matchedLaunchCutoff, rejectedLaunchCutoff)).map((launch) => launch.mint);
  }

  private isExpiredLaunch(launch: TokenLaunch, rawLaunchCutoff: number, matchedLaunchCutoff: number, rejectedLaunchCutoff: number): boolean {
    const mint = launch.mint;
    const createdAt = launch.createdAt.getTime();
    if ([...this.orders.values()].some((order) => order.mint === mint) || this.positions.has(mint) || [...this.exits.values()].some((exit) => exit.mint === mint)) return false;
    const scores = this.scores.filter((score) => score.mint === mint);
    if (scores.some((score) => score.decision === "paper_buy" || score.decision === "watch")) return false;
    if (scores.length > 0) return createdAt < rejectedLaunchCutoff;
    if (this.memeMatches.some((match) => match.mint === mint)) return createdAt < matchedLaunchCutoff;
    return createdAt < rawLaunchCutoff;
  }

}

function between<T>(items: T[], getDate: (item: T) => Date, from?: Date, to?: Date): T[] {
  return items
    .filter((item) => {
      const date = getDate(item);
      return (!from || date >= from) && (!to || date <= to);
    })
    .sort((a, b) => getDate(a).getTime() - getDate(b).getTime());
}

function isExpired(
  mint: string | undefined,
  date: Date,
  interestingMints: Set<string>,
  rejectedCutoff: number,
  interestingCutoff: number
): boolean {
  const cutoff = mint && interestingMints.has(mint) ? interestingCutoff : rejectedCutoff;
  return date.getTime() < cutoff;
}
