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
  stats: RawLaunchStats;
  streamHealth: StreamHealthListItem[];
  sources: string[];
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface RawLaunchStats {
  total: number;
  rawOnly: number;
  matched: number;
  scored: number;
  latestCreatedAt?: Date;
}

export type RawLaunchStatusFilter = "all" | "raw" | "matched" | "scored";

export interface RawLaunchFilters {
  status: RawLaunchStatusFilter;
  source?: string;
  hours?: number;
}

export interface StreamHealthListItem {
  id: string;
  source: string;
  startedAt: Date;
  connectedAt?: Date;
  disconnectedAt?: Date;
  lastEventAt?: Date;
  status: string;
  eventsRead: number;
  launchesRead: number;
  duplicateLaunches: number;
  reconnects: number;
  staleWarnings: number;
  errorText?: string;
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
  memeReasons: string[];
  memeRejectFlags: string[];
  matcherDiagnostics?: MatcherDiagnostics;
  rawFeatures?: ScoreSnapshot["features"];
}

export interface MatcherDiagnostics {
  observedAt?: Date;
  memeRelevanceScore: number;
  topic?: string;
  topicType?: TrendTopicType;
  candidateText?: string;
  candidateParts: Array<{ label: string; value: string }>;
  matchedAliases: Array<{ alias: string; reason: string; strength?: number }>;
  scoreComponents: Array<{ label: string; value: string }>;
  topicsLoaded?: number;
  temporallyEligibleTopics?: number;
  matchableTopics?: number;
  metadataStatus?: string;
  metadataFailureReason?: string;
  rawSummary?: string;
}

export interface MatcherCalibrationItem {
  mint: string;
  name?: string;
  symbol?: string;
  createdAt?: Date;
  observedAt: Date;
  memeRelevanceScore: number;
  canonicalPhrase?: string;
  topicType?: TrendTopicType;
  reasons: string[];
  rejectFlags: string[];
  decision: Decision | "none";
  expectedValueScore?: number;
  metadataFailureReason?: string;
  matchedAlias?: string;
}

export interface MatcherCalibrationSummary {
  totalMatches: number;
  passes: number;
  rejects: number;
  genericRejects: number;
  metadataFailures: number;
  weakOverlapRejects: number;
  latestObservedAt?: Date;
}

export interface MatcherCalibrationReport {
  generatedAt: Date;
  summary: MatcherCalibrationSummary;
  highestScoringRejects: MatcherCalibrationItem[];
  lowestScoringPasses: MatcherCalibrationItem[];
  genericCopycatRejects: MatcherCalibrationItem[];
  metadataFailures: MatcherCalibrationItem[];
  weakOverlapRejects: MatcherCalibrationItem[];
}
