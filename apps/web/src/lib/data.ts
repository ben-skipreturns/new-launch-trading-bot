import "server-only";

import { Pool } from "pg";
import type { ExitEvent, PaperOrder, ScoreSnapshot } from "@moonshot/core";
import { calculateDashboardMetrics, calculatePositionDerivedValues } from "./aggregate";
import { loadWorkspaceEnv } from "./env";
import type {
  DashboardSummary,
  DataState,
  LaunchDetail,
  PositionListItem,
  RadarReview,
  RadarReviewCandidate,
  RadarReviewRun,
  TopicListItem,
  TrendRadarHealth,
  LaunchListItem
} from "./types";

loadWorkspaceEnv();

let pool: Pool | undefined;

export async function getDashboardSummary(): Promise<DataState<DashboardSummary>> {
  return safeRead(emptyDashboard(), async () => {
    const [launches, positions, topics, exits, orderCounts, health, trendRadar] = await Promise.all([
      getLaunches(),
      getPositions(),
      getTopics(),
      getRecentExits(8),
      getOrderCounts(),
      getHealth(),
      getTrendRadarHealth()
    ]);
    const metrics = calculateDashboardMetrics({
      launches,
      positions,
      filledBuys: orderCounts.filledBuys,
      filledSells: orderCounts.filledSells,
      activeTopics: topics.length
    });
    return {
      generatedAt: new Date(),
      health,
      trendRadar,
      metrics,
      recentCandidates: launches.slice(0, 10),
      openPositions: positions.filter((position) => position.status === "open").slice(0, 8),
      activeTopics: topics.slice(0, 8),
      recentExits: exits
    };
  });
}

export async function getLaunchList(sort: "latest" | "meme" | "risk" | "ev" = "latest"): Promise<DataState<LaunchListItem[]>> {
  return safeRead([], async () => {
    const launches = await getLaunches(100);
    if (sort === "meme") return launches.sort((a, b) => b.memeRelevanceScore - a.memeRelevanceScore);
    if (sort === "risk") return launches.sort((a, b) => b.riskScore - a.riskScore);
    if (sort === "ev") return launches.sort((a, b) => b.expectedValueScore - a.expectedValueScore);
    return launches;
  });
}

export async function getTopicList(): Promise<DataState<TopicListItem[]>> {
  return safeRead([], () => getTopics(100));
}

export async function getTrendRadarStatus(): Promise<DataState<TrendRadarHealth>> {
  return safeRead(emptyTrendRadarHealth(), () => getTrendRadarHealth());
}

export async function getRadarReview(): Promise<DataState<RadarReview>> {
  return safeRead(emptyRadarReview(), () => getRadarReviewData());
}

export async function getPositionList(): Promise<DataState<PositionListItem[]>> {
  return safeRead([], () => getPositions(100));
}

export async function getLaunchDetail(mint: string): Promise<DataState<LaunchDetail | null>> {
  return safeRead(null, async () => {
    const launch = await getLaunchByMint(mint);
    if (!launch) return null;
    const [scoreRows, orderRows, exitRows, matchRows] = await Promise.all([
      query<ScoreRow>(
        `select mint, as_of, graduation_probability, risk_score, trend_score, expected_value_score, decision, reasons, feature_snapshot
         from score_snapshots where mint = $1 order by as_of desc limit 50`,
        [mint]
      ),
      query<PaperOrderRow>(`select * from paper_orders where mint = $1 order by created_at desc`, [mint]),
      query<ExitEventRow>(`select * from exit_events where mint = $1 order by occurred_at desc`, [mint]),
      query<TokenMemeMatchRow>(`select * from token_meme_matches where mint = $1 order by observed_at desc limit 1`, [mint])
    ]);

    const scoreHistory = scoreRows.map(scoreFromRow);
    const orders = orderRows.map(orderFromRow);
    const exits = exitRows.map(exitFromRow);
    const latestMatch = matchRows[0];
    return {
      launch,
      scoreHistory,
      orders,
      exits,
      memeEvidenceUrls: latestMatch?.evidence_urls ?? [],
      memeRejectFlags: latestMatch?.reject_flags ?? [],
      rawFeatures: scoreHistory[0]?.features
    };
  });
}

async function safeRead<T>(fallback: T, read: () => Promise<T>): Promise<DataState<T>> {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      data: fallback,
      error: "DATABASE_URL is not configured. Start Postgres and set DATABASE_URL to view live command-center data."
    };
  }
  try {
    return { ok: true, data: await read() };
  } catch (error) {
    return {
      ok: false,
      data: fallback,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getLaunches(limit = 50): Promise<LaunchListItem[]> {
  const rows = await query<LaunchRow>(
    `with latest_scores as (
       select
         s.mint,
         tl.name,
         tl.symbol,
         tl.created_at,
         s.as_of,
         s.graduation_probability,
         s.risk_score,
         s.trend_score,
         s.expected_value_score,
         s.decision,
         s.reasons,
         s.feature_snapshot,
         row_number() over (partition by s.mint order by s.as_of desc) as score_rank
       from score_snapshots s
       left join token_launches tl on tl.mint = s.mint
     )
     select *
     from latest_scores
     where score_rank = 1
     order by as_of desc
     limit $1`,
    [limit]
  );
  return rows.map(launchFromRow);
}

async function getLaunchByMint(mint: string): Promise<LaunchListItem | undefined> {
  const rows = await query<LaunchRow>(
    `select
       s.mint,
       tl.name,
       tl.symbol,
       tl.created_at,
       s.as_of,
       s.graduation_probability,
       s.risk_score,
       s.trend_score,
       s.expected_value_score,
       s.decision,
       s.reasons,
       s.feature_snapshot
     from score_snapshots s
     left join token_launches tl on tl.mint = s.mint
     where s.mint = $1
     order by s.as_of desc
     limit 1`,
    [mint]
  );
  return rows[0] ? launchFromRow(rows[0]) : undefined;
}

async function getPositions(limit = 50): Promise<PositionListItem[]> {
  const rows = await query<PositionRow>(
    `select
       p.*,
       tl.name,
       tl.symbol,
       latest.feature_snapshot
     from paper_positions p
     left join token_launches tl on tl.mint = p.mint
     left join lateral (
       select feature_snapshot
       from score_snapshots s
       where s.mint = p.mint
       order by s.as_of desc
       limit 1
     ) latest on true
     order by p.opened_at desc
     limit $1`,
    [limit]
  );
  return rows.map(positionFromRow);
}

async function getTopics(limit = 50): Promise<TopicListItem[]> {
  const rows = await query<TopicRow>(
    `select
       t.id,
       t.canonical_phrase,
       t.topic_type,
       t.source_coverage,
       t.velocity_score,
       t.novelty_score,
       t.first_seen,
       t.last_seen,
       t.evidence_urls,
       t.raw,
       count(distinct m.mint)::int as matched_launches
     from trend_topics t
     left join token_meme_matches m on m.topic_id = t.id
     where (
       select max(refresh_window_started_at)
       from trend_refresh_runs
       where source = 'openai-meme-radar' and status = 'success'
     ) is null
       or t.last_seen >= (
         select max(refresh_window_started_at)
         from trend_refresh_runs
         where source = 'openai-meme-radar' and status = 'success'
       )
     group by t.id
     order by t.last_seen desc, t.velocity_score desc
     limit $1`,
    [limit]
  );
  return rows.map(topicFromRow);
}

async function getRecentExits(limit = 8): Promise<ExitEvent[]> {
  const rows = await query<ExitEventRow>(`select * from exit_events order by occurred_at desc limit $1`, [limit]);
  return rows.map(exitFromRow);
}

async function getOrderCounts(): Promise<{ filledBuys: number; filledSells: number }> {
  const rows = await query<{ side: string; count: string }>(
    `select side, count(*)::text as count from paper_orders where status = 'filled' group by side`
  );
  return {
    filledBuys: Number(rows.find((row) => row.side === "buy")?.count ?? 0),
    filledSells: Number(rows.find((row) => row.side === "sell")?.count ?? 0)
  };
}

async function getHealth(): Promise<DashboardSummary["health"]> {
  const rows = await query<{
    latest_raw_event_at: Date | null;
    latest_score_at: Date | null;
    latest_trend_observation_at: Date | null;
  }>(
    `select
       (select max(observed_at) from raw_events) as latest_raw_event_at,
       (select max(as_of) from score_snapshots) as latest_score_at,
       (select max(observed_at) from trend_observations) as latest_trend_observation_at`
  );
  const row = rows[0];
  return {
    database: "connected",
    latestRawEventAt: row?.latest_raw_event_at ?? undefined,
    latestScoreAt: row?.latest_score_at ?? undefined,
    latestTrendObservationAt: row?.latest_trend_observation_at ?? undefined
  };
}

async function getTrendRadarHealth(): Promise<TrendRadarHealth> {
  if (!(await tableExists("trend_refresh_runs"))) return emptyTrendRadarHealth();

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [latestRows, totalRows] = await Promise.all([
    query<TrendRefreshRunRow>(`select * from trend_refresh_runs order by started_at desc limit 1`),
    query<{ today_cost_usd: string; month_cost_usd: string }>(
      `select
         coalesce(sum(estimated_cost_usd) filter (where status = 'success' and started_at >= $1), 0)::text as today_cost_usd,
         coalesce(sum(estimated_cost_usd) filter (where status = 'success' and started_at >= $2), 0)::text as month_cost_usd
       from trend_refresh_runs`,
      [dayStart, monthStart]
    )
  ]);
  const latest = latestRows[0];
  const totals = totalRows[0];
  return {
    latestRunAt: latest?.started_at ?? undefined,
    latestStatus: latest?.status,
    model: latest?.model,
    promptVersion: latest?.prompt_version,
    topicsFound: latest?.topics_found ?? 0,
    webSearchCalls: latest?.web_search_calls ?? 0,
    latestEstimatedCostUsd: Number(latest?.estimated_cost_usd ?? 0),
    estimatedCostTodayUsd: Number(totals?.today_cost_usd ?? 0),
    estimatedCostMonthUsd: Number(totals?.month_cost_usd ?? 0)
  };
}

async function getRadarReviewData(): Promise<RadarReview> {
  if (!(await tableExists("trend_refresh_runs"))) return emptyRadarReview();

  const [latest] = await query<TrendRefreshRunDetailRow>(`select * from trend_refresh_runs order by started_at desc limit 1`);
  if (!latest) return emptyRadarReview();

  const run = radarRunFromRow(latest);
  const activeTopics = await getTopics(100);

  const raw = isRecord(latest.raw) ? latest.raw : {};
  const active = activeTopics.map((topic) => activeCandidateFromTopic(topic));
  const watch = candidateArray(raw.applicationRejectedCandidates).map((candidate, index) =>
    radarCandidateFromRaw(candidate, "watch", `watch:${index}`)
  );
  const rejected = candidateArray(raw.rejectedCandidates).map((candidate, index) =>
    radarCandidateFromRaw(candidate, "rejected", `rejected:${index}`)
  );

  return { latestRun: run, active, watch, rejected };
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(`select to_regclass($1) is not null as exists`, [`public.${tableName}`]);
  return Boolean(rows[0]?.exists);
}

async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = getPool();
  const result = await client.query(text, params);
  return result.rows as T[];
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

function emptyDashboard(): DashboardSummary {
  return {
    generatedAt: new Date(),
    health: { database: process.env.DATABASE_URL ? "error" : "not_configured" },
    trendRadar: emptyTrendRadarHealth(),
    metrics: {
      activeTopics: 0,
      recentCandidates: 0,
      openPositions: 0,
      closedPositions: 0,
      filledBuys: 0,
      filledSells: 0,
      realizedPnlSol: 0,
      estimatedOpenValueSol: 0
    },
    recentCandidates: [],
    openPositions: [],
    activeTopics: [],
    recentExits: []
  };
}

function emptyTrendRadarHealth(): TrendRadarHealth {
  return {
    topicsFound: 0,
    webSearchCalls: 0,
    latestEstimatedCostUsd: 0,
    estimatedCostTodayUsd: 0,
    estimatedCostMonthUsd: 0
  };
}

function emptyRadarReview(): RadarReview {
  return {
    active: [],
    watch: [],
    rejected: []
  };
}

interface LaunchRow {
  mint: string;
  name: string | null;
  symbol: string | null;
  created_at: Date | null;
  as_of: Date;
  graduation_probability: string;
  risk_score: string;
  trend_score: string;
  expected_value_score: string;
  decision: string;
  reasons: string[];
  feature_snapshot: ScoreSnapshot["features"];
}

interface PositionRow {
  mint: string;
  status: string;
  opened_at: Date;
  closed_at: Date | null;
  entry_price_sol: string;
  tokens_open: string;
  tokens_bought: string;
  sol_invested: string;
  sol_realized: string;
  name: string | null;
  symbol: string | null;
  feature_snapshot: ScoreSnapshot["features"] | null;
}

interface TopicRow {
  id: string;
  canonical_phrase: string;
  topic_type: string;
  source_coverage: number;
  velocity_score: string;
  novelty_score: string;
  first_seen: Date;
  last_seen: Date;
  evidence_urls: string[];
  raw: unknown;
  matched_launches: number;
}

interface TrendRefreshRunRow {
  started_at: Date;
  status: string;
  model: string;
  prompt_version: string;
  topics_found: number;
  web_search_calls: number;
  estimated_cost_usd: string;
}

interface TrendRefreshRunDetailRow extends TrendRefreshRunRow {
  completed_at: Date | null;
  refresh_window_started_at: Date;
  refresh_window_ended_at: Date;
  error_text: string | null;
  raw: unknown;
}

interface ExitEventRow {
  id: string;
  mint: string;
  occurred_at: Date;
  reason: ExitEvent["reason"];
  token_amount: string;
  sol_amount: string;
  price_sol: string;
  fees_sol: string;
}

interface PaperOrderRow {
  id: string;
  mint: string;
  side: PaperOrder["side"];
  status: PaperOrder["status"];
  reason: string;
  created_at: Date;
  sol_amount: string;
  token_amount: string;
  price_sol: string;
  fees_sol: string;
  slippage_sol: string;
  score_snapshot: ScoreSnapshot;
}

interface ScoreRow {
  mint: string;
  as_of: Date;
  graduation_probability: string;
  risk_score: string;
  trend_score: string;
  expected_value_score: string;
  decision: string;
  reasons: string[];
  feature_snapshot: ScoreSnapshot["features"];
}

interface TokenMemeMatchRow {
  evidence_urls: string[];
  reject_flags: string[];
}

function launchFromRow(row: LaunchRow): LaunchListItem {
  const features = hydrateFeature(row.feature_snapshot);
  return {
    mint: row.mint,
    name: row.name ?? undefined,
    symbol: row.symbol ?? undefined,
    createdAt: row.created_at ?? undefined,
    latestScoreAt: row.as_of,
    decision: row.decision as LaunchListItem["decision"],
    graduationProbability: Number(row.graduation_probability),
    riskScore: Number(row.risk_score),
    trendScore: Number(row.trend_score),
    expectedValueScore: Number(row.expected_value_score),
    memeRelevanceScore: features.memeRelevanceScore,
    memeTopic: features.memeMatchedTopic,
    memeTopicType: features.memeMatchedTopicType,
    latestPriceSol: features.priceSol,
    reasons: row.reasons
  };
}

function positionFromRow(row: PositionRow): PositionListItem {
  const latestPriceSol = hydrateFeature(row.feature_snapshot)?.priceSol;
  const entryPriceSol = Number(row.entry_price_sol);
  const tokensOpen = Number(row.tokens_open);
  const tokensBought = Number(row.tokens_bought);
  const solInvested = Number(row.sol_invested);
  const solRealized = Number(row.sol_realized);
  const derived = calculatePositionDerivedValues({
    tokensOpen,
    tokensBought,
    solInvested,
    solRealized,
    entryPriceSol,
    latestPriceSol
  });
  return {
    mint: row.mint,
    name: row.name ?? undefined,
    symbol: row.symbol ?? undefined,
    status: row.status as PositionListItem["status"],
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    entryPriceSol,
    latestPriceSol,
    tokensOpen,
    tokensBought,
    solInvested,
    solRealized,
    ...derived
  };
}

function topicFromRow(row: TopicRow): TopicListItem {
  const openAiTopic = openAiMemeTopicFromRaw(row.raw);
  return {
    id: row.id,
    canonicalPhrase: row.canonical_phrase,
    topicType: row.topic_type as TopicListItem["topicType"],
    sourceCoverage: row.source_coverage,
    velocityScore: Number(row.velocity_score),
    noveltyScore: Number(row.novelty_score),
    memeabilityScore: numberValue(openAiTopic?.memeabilityScore),
    tokenizationLikelihood: numberValue(openAiTopic?.tokenizationLikelihood),
    saturationRisk: numberValue(openAiTopic?.saturationRisk),
    likelySymbols: stringArray(openAiTopic?.likelySymbols),
    reasonCodes: stringArray(openAiTopic?.reasonCodes),
    riskFlags: stringArray(openAiTopic?.riskFlags),
    launchThesis: stringValue(openAiTopic?.launchThesis),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    evidenceUrls: row.evidence_urls,
    matchedLaunches: row.matched_launches
  };
}

function radarRunFromRow(row: TrendRefreshRunDetailRow): RadarReviewRun {
  const raw = isRecord(row.raw) ? row.raw : {};
  return {
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    refreshWindowStartedAt: row.refresh_window_started_at,
    refreshWindowEndedAt: row.refresh_window_ended_at,
    status: row.status,
    model: row.model,
    promptVersion: row.prompt_version,
    topicsFound: row.topics_found,
    webSearchCalls: row.web_search_calls,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    errorText: row.error_text ?? undefined,
    modelActiveTopicCount: numberValue(raw.modelActiveTopicCount),
    acceptedTopicCount: numberValue(raw.acceptedTopicCount),
    modelRejectedCandidateCount: numberValue(raw.modelRejectedCandidateCount)
  };
}

function activeCandidateFromTopic(topic: TopicListItem): RadarReviewCandidate {
  return {
    id: topic.id,
    tier: "active",
    canonicalPhrase: topic.canonicalPhrase,
    topicType: topic.topicType,
    memeabilityScore: topic.memeabilityScore,
    tokenizationLikelihood: topic.tokenizationLikelihood,
    velocityScore: topic.velocityScore,
    noveltyScore: topic.noveltyScore,
    saturationRisk: topic.saturationRisk,
    sourceCoverage: topic.sourceCoverage,
    likelySymbols: topic.likelySymbols,
    reasonCodes: topic.reasonCodes,
    riskFlags: topic.riskFlags,
    rejectionReasons: [],
    launchThesis: topic.launchThesis,
    evidenceUrls: topic.evidenceUrls,
    matchedLaunches: topic.matchedLaunches
  };
}

function radarCandidateFromRaw(value: Record<string, unknown>, tier: RadarReviewCandidate["tier"], fallbackId: string): RadarReviewCandidate {
  const canonicalPhrase = stringValue(value.canonicalPhrase) ?? "unknown candidate";
  const topicType = stringValue(value.topicType);
  return {
    id: `${tier}:${canonicalPhrase}:${fallbackId}`,
    tier,
    canonicalPhrase,
    topicType: isTopicType(topicType) ? topicType : undefined,
    memeabilityScore: numberValue(value.memeabilityScore),
    tokenizationLikelihood: numberValue(value.tokenizationLikelihood),
    velocityScore: numberValue(value.velocityScore),
    noveltyScore: numberValue(value.noveltyScore),
    saturationRisk: numberValue(value.saturationRisk),
    sourceCoverage: numberValue(value.sourceCoverage),
    likelySymbols: stringArray(value.likelySymbols),
    reasonCodes: stringArray(value.reasonCodes),
    riskFlags: stringArray(value.riskFlags),
    rejectionReasons: stringArray(value.rejectionReasons),
    launchThesis: stringValue(value.launchThesis),
    evidenceUrls: stringArray(value.evidenceUrls)
  };
}

function candidateArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isTopicType(value: unknown): value is RadarReviewCandidate["topicType"] {
  return (
    value === "person" ||
    value === "animal" ||
    value === "politics" ||
    value === "sports" ||
    value === "entertainment" ||
    value === "internet_phrase" ||
    value === "ai" ||
    value === "crypto" ||
    value === "other"
  );
}

function scoreFromRow(row: ScoreRow): ScoreSnapshot {
  return {
    mint: row.mint,
    asOf: row.as_of,
    graduationProbability: Number(row.graduation_probability),
    riskScore: Number(row.risk_score),
    trendScore: Number(row.trend_score),
    expectedValueScore: Number(row.expected_value_score),
    decision: row.decision as ScoreSnapshot["decision"],
    reasons: row.reasons,
    features: hydrateFeature(row.feature_snapshot)
  };
}

function orderFromRow(row: PaperOrderRow): PaperOrder {
  return {
    id: row.id,
    mint: row.mint,
    side: row.side,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
    solAmount: Number(row.sol_amount),
    tokenAmount: Number(row.token_amount),
    priceSol: Number(row.price_sol),
    feesSol: Number(row.fees_sol),
    slippageSol: Number(row.slippage_sol),
    scoreSnapshot: row.score_snapshot
  };
}

function exitFromRow(row: ExitEventRow): ExitEvent {
  return {
    id: row.id,
    mint: row.mint,
    occurredAt: row.occurred_at,
    reason: row.reason,
    tokenAmount: Number(row.token_amount),
    solAmount: Number(row.sol_amount),
    priceSol: Number(row.price_sol),
    feesSol: Number(row.fees_sol)
  };
}

function hydrateFeature(features: ScoreSnapshot["features"] | null): ScoreSnapshot["features"] {
  if (!features) {
    return {
      mint: "",
      asOf: new Date(),
      triggerType: "event",
      triggerValue: "",
      ageSeconds: 0,
      vSolInBondingCurve: 0,
      bondingCurveProgress: 0,
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      uniqueTraders: 0,
      netSolFlow: 0,
      avgBuySol: 0,
      largestBuySol: 0,
      solAccumulationPerTrade: 0,
      botLikeShare: 0,
      washTradeShare: 0,
      creatorBuySol: 0,
      creatorSellSol: 0,
      devSupplyShare: 0,
      topHolderShare: 0,
      insiderShare: 0,
      bundlerShare: 0,
      sniperShare: 0,
      enrichmentFresh: false,
      trendKeywords: [],
      memeRelevanceScore: 0,
      memeEvidenceUrls: [],
      memeMatchReasons: [],
      memeRejectFlags: []
    };
  }
  return { ...features, asOf: new Date(features.asOf) };
}

function openAiMemeTopicFromRaw(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw)) return undefined;
  const topic = raw.openAiMemeTopic;
  return isRecord(topic) ? topic : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
