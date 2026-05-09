import type { Decision, ExitEvent, PaperOrder, PaperPosition, ScoreSnapshot, TrendTopicType } from "@moonshot/core";

export interface DataState<T> {
  ok: boolean;
  data: T;
  error?: string;
}

export interface HealthSummary {
  database: "connected" | "not_configured" | "error";
  latestRawEventAt?: Date;
  latestScoreAt?: Date;
  latestTrendObservationAt?: Date;
}

export interface DashboardMetrics {
  activeTopics: number;
  recentCandidates: number;
  openPositions: number;
  closedPositions: number;
  filledBuys: number;
  filledSells: number;
  realizedPnlSol: number;
  estimatedOpenValueSol: number;
}

export interface LaunchListItem {
  mint: string;
  name?: string;
  symbol?: string;
  createdAt?: Date;
  latestScoreAt?: Date;
  decision: Decision | "none";
  graduationProbability: number;
  riskScore: number;
  trendScore: number;
  expectedValueScore: number;
  memeRelevanceScore: number;
  memeTopic?: string;
  memeTopicType?: TrendTopicType;
  latestPriceSol?: number;
  reasons: string[];
}

export interface PositionListItem {
  mint: string;
  name?: string;
  symbol?: string;
  status: PaperPosition["status"];
  openedAt: Date;
  closedAt?: Date;
  entryPriceSol: number;
  latestPriceSol?: number;
  tokensOpen: number;
  tokensBought: number;
  solInvested: number;
  solRealized: number;
  estimatedOpenValueSol: number;
  estimatedPnlSol: number;
  moonbagPct: number;
}

export interface TopicListItem {
  id: string;
  canonicalPhrase: string;
  topicType: TrendTopicType;
  sourceCoverage: number;
  velocityScore: number;
  noveltyScore: number;
  firstSeen: Date;
  lastSeen: Date;
  evidenceUrls: string[];
  matchedLaunches: number;
}

export interface DashboardSummary {
  generatedAt: Date;
  health: HealthSummary;
  metrics: DashboardMetrics;
  recentCandidates: LaunchListItem[];
  openPositions: PositionListItem[];
  activeTopics: TopicListItem[];
  recentExits: ExitEvent[];
}

export interface LaunchDetail {
  launch: LaunchListItem;
  scoreHistory: ScoreSnapshot[];
  orders: PaperOrder[];
  exits: ExitEvent[];
  memeEvidenceUrls: string[];
  memeRejectFlags: string[];
  rawFeatures?: ScoreSnapshot["features"];
}
