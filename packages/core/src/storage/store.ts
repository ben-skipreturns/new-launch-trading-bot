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
  TrendObservation,
  TrendTopic
} from "../domain/types.js";

export interface Store {
  upsertRawEvent(event: LaunchEvent): Promise<void>;
  upsertTokenLaunch(launch: TokenLaunch): Promise<void>;
  upsertTradeEvent(event: TradeEvent): Promise<void>;
  upsertTokenEnrichment(enrichment: TokenEnrichment): Promise<void>;
  insertFeatureSnapshot(snapshot: FeatureSnapshot): Promise<void>;
  insertScoreSnapshot(snapshot: ScoreSnapshot): Promise<void>;
  insertPaperOrder(order: PaperOrder): Promise<void>;
  upsertPaperPosition(position: PaperPosition): Promise<void>;
  insertExitEvent(event: ExitEvent): Promise<void>;
  upsertTrendTopic(topic: TrendTopic): Promise<void>;
  insertTrendObservation(observation: TrendObservation, topicId?: string): Promise<void>;
  upsertTokenMemeMatch(match: TokenMemeMatch): Promise<void>;
  insertRetentionRun(run: RetentionRun): Promise<void>;

  getTokenLaunch(mint: string): Promise<TokenLaunch | undefined>;
  listTokenLaunches(): Promise<TokenLaunch[]>;
  listTradeEvents(mint: string, upTo?: Date): Promise<TradeEvent[]>;
  getLatestEnrichment(mint: string, upTo?: Date): Promise<TokenEnrichment | undefined>;
  getOpenPosition(mint: string): Promise<PaperPosition | undefined>;
  listOpenPositions(): Promise<PaperPosition[]>;
  listPaperOrders(from?: Date, to?: Date): Promise<PaperOrder[]>;
  listPaperPositions(): Promise<PaperPosition[]>;
  listExitEvents(from?: Date, to?: Date): Promise<ExitEvent[]>;
  listScoreSnapshots(from?: Date, to?: Date): Promise<ScoreSnapshot[]>;
  listTrendTopics(activeSince?: Date, limit?: number): Promise<TrendTopic[]>;
  listTrendObservations(from?: Date, to?: Date): Promise<TrendObservation[]>;
  getLatestTokenMemeMatch(mint: string, upTo?: Date): Promise<TokenMemeMatch | undefined>;
  listTokenMemeMatches(from?: Date, to?: Date): Promise<TokenMemeMatch[]>;
  pruneRetention(options: RetentionPruneOptions): Promise<RetentionPruneResult>;
}
