export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type LaunchEventType = "create" | "buy" | "sell" | "migration" | "pool_created";

export type Decision = "paper_buy" | "watch" | "reject";

export type TrendTopicType =
  | "person"
  | "animal"
  | "politics"
  | "sports"
  | "entertainment"
  | "internet_phrase"
  | "ai"
  | "crypto"
  | "other";

export interface TokenLaunch {
  mint: string;
  source: string;
  signature: string;
  pool: string;
  creator?: string;
  name?: string;
  symbol?: string;
  uri?: string;
  supply?: number;
  createdAt: Date;
  initialBuyTokens?: number;
  initialBuySol?: number;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
  raw: JsonValue;
}

export interface TradeEvent {
  signature: string;
  source: string;
  mint: string;
  eventType: Exclude<LaunchEventType, "create">;
  trader?: string;
  occurredAt: Date;
  tokenAmount?: number;
  solAmount?: number;
  vSolInBondingCurve?: number;
  priceSol?: number;
  marketCapSol?: number;
  isBotLike: boolean;
  isWashTrade: boolean;
  raw: JsonValue;
}

export interface LaunchEvent {
  eventType: LaunchEventType;
  source: string;
  signature: string;
  mint?: string;
  pool?: string;
  timestamp: Date;
  block?: number;
  tokenLaunch?: TokenLaunch;
  tradeEvent?: TradeEvent;
  raw: JsonValue;
}

export interface TokenEnrichment {
  mint: string;
  observedAt: Date;
  provider: string;
  priceSol?: number;
  priceUsd?: number;
  liquidityUsd?: number;
  holderCount?: number;
  topHolderShare?: number;
  devHoldingShare?: number;
  insiderShare?: number;
  bundlerShare?: number;
  sniperShare?: number;
  organicScore?: number;
  sentimentKeywords: string[];
  socialLinks: Record<string, string>;
  raw: JsonValue;
}

export interface FeatureSnapshot {
  mint: string;
  asOf: Date;
  triggerType: "event" | "age" | "bonding_curve";
  triggerValue: string;
  ageSeconds: number;
  vSolInBondingCurve: number;
  bondingCurveProgress: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  uniqueTraders: number;
  netSolFlow: number;
  avgBuySol: number;
  largestBuySol: number;
  solAccumulationPerTrade: number;
  botLikeShare: number;
  washTradeShare: number;
  creatorBuySol: number;
  creatorSellSol: number;
  devSupplyShare: number;
  topHolderShare: number;
  insiderShare: number;
  bundlerShare: number;
  sniperShare: number;
  priceSol?: number;
  marketCapSol?: number;
  liquidityUsd?: number;
  holderCount?: number;
  organicScore?: number;
  enrichmentFresh: boolean;
  trendKeywords: string[];
  memeRelevanceScore: number;
  memeMatchedTopicId?: string;
  memeMatchedTopic?: string;
  memeMatchedTopicType?: TrendTopicType;
  memeEvidenceUrls: string[];
  memeMatchReasons: string[];
  memeRejectFlags: string[];
}

export interface ScoreSnapshot {
  mint: string;
  asOf: Date;
  graduationProbability: number;
  riskScore: number;
  trendScore: number;
  expectedValueScore: number;
  decision: Decision;
  reasons: string[];
  features: FeatureSnapshot;
}

export interface PaperOrder {
  id: string;
  mint: string;
  side: "buy" | "sell";
  status: "filled" | "rejected";
  reason: string;
  createdAt: Date;
  solAmount: number;
  tokenAmount: number;
  priceSol: number;
  feesSol: number;
  slippageSol: number;
  scoreSnapshot: ScoreSnapshot;
}

export interface PaperPosition {
  mint: string;
  status: "open" | "closed";
  openedAt: Date;
  closedAt?: Date;
  entryPriceSol: number;
  avgExitPriceSol?: number;
  tokensOpen: number;
  tokensBought: number;
  solInvested: number;
  solRealized: number;
  stopPriceSol: number;
  highPriceSol: number;
  ladderState: Record<string, boolean>;
}

export interface ExitEvent {
  id: string;
  mint: string;
  occurredAt: Date;
  reason:
    | "take_profit_2x"
    | "take_profit_3x"
    | "take_profit_5x"
    | "take_profit_10x"
    | "take_profit_15x"
    | "take_profit_25x"
    | "take_profit_50x"
    | "stop_loss"
    | "timeout"
    | "trailing_stop";
  tokenAmount: number;
  solAmount: number;
  priceSol: number;
  feesSol: number;
}

export interface TrendObservation {
  id: string;
  source: string;
  phrase: string;
  observedAt: Date;
  url?: string;
  title?: string;
  summary?: string;
  traffic?: number;
  weight: number;
  geo?: string;
  raw: JsonValue;
}

export interface TrendTopic {
  id: string;
  canonicalPhrase: string;
  aliases: string[];
  topicType: TrendTopicType;
  sourceCoverage: number;
  velocityScore: number;
  noveltyScore: number;
  geo?: string;
  firstSeen: Date;
  lastSeen: Date;
  evidenceUrls: string[];
  raw: JsonValue;
}

export type TrendRefreshRunStatus = "running" | "success" | "error" | "abandoned" | "skipped_budget" | "skipped_duplicate";

export interface TrendRefreshRun {
  id: string;
  source: string;
  model: string;
  promptVersion: string;
  refreshWindowStartedAt: Date;
  refreshWindowEndedAt: Date;
  startedAt: Date;
  completedAt?: Date;
  status: TrendRefreshRunStatus;
  topicsFound: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  estimatedCostUsd: number;
  responseId?: string;
  errorText?: string;
  raw: JsonValue;
}

export type StreamHealthStatus = "running" | "completed" | "error" | "stale" | "aborted";

export interface StreamHealthRun {
  id: string;
  source: string;
  startedAt: Date;
  connectedAt?: Date;
  disconnectedAt?: Date;
  lastEventAt?: Date;
  status: StreamHealthStatus;
  eventsRead: number;
  launchesRead: number;
  duplicateLaunches: number;
  parserRejects: number;
  reconnects: number;
  staleWarnings: number;
  eventsPerMinute: number;
  launchesPerMinute: number;
  duplicateRate: number;
  parserRejectRate: number;
  errorText?: string;
  raw: JsonValue;
}

export interface TokenMemeMatch {
  mint: string;
  observedAt: Date;
  memeRelevanceScore: number;
  topicId?: string;
  canonicalPhrase?: string;
  topicType?: TrendTopicType;
  aliases: string[];
  evidenceUrls: string[];
  reasons: string[];
  rejectFlags: string[];
  raw: JsonValue;
}

export interface RetentionRun {
  id: string;
  ranAt: Date;
  dryRun: boolean;
  rejectedRawRetentionHours: number;
  interestingRawRetentionDays: number;
  rawEventsDeleted: number;
  tradeEventsDeleted: number;
}

export interface RetentionPruneOptions {
  now: Date;
  rejectedRawRetentionHours: number;
  interestingRawRetentionDays: number;
  dryRun: boolean;
  pruneLaunches?: boolean;
  rawLaunchRetentionHours?: number;
  matchedLaunchRetentionDays?: number;
  rejectedLaunchRetentionDays?: number;
}

export interface RetentionPruneResult {
  rawEventsDeleted: number;
  tradeEventsDeleted: number;
  tokenLaunchesDeleted: number;
}
