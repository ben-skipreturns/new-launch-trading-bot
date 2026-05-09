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

    const rejectedCutoff = options.now.getTime() - options.rejectedRawRetentionHours * 60 * 60 * 1000;
    const interestingCutoff = options.now.getTime() - options.interestingRawRetentionDays * 24 * 60 * 60 * 1000;
    const rawKeysToDelete = [...this.rawEvents.entries()]
      .filter(([, event]) => isExpired(event.mint, event.timestamp, interestingMints, rejectedCutoff, interestingCutoff))
      .map(([key]) => key);
    const tradeKeysToDelete = [...this.trades.entries()]
      .filter(([, trade]) => isExpired(trade.mint, trade.occurredAt, interestingMints, rejectedCutoff, interestingCutoff))
      .map(([key]) => key);

    if (!options.dryRun) {
      rawKeysToDelete.forEach((key) => this.rawEvents.delete(key));
      tradeKeysToDelete.forEach((key) => this.trades.delete(key));
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
      tradeEventsDeleted: tradeKeysToDelete.length
    };
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
