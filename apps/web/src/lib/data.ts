import "server-only";

import { Pool } from "pg";
import type { ExitEvent, PaperOrder, ScoreSnapshot } from "@moonshot/core";
import { calculateDashboardMetrics, calculatePositionDerivedValues } from "./aggregate";
import { buildDecisionReview, buildLaunchGateAudit, emptyDecisionReview, type DecisionBuyOrderInput, type DecisionRawCounts } from "./decision-review";
import { loadWorkspaceEnv } from "./env";
import type {
  DashboardSummary,
  DataState,
  DecisionReview,
  LaunchDetail,
  PositionListItem,
  RadarReview,
  RadarReviewCandidate,
  RadarReviewRun,
  MatcherCalibrationItem,
  MatcherCalibrationReport,
  MatcherDiagnostics,
  RawLaunchFilters,
  RawLaunchListItem,
  RawLaunchPage,
  RawLaunchStats,
  RawLaunchStatusFilter,
  StreamHealthListItem,
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

export async function getDecisionReview(): Promise<DataState<DecisionReview>> {
  return safeRead(emptyDecisionReview(), async () => {
    const [launches, rawCounts, buyOrders, positions] = await Promise.all([
      getLaunches(5000),
      getDecisionRawCounts(),
      getDecisionBuyOrders(),
      getPositions(1000)
    ]);
    return buildDecisionReview({ launches, rawCounts, buyOrders, positions });
  });
}

export async function getRawLaunchPage(page = 1, pageSize = 25, filters: Partial<RawLaunchFilters> = {}): Promise<DataState<RawLaunchPage>> {
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedPageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const normalizedFilters = normalizeRawLaunchFilters(filters);
  return safeRead(emptyRawLaunchPage(normalizedPage, normalizedPageSize), () =>
    getRawLaunches(normalizedPage, normalizedPageSize, normalizedFilters)
  );
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
    const [scoreRows, orderRows, exitRows, matchRows, metadataFailureRows] = await Promise.all([
      query<ScoreRow>(
        `select mint, as_of, graduation_probability, risk_score, trend_score, expected_value_score, decision, reasons, feature_snapshot
         from score_snapshots where mint = $1 order by as_of desc limit 50`,
        [mint]
      ),
      query<PaperOrderRow>(`select * from paper_orders where mint = $1 order by created_at desc`, [mint]),
      query<ExitEventRow>(`select * from exit_events where mint = $1 order by occurred_at desc`, [mint]),
      query<TokenMemeMatchRow>(
        `select observed_at, meme_relevance_score, canonical_phrase, topic_type, evidence_urls, reasons, reject_flags, raw
         from token_meme_matches where mint = $1 order by observed_at desc limit 1`,
        [mint]
      ),
      query<{ raw: unknown }>(
        `select raw from token_enrichments where mint = $1 and provider = 'token-metadata-uri-failed' order by observed_at desc limit 1`,
        [mint]
      )
    ]);

    const scoreHistory = scoreRows.map(scoreFromRow);
    const orders = orderRows.map(orderFromRow);
    const exits = exitRows.map(exitFromRow);
    const latestMatch = matchRows[0];
    const matcherDiagnostics = latestMatch ? matcherDiagnosticsFromRow(latestMatch) : undefined;
    const metadataFailure = metadataFailureReason(metadataFailureRows[0]?.raw);
    if (matcherDiagnostics && metadataFailure) {
      matcherDiagnostics.metadataStatus = "failed";
      matcherDiagnostics.metadataFailureReason = metadataFailure;
    }
    return {
      launch,
      scoreHistory,
      orders,
      exits,
      gateAudit: buildLaunchGateAudit(launch, scoreHistory[0]?.features, orders),
      memeEvidenceUrls: latestMatch?.evidence_urls ?? [],
      memeReasons: latestMatch?.reasons ?? [],
      memeRejectFlags: latestMatch?.reject_flags ?? [],
      matcherDiagnostics,
      rawFeatures: scoreHistory[0]?.features
    };
  });
}

export async function getMatcherCalibrationReport(): Promise<DataState<MatcherCalibrationReport>> {
  return safeRead(emptyMatcherCalibrationReport(), async () => {
    const rows = await query<CalibrationMatchRow>(
      `select
         m.mint,
         m.observed_at,
         m.meme_relevance_score,
         m.canonical_phrase,
         m.topic_type,
         m.evidence_urls,
         m.reasons,
         m.reject_flags,
         m.raw,
         tl.name,
         tl.symbol,
         tl.created_at,
         latest_score.decision,
         latest_score.expected_value_score,
         metadata_failure.raw as metadata_failure_raw
       from token_meme_matches m
       join token_launches tl on tl.mint = m.mint
       left join lateral (
         select decision, expected_value_score
         from score_snapshots s
         where s.mint = m.mint
         order by s.as_of desc
         limit 1
       ) latest_score on true
       left join lateral (
         select raw
         from token_enrichments e
         where e.mint = m.mint and e.provider = 'token-metadata-uri-failed'
         order by e.observed_at desc
         limit 1
       ) metadata_failure on true
       order by m.observed_at desc
       limit 1000`
    );
    return matcherCalibrationFromRows(rows);
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
  const rows = await query<LaunchDetailLaunchRow>(
    `select
       tl.mint,
       tl.name,
       tl.symbol,
       tl.created_at,
       latest_score.as_of,
       latest_score.graduation_probability,
       latest_score.risk_score,
       latest_score.trend_score,
       latest_score.expected_value_score,
       latest_score.decision,
       latest_score.reasons,
       latest_score.feature_snapshot,
       latest_match.observed_at as match_observed_at,
       latest_match.meme_relevance_score,
       latest_match.canonical_phrase,
       latest_match.topic_type
     from token_launches tl
     left join lateral (
       select *
       from score_snapshots s
       where s.mint = tl.mint
       order by s.as_of desc
       limit 1
     ) latest_score on true
     left join lateral (
       select *
       from token_meme_matches m
       where m.mint = tl.mint
       order by m.observed_at desc
       limit 1
     ) latest_match on true
     where tl.mint = $1
     limit 1`,
    [mint]
  );
  return rows[0] ? launchFromDetailRow(rows[0]) : undefined;
}

async function getRawLaunches(page: number, pageSize: number, filters: RawLaunchFilters): Promise<RawLaunchPage> {
  const offset = (page - 1) * pageSize;
  const where = buildRawLaunchWhere(filters);
  const [rows, statsRows, sourceRows, streamHealth] = await Promise.all([
    query<RawLaunchRow>(
      `select
         tl.mint,
         tl.source,
         tl.signature,
         tl.pool,
         tl.creator,
         tl.name,
         tl.symbol,
         tl.uri,
         tl.supply,
         tl.created_at,
         tl.initial_buy_tokens,
         tl.initial_buy_sol,
         tl.v_sol_in_bonding_curve,
         tl.market_cap_sol,
         exists(select 1 from token_meme_matches m where m.mint = tl.mint) as has_meme_match,
         exists(select 1 from score_snapshots s where s.mint = tl.mint) as has_score
       from token_launches tl
       ${where.sql}
       order by tl.created_at desc
       limit $${where.params.length + 1} offset $${where.params.length + 2}`,
      [...where.params, pageSize, offset]
    ),
    query<RawLaunchStatsRow>(
      `select
         count(*)::text as total_count,
         count(*) filter (
           where not exists(select 1 from token_meme_matches m where m.mint = tl.mint)
             and not exists(select 1 from score_snapshots s where s.mint = tl.mint)
         )::text as raw_only_count,
         count(*) filter (where exists(select 1 from token_meme_matches m where m.mint = tl.mint))::text as matched_count,
         count(*) filter (where exists(select 1 from score_snapshots s where s.mint = tl.mint))::text as scored_count,
         max(created_at) as latest_created_at
       from token_launches tl
       ${where.sql}`,
      where.params
    ),
    query<{ source: string }>(`select distinct source from token_launches order by source`),
    getStreamHealthRows(5)
  ]);
  const stats = rawLaunchStatsFromRow(statsRows[0]);
  const total = stats.total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items: rows.map(rawLaunchFromRow),
    total,
    stats,
    streamHealth,
    sources: sourceRows.map((row) => row.source),
    page,
    pageSize,
    totalPages,
    hasPrevious: page > 1,
    hasNext: offset + rows.length < total
  };
}

function normalizeRawLaunchFilters(filters: Partial<RawLaunchFilters>): RawLaunchFilters {
  const status = isRawLaunchStatusFilter(filters.status) ? filters.status : "all";
  const source = filters.source?.trim() || undefined;
  const hours = typeof filters.hours === "number" && Number.isFinite(filters.hours) && filters.hours > 0 ? Math.min(filters.hours, 24 * 30) : undefined;
  return { status, source, hours };
}

function buildRawLaunchWhere(filters: RawLaunchFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.source) {
    params.push(filters.source);
    clauses.push(`tl.source = $${params.length}`);
  }
  if (filters.hours) {
    params.push(new Date(Date.now() - filters.hours * 60 * 60 * 1000));
    clauses.push(`tl.created_at >= $${params.length}`);
  }
  if (filters.status === "raw") {
    clauses.push("not exists(select 1 from token_meme_matches m where m.mint = tl.mint)");
    clauses.push("not exists(select 1 from score_snapshots s where s.mint = tl.mint)");
  }
  if (filters.status === "matched") clauses.push("exists(select 1 from token_meme_matches m where m.mint = tl.mint)");
  if (filters.status === "scored") clauses.push("exists(select 1 from score_snapshots s where s.mint = tl.mint)");
  return {
    sql: clauses.length > 0 ? `where ${clauses.join(" and ")}` : "",
    params
  };
}

function isRawLaunchStatusFilter(value: unknown): value is RawLaunchStatusFilter {
  return value === "all" || value === "raw" || value === "matched" || value === "scored";
}

async function getStreamHealthRows(limit: number): Promise<StreamHealthListItem[]> {
  if (!(await tableExists("stream_health_runs"))) return [];
  const rows = await query<StreamHealthRow>(`select * from stream_health_runs order by started_at desc limit $1`, [limit]);
  return rows.map(streamHealthFromRow);
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

async function getDecisionRawCounts(): Promise<DecisionRawCounts> {
  const rows = await query<DecisionRawCountsRow>(
    `select
       (select count(*)::text from token_launches) as total_launches,
       (select count(distinct mint)::text from token_meme_matches) as meme_matched_launches,
       (select count(*)::text from exit_events) as exit_events`
  );
  const row = rows[0];
  return {
    totalLaunches: Number(row?.total_launches ?? 0),
    memeMatchedLaunches: Number(row?.meme_matched_launches ?? 0),
    exitEvents: Number(row?.exit_events ?? 0)
  };
}

async function getDecisionBuyOrders(): Promise<DecisionBuyOrderInput[]> {
  const rows = await query<DecisionBuyOrderRow>(
    `select mint, status, reason, created_at, score_snapshot
     from paper_orders
     where side = 'buy'
     order by created_at desc
     limit 5000`
  );
  return rows.map((row) => ({
    mint: row.mint,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
    scoreReasons: Array.isArray(row.score_snapshot?.reasons) ? row.score_snapshot.reasons : []
  }));
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

function emptyRawLaunchPage(page: number, pageSize: number): RawLaunchPage {
  return {
    items: [],
    total: 0,
    stats: {
      total: 0,
      rawOnly: 0,
      matched: 0,
      scored: 0
    },
    streamHealth: [],
    sources: [],
    page,
    pageSize,
    totalPages: 1,
    hasPrevious: false,
    hasNext: false
  };
}

function emptyMatcherCalibrationReport(): MatcherCalibrationReport {
  return {
    generatedAt: new Date(),
    summary: {
      totalMatches: 0,
      passes: 0,
      rejects: 0,
      genericRejects: 0,
      metadataFailures: 0,
      weakOverlapRejects: 0
    },
    highestScoringRejects: [],
    lowestScoringPasses: [],
    genericCopycatRejects: [],
    metadataFailures: [],
    weakOverlapRejects: []
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

interface LaunchDetailLaunchRow {
  mint: string;
  name: string | null;
  symbol: string | null;
  created_at: Date | null;
  as_of: Date | null;
  graduation_probability: string | null;
  risk_score: string | null;
  trend_score: string | null;
  expected_value_score: string | null;
  decision: string | null;
  reasons: string[] | null;
  feature_snapshot: ScoreSnapshot["features"] | null;
  match_observed_at: Date | null;
  meme_relevance_score: string | null;
  canonical_phrase: string | null;
  topic_type: string | null;
}

interface RawLaunchRow {
  mint: string;
  source: string;
  signature: string;
  pool: string;
  creator: string | null;
  name: string | null;
  symbol: string | null;
  uri: string | null;
  supply: string | null;
  created_at: Date;
  initial_buy_tokens: string | null;
  initial_buy_sol: string | null;
  v_sol_in_bonding_curve: string | null;
  market_cap_sol: string | null;
  has_meme_match: boolean;
  has_score: boolean;
}

interface RawLaunchStatsRow {
  total_count: string;
  raw_only_count: string;
  matched_count: string;
  scored_count: string;
  latest_created_at: Date | null;
}

interface DecisionRawCountsRow {
  total_launches: string;
  meme_matched_launches: string;
  exit_events: string;
}

interface DecisionBuyOrderRow {
  mint: string;
  status: "filled" | "rejected";
  reason: string;
  created_at: Date;
  score_snapshot: ScoreSnapshot | null;
}

interface StreamHealthRow {
  id: string;
  source: string;
  started_at: Date;
  connected_at: Date | null;
  disconnected_at: Date | null;
  last_event_at: Date | null;
  status: string;
  events_read: number;
  launches_read: number;
  duplicate_launches: number;
  parser_rejects: number;
  reconnects: number;
  stale_warnings: number;
  events_per_minute: string;
  launches_per_minute: string;
  duplicate_rate: string;
  parser_reject_rate: string;
  error_text: string | null;
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
  stop_price_sol: string;
  high_price_sol: string;
  ladder_state: unknown;
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
  observed_at: Date;
  meme_relevance_score: string;
  canonical_phrase: string | null;
  topic_type: string | null;
  evidence_urls: string[];
  reasons: string[];
  reject_flags: string[];
  raw: unknown;
}

interface CalibrationMatchRow extends TokenMemeMatchRow {
  mint: string;
  name: string | null;
  symbol: string | null;
  created_at: Date | null;
  decision: string | null;
  expected_value_score: string | null;
  metadata_failure_raw: unknown;
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

function launchFromDetailRow(row: LaunchDetailLaunchRow): LaunchListItem {
  const features = hydrateFeature(row.feature_snapshot);
  return {
    mint: row.mint,
    name: row.name ?? undefined,
    symbol: row.symbol ?? undefined,
    createdAt: row.created_at ?? undefined,
    latestScoreAt: row.as_of ?? row.match_observed_at ?? row.created_at ?? undefined,
    decision: (row.decision as LaunchListItem["decision"] | null) ?? "none",
    graduationProbability: Number(row.graduation_probability ?? 0),
    riskScore: Number(row.risk_score ?? 0),
    trendScore: Number(row.trend_score ?? 0),
    expectedValueScore: Number(row.expected_value_score ?? 0),
    memeRelevanceScore: row.meme_relevance_score !== null ? Number(row.meme_relevance_score) : features.memeRelevanceScore,
    memeTopic: row.canonical_phrase ?? features.memeMatchedTopic,
    memeTopicType: (row.topic_type as LaunchListItem["memeTopicType"] | null) ?? features.memeMatchedTopicType,
    latestPriceSol: features.priceSol,
    reasons: row.reasons ?? []
  };
}

function rawLaunchFromRow(row: RawLaunchRow): RawLaunchListItem {
  return {
    mint: row.mint,
    source: row.source,
    signature: row.signature,
    pool: row.pool,
    creator: row.creator ?? undefined,
    name: row.name ?? undefined,
    symbol: row.symbol ?? undefined,
    uri: row.uri ?? undefined,
    supply: numericValue(row.supply),
    createdAt: row.created_at,
    initialBuyTokens: numericValue(row.initial_buy_tokens),
    initialBuySol: numericValue(row.initial_buy_sol),
    vSolInBondingCurve: numericValue(row.v_sol_in_bonding_curve),
    marketCapSol: numericValue(row.market_cap_sol),
    hasMemeMatch: row.has_meme_match,
    hasScore: row.has_score
  };
}

function rawLaunchStatsFromRow(row: RawLaunchStatsRow | undefined): RawLaunchStats {
  return {
    total: Number(row?.total_count ?? 0),
    rawOnly: Number(row?.raw_only_count ?? 0),
    matched: Number(row?.matched_count ?? 0),
    scored: Number(row?.scored_count ?? 0),
    latestCreatedAt: row?.latest_created_at ?? undefined
  };
}

function streamHealthFromRow(row: StreamHealthRow): StreamHealthListItem {
  return {
    id: row.id,
    source: row.source,
    startedAt: row.started_at,
    connectedAt: row.connected_at ?? undefined,
    disconnectedAt: row.disconnected_at ?? undefined,
    lastEventAt: row.last_event_at ?? undefined,
    status: row.status,
    eventsRead: row.events_read,
    launchesRead: row.launches_read,
    duplicateLaunches: row.duplicate_launches,
    parserRejects: row.parser_rejects,
    reconnects: row.reconnects,
    staleWarnings: row.stale_warnings,
    eventsPerMinute: Number(row.events_per_minute),
    launchesPerMinute: Number(row.launches_per_minute),
    duplicateRate: Number(row.duplicate_rate),
    parserRejectRate: Number(row.parser_reject_rate),
    errorText: row.error_text ?? undefined
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
    stopPriceSol: numericValue(row.stop_price_sol),
    highPriceSol: numericValue(row.high_price_sol),
    ladderState: booleanRecord(row.ladder_state),
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

function matcherDiagnosticsFromRow(row: TokenMemeMatchRow): MatcherDiagnostics {
  const raw = isRecord(row.raw) ? row.raw : {};
  const bestTopic = isRecord(raw.bestTopic) ? raw.bestTopic : undefined;
  const candidateParts = isRecord(raw.candidateParts) ? raw.candidateParts : {};
  const scoreComponents = isRecord(bestTopic?.scoreComponents) ? bestTopic.scoreComponents : {};
  const matchedAliases = Array.isArray(bestTopic?.matchedAliases) ? bestTopic.matchedAliases.filter(isRecord) : [];
  const metadata = metadataStatusFromCandidateParts(candidateParts);
  return {
    observedAt: row.observed_at,
    memeRelevanceScore: Number(row.meme_relevance_score),
    topic: row.canonical_phrase ?? undefined,
    topicType: isTopicType(row.topic_type) ? row.topic_type : undefined,
    candidateText: stringValue(raw.candidateText),
    candidateParts: Object.entries(candidateParts)
      .map(([label, value]) => ({ label, value: typeof value === "string" ? value : value === null || value === undefined ? "" : String(value) }))
      .filter((item) => item.value.trim().length > 0),
    matchedAliases: matchedAliases.map((item) => ({
      alias: stringValue(item.alias) ?? "-",
      reason: stringValue(item.reason) ?? "-",
      strength: numberValue(item.strength)
    })),
    scoreComponents: Object.entries(scoreComponents).map(([label, value]) => ({
      label,
      value: typeof value === "number" ? value.toFixed(3) : String(value)
    })),
    topicsLoaded: numberValue(raw.topicsLoaded),
    temporallyEligibleTopics: numberValue(raw.temporallyEligibleTopics),
    matchableTopics: numberValue(raw.matchableTopics),
    metadataStatus: metadata.status,
    metadataFailureReason: metadata.failureReason,
    rawSummary: JSON.stringify(raw, null, 2)
  };
}

function matcherCalibrationFromRows(rows: CalibrationMatchRow[]): MatcherCalibrationReport {
  const items = rows.map(calibrationItemFromRow);
  const passes = items.filter((item) => item.rejectFlags.length === 0);
  const rejects = items.filter((item) => item.rejectFlags.length > 0);
  const genericRejects = items.filter((item) => item.rejectFlags.includes("GENERIC_SYMBOL_ONLY") || item.reasons.includes("GENERIC_COPYCAT_PENALTY"));
  const metadataFailures = items.filter((item) => Boolean(item.metadataFailureReason));
  const weakOverlapRejects = rejects.filter((item) => item.memeRelevanceScore >= 0.4 && item.memeRelevanceScore < 0.7);
  return {
    generatedAt: new Date(),
    summary: {
      totalMatches: items.length,
      passes: passes.length,
      rejects: rejects.length,
      genericRejects: genericRejects.length,
      metadataFailures: metadataFailures.length,
      weakOverlapRejects: weakOverlapRejects.length,
      latestObservedAt: items[0]?.observedAt
    },
    highestScoringRejects: [...rejects].sort((a, b) => b.memeRelevanceScore - a.memeRelevanceScore).slice(0, 20),
    lowestScoringPasses: [...passes].sort((a, b) => a.memeRelevanceScore - b.memeRelevanceScore).slice(0, 20),
    genericCopycatRejects: genericRejects.slice(0, 20),
    metadataFailures: metadataFailures.slice(0, 20),
    weakOverlapRejects: weakOverlapRejects.sort((a, b) => b.memeRelevanceScore - a.memeRelevanceScore).slice(0, 20)
  };
}

function calibrationItemFromRow(row: CalibrationMatchRow): MatcherCalibrationItem {
  const diagnostics = matcherDiagnosticsFromRow(row);
  return {
    mint: row.mint,
    name: row.name ?? undefined,
    symbol: row.symbol ?? undefined,
    createdAt: row.created_at ?? undefined,
    observedAt: row.observed_at,
    memeRelevanceScore: Number(row.meme_relevance_score),
    canonicalPhrase: row.canonical_phrase ?? undefined,
    topicType: isTopicType(row.topic_type) ? row.topic_type : undefined,
    reasons: row.reasons,
    rejectFlags: row.reject_flags,
    decision: (row.decision as MatcherCalibrationItem["decision"] | null) ?? "none",
    expectedValueScore: numericValue(row.expected_value_score),
    metadataFailureReason: metadataFailureReason(row.metadata_failure_raw),
    matchedAlias: diagnostics.matchedAliases[0]?.alias
  };
}

function metadataStatusFromCandidateParts(candidateParts: Record<string, unknown>): { status?: string; failureReason?: string } {
  const metadataText = stringValue(candidateParts.metadataText);
  if (!metadataText) return {};
  if (metadataText.includes("token-metadata-uri-failed") || metadataText.includes("metadata_fetch")) return { status: "failed" };
  return { status: "available" };
}

function metadataFailureReason(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return stringValue(raw.reason);
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

function numericValue(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanRecord(value: unknown): Record<string, boolean> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
