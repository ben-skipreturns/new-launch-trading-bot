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

export interface TrendRadarHealth {
  latestRunAt?: Date;
  latestStatus?: string;
  model?: string;
  promptVersion?: string;
  topicsFound: number;
  webSearchCalls: number;
  latestEstimatedCostUsd: number;
  estimatedCostTodayUsd: number;
  estimatedCostMonthUsd: number;
}

export type RadarReviewTier = "active" | "watch" | "rejected";

export interface RadarReviewCandidate {
  id: string;
  tier: RadarReviewTier;
  canonicalPhrase: string;
  topicType?: TrendTopicType;
  memeabilityScore?: number;
  tokenizationLikelihood?: number;
  velocityScore?: number;
  noveltyScore?: number;
  saturationRisk?: number;
  sourceCoverage?: number;
  likelySymbols: string[];
  reasonCodes: string[];
  riskFlags: string[];
  rejectionReasons: string[];
  launchThesis?: string;
  evidenceUrls: string[];
  matchedLaunches?: number;
}

export interface RadarReviewRun {
  startedAt: Date;
  completedAt?: Date;
  refreshWindowStartedAt: Date;
  refreshWindowEndedAt: Date;
  status: string;
  model: string;
  promptVersion: string;
  topicsFound: number;
  webSearchCalls: number;
  estimatedCostUsd: number;
  errorText?: string;
  modelActiveTopicCount?: number;
  acceptedTopicCount?: number;
  modelRejectedCandidateCount?: number;
}

export interface RadarReview {
  latestRun?: RadarReviewRun;
  active: RadarReviewCandidate[];
  watch: RadarReviewCandidate[];
  rejected: RadarReviewCandidate[];
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

export interface RawLaunchListItem {
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
  hasMemeMatch: boolean;
  hasScore: boolean;
}

export interface RawLaunchPage {
  items: RawLaunchListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
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
  memeabilityScore?: number;
  tokenizationLikelihood?: number;
  saturationRisk?: number;
  likelySymbols: string[];
  reasonCodes: string[];
  riskFlags: string[];
  launchThesis?: string;
  firstSeen: Date;
  lastSeen: Date;
  evidenceUrls: string[];
  matchedLaunches: number;
}

export interface DashboardSummary {
  generatedAt: Date;
  health: HealthSummary;
  trendRadar: TrendRadarHealth;
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
