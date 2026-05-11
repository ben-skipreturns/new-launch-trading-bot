import { Generated, Kysely, PostgresDialect, sql, type Selectable } from "kysely";
import pg from "pg";
import type {
  ExitEvent,
  FeatureSnapshot,
  JsonValue,
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

interface RawEventsTable {
  id: Generated<number>;
  source: string;
  signature: string;
  mint: string | null;
  event_type: string;
  observed_at: Date;
  payload: JsonValue;
  created_at: Generated<Date>;
}

interface TokenLaunchesTable {
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
  raw: JsonValue;
}

interface TradeEventsTable {
  signature: string;
  source: string;
  mint: string;
  event_type: string;
  trader: string | null;
  occurred_at: Date;
  token_amount: string | null;
  sol_amount: string | null;
  v_sol_in_bonding_curve: string | null;
  price_sol: string | null;
  market_cap_sol: string | null;
  is_bot_like: boolean;
  is_wash_trade: boolean;
  raw: JsonValue;
}

interface TokenEnrichmentsTable {
  id: Generated<number>;
  mint: string;
  observed_at: Date;
  provider: string;
  price_sol: string | null;
  price_usd: string | null;
  liquidity_usd: string | null;
  holder_count: number | null;
  top_holder_share: string | null;
  dev_holding_share: string | null;
  insider_share: string | null;
  bundler_share: string | null;
  sniper_share: string | null;
  organic_score: string | null;
  sentiment_keywords: string[];
  social_links: JsonValue;
  raw: JsonValue;
}

interface FeatureSnapshotsTable {
  id: Generated<number>;
  mint: string;
  as_of: Date;
  trigger_type: string;
  trigger_value: string;
  features: JsonValue;
}

interface ScoreSnapshotsTable {
  id: Generated<number>;
  mint: string;
  as_of: Date;
  graduation_probability: string;
  risk_score: string;
  trend_score: string;
  expected_value_score: string;
  decision: string;
  reasons: string[];
  feature_snapshot: JsonValue;
}

interface PaperOrdersTable {
  id: string;
  mint: string;
  side: string;
  status: string;
  reason: string;
  created_at: Date;
  sol_amount: string;
  token_amount: string;
  price_sol: string;
  fees_sol: string;
  slippage_sol: string;
  score_snapshot: JsonValue;
}

interface PaperPositionsTable {
  mint: string;
  status: string;
  opened_at: Date;
  closed_at: Date | null;
  entry_price_sol: string;
  avg_exit_price_sol: string | null;
  tokens_open: string;
  tokens_bought: string;
  sol_invested: string;
  sol_realized: string;
  stop_price_sol: string;
  high_price_sol: string;
  ladder_state: JsonValue;
}

interface ExitEventsTable {
  id: string;
  mint: string;
  occurred_at: Date;
  reason: string;
  token_amount: string;
  sol_amount: string;
  price_sol: string;
  fees_sol: string;
}

interface TrendTopicsTable {
  id: string;
  canonical_phrase: string;
  aliases: string[];
  topic_type: string;
  source_coverage: number;
  velocity_score: string;
  novelty_score: string;
  geo: string | null;
  first_seen: Date;
  last_seen: Date;
  evidence_urls: string[];
  raw: JsonValue;
}

interface TrendObservationsTable {
  id: string;
  topic_id: string | null;
  source: string;
  phrase: string;
  observed_at: Date;
  url: string | null;
  title: string | null;
  summary: string | null;
  traffic: string | null;
  weight: string;
  geo: string | null;
  raw: JsonValue;
}

interface TrendRefreshRunsTable {
  id: string;
  source: string;
  model: string;
  prompt_version: string;
  refresh_window_started_at: Date;
  refresh_window_ended_at: Date;
  started_at: Date;
  completed_at: Date | null;
  status: string;
  topics_found: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  web_search_calls: number;
  estimated_cost_usd: string;
  response_id: string | null;
  error_text: string | null;
  raw: JsonValue;
}

interface StreamHealthRunsTable {
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
  raw: JsonValue;
}

interface TokenMemeMatchesTable {
  mint: string;
  observed_at: Date;
  meme_relevance_score: string;
  topic_id: string | null;
  canonical_phrase: string | null;
  topic_type: string | null;
  aliases: string[];
  evidence_urls: string[];
  reasons: string[];
  reject_flags: string[];
  raw: JsonValue;
}

interface RetentionRunsTable {
  id: string;
  ran_at: Date;
  dry_run: boolean;
  rejected_raw_retention_hours: number;
  interesting_raw_retention_days: number;
  raw_events_deleted: number;
  trade_events_deleted: number;
}

interface Database {
  raw_events: RawEventsTable;
  token_launches: TokenLaunchesTable;
  trade_events: TradeEventsTable;
  token_enrichments: TokenEnrichmentsTable;
  feature_snapshots: FeatureSnapshotsTable;
  score_snapshots: ScoreSnapshotsTable;
  paper_orders: PaperOrdersTable;
  paper_positions: PaperPositionsTable;
  exit_events: ExitEventsTable;
  trend_topics: TrendTopicsTable;
  trend_observations: TrendObservationsTable;
  trend_refresh_runs: TrendRefreshRunsTable;
  stream_health_runs: StreamHealthRunsTable;
  token_meme_matches: TokenMemeMatchesTable;
  retention_runs: RetentionRunsTable;
}

export class PostgresStore implements Store {
  readonly db: Kysely<Database>;

  constructor(databaseUrl: string) {
    this.db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: databaseUrl })
      })
    });
  }

  async close(): Promise<void> {
    await this.db.destroy();
  }

  async runMigration(sqlText: string): Promise<void> {
    await sql.raw(sqlText).execute(this.db);
  }

  async upsertRawEvent(event: LaunchEvent): Promise<void> {
    await this.db
      .insertInto("raw_events")
      .values({
        source: event.source,
        signature: event.signature,
        mint: event.mint ?? null,
        event_type: event.eventType,
        observed_at: event.timestamp,
        payload: event.raw
      })
      .onConflict((oc) => oc.columns(["source", "signature", "event_type"]).doNothing())
      .execute();
  }

  async upsertTokenLaunch(launch: TokenLaunch): Promise<void> {
    await this.db
      .insertInto("token_launches")
      .values({
        mint: launch.mint,
        source: launch.source,
        signature: launch.signature,
        pool: launch.pool,
        creator: launch.creator ?? null,
        name: launch.name ?? null,
        symbol: launch.symbol ?? null,
        uri: launch.uri ?? null,
        supply: num(launch.supply),
        created_at: launch.createdAt,
        initial_buy_tokens: num(launch.initialBuyTokens),
        initial_buy_sol: num(launch.initialBuySol),
        v_sol_in_bonding_curve: num(launch.vSolInBondingCurve),
        market_cap_sol: num(launch.marketCapSol),
        raw: launch.raw
      })
      .onConflict((oc) =>
        oc.column("mint").doUpdateSet({
          raw: launch.raw,
          name: launch.name ?? null,
          symbol: launch.symbol ?? null,
          uri: launch.uri ?? null,
          v_sol_in_bonding_curve: num(launch.vSolInBondingCurve),
          market_cap_sol: num(launch.marketCapSol)
        })
      )
      .execute();
  }

  async upsertTradeEvent(event: TradeEvent): Promise<void> {
    await this.db
      .insertInto("trade_events")
      .values({
        signature: event.signature,
        source: event.source,
        mint: event.mint,
        event_type: event.eventType,
        trader: event.trader ?? null,
        occurred_at: event.occurredAt,
        token_amount: num(event.tokenAmount),
        sol_amount: num(event.solAmount),
        v_sol_in_bonding_curve: num(event.vSolInBondingCurve),
        price_sol: num(event.priceSol),
        market_cap_sol: num(event.marketCapSol),
        is_bot_like: event.isBotLike,
        is_wash_trade: event.isWashTrade,
        raw: event.raw
      })
      .onConflict((oc) => oc.column("signature").doNothing())
      .execute();
  }

  async upsertTokenEnrichment(enrichment: TokenEnrichment): Promise<void> {
    await this.db
      .insertInto("token_enrichments")
      .values({
        mint: enrichment.mint,
        observed_at: enrichment.observedAt,
        provider: enrichment.provider,
        price_sol: num(enrichment.priceSol),
        price_usd: num(enrichment.priceUsd),
        liquidity_usd: num(enrichment.liquidityUsd),
        holder_count: enrichment.holderCount ?? null,
        top_holder_share: num(enrichment.topHolderShare),
        dev_holding_share: num(enrichment.devHoldingShare),
        insider_share: num(enrichment.insiderShare),
        bundler_share: num(enrichment.bundlerShare),
        sniper_share: num(enrichment.sniperShare),
        organic_score: num(enrichment.organicScore),
        sentiment_keywords: enrichment.sentimentKeywords,
        social_links: enrichment.socialLinks,
        raw: enrichment.raw
      })
      .execute();
  }

  async insertFeatureSnapshot(snapshot: FeatureSnapshot): Promise<void> {
    await this.db
      .insertInto("feature_snapshots")
      .values({
        mint: snapshot.mint,
        as_of: snapshot.asOf,
        trigger_type: snapshot.triggerType,
        trigger_value: snapshot.triggerValue,
        features: snapshot as unknown as JsonValue
      })
      .onConflict((oc) => oc.columns(["mint", "trigger_type", "trigger_value", "as_of"]).doNothing())
      .execute();
  }

  async insertScoreSnapshot(snapshot: ScoreSnapshot): Promise<void> {
    await this.db
      .insertInto("score_snapshots")
      .values({
        mint: snapshot.mint,
        as_of: snapshot.asOf,
        graduation_probability: String(snapshot.graduationProbability),
        risk_score: String(snapshot.riskScore),
        trend_score: String(snapshot.trendScore),
        expected_value_score: String(snapshot.expectedValueScore),
        decision: snapshot.decision,
        reasons: snapshot.reasons,
        feature_snapshot: snapshot.features as unknown as JsonValue
      })
      .execute();
  }

  async insertPaperOrder(order: PaperOrder): Promise<void> {
    await this.db
      .insertInto("paper_orders")
      .values({
        id: order.id,
        mint: order.mint,
        side: order.side,
        status: order.status,
        reason: order.reason,
        created_at: order.createdAt,
        sol_amount: String(order.solAmount),
        token_amount: String(order.tokenAmount),
        price_sol: String(order.priceSol),
        fees_sol: String(order.feesSol),
        slippage_sol: String(order.slippageSol),
        score_snapshot: order.scoreSnapshot as unknown as JsonValue
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }

  async upsertPaperPosition(position: PaperPosition): Promise<void> {
    await this.db
      .insertInto("paper_positions")
      .values({
        mint: position.mint,
        status: position.status,
        opened_at: position.openedAt,
        closed_at: position.closedAt ?? null,
        entry_price_sol: String(position.entryPriceSol),
        avg_exit_price_sol: num(position.avgExitPriceSol),
        tokens_open: String(position.tokensOpen),
        tokens_bought: String(position.tokensBought),
        sol_invested: String(position.solInvested),
        sol_realized: String(position.solRealized),
        stop_price_sol: String(position.stopPriceSol),
        high_price_sol: String(position.highPriceSol),
        ladder_state: position.ladderState as unknown as JsonValue
      })
      .onConflict((oc) =>
        oc.column("mint").doUpdateSet({
          status: position.status,
          closed_at: position.closedAt ?? null,
          avg_exit_price_sol: num(position.avgExitPriceSol),
          tokens_open: String(position.tokensOpen),
          sol_realized: String(position.solRealized),
          high_price_sol: String(position.highPriceSol),
          ladder_state: position.ladderState as unknown as JsonValue
        })
      )
      .execute();
  }

  async insertExitEvent(event: ExitEvent): Promise<void> {
    await this.db
      .insertInto("exit_events")
      .values({
        id: event.id,
        mint: event.mint,
        occurred_at: event.occurredAt,
        reason: event.reason,
        token_amount: String(event.tokenAmount),
        sol_amount: String(event.solAmount),
        price_sol: String(event.priceSol),
        fees_sol: String(event.feesSol)
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }

  async upsertTrendTopic(topic: TrendTopic): Promise<void> {
    await this.db
      .insertInto("trend_topics")
      .values({
        id: topic.id,
        canonical_phrase: topic.canonicalPhrase,
        aliases: topic.aliases,
        topic_type: topic.topicType,
        source_coverage: topic.sourceCoverage,
        velocity_score: String(topic.velocityScore),
        novelty_score: String(topic.noveltyScore),
        geo: topic.geo ?? null,
        first_seen: topic.firstSeen,
        last_seen: topic.lastSeen,
        evidence_urls: topic.evidenceUrls,
        raw: topic.raw
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          aliases: topic.aliases,
          source_coverage: topic.sourceCoverage,
          velocity_score: String(topic.velocityScore),
          novelty_score: String(topic.noveltyScore),
          geo: topic.geo ?? null,
          first_seen: topic.firstSeen,
          last_seen: topic.lastSeen,
          evidence_urls: topic.evidenceUrls,
          raw: topic.raw
        })
      )
      .execute();
  }

  async insertTrendObservation(observation: TrendObservation, topicId?: string): Promise<void> {
    await this.db
      .insertInto("trend_observations")
      .values({
        id: observation.id,
        topic_id: topicId ?? null,
        source: observation.source,
        phrase: observation.phrase,
        observed_at: observation.observedAt,
        url: observation.url ?? null,
        title: observation.title ?? null,
        summary: observation.summary ?? null,
        traffic: num(observation.traffic),
        weight: String(observation.weight),
        geo: observation.geo ?? null,
        raw: observation.raw
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }

  async insertTrendRefreshRun(run: TrendRefreshRun): Promise<void> {
    await this.db
      .insertInto("trend_refresh_runs")
      .values({
        id: run.id,
        source: run.source,
        model: run.model,
        prompt_version: run.promptVersion,
        refresh_window_started_at: run.refreshWindowStartedAt,
        refresh_window_ended_at: run.refreshWindowEndedAt,
        started_at: run.startedAt,
        completed_at: run.completedAt ?? null,
        status: run.status,
        topics_found: run.topicsFound,
        input_tokens: run.inputTokens,
        cached_input_tokens: run.cachedInputTokens,
        output_tokens: run.outputTokens,
        web_search_calls: run.webSearchCalls,
        estimated_cost_usd: String(run.estimatedCostUsd),
        response_id: run.responseId ?? null,
        error_text: run.errorText ?? null,
        raw: run.raw
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          completed_at: run.completedAt ?? null,
          status: run.status,
          topics_found: run.topicsFound,
          input_tokens: run.inputTokens,
          cached_input_tokens: run.cachedInputTokens,
          output_tokens: run.outputTokens,
          web_search_calls: run.webSearchCalls,
          estimated_cost_usd: String(run.estimatedCostUsd),
          response_id: run.responseId ?? null,
          error_text: run.errorText ?? null,
          raw: run.raw
        })
      )
      .execute();
  }

  async upsertStreamHealthRun(run: StreamHealthRun): Promise<void> {
    await this.db
      .insertInto("stream_health_runs")
      .values({
        id: run.id,
        source: run.source,
        started_at: run.startedAt,
        connected_at: run.connectedAt ?? null,
        disconnected_at: run.disconnectedAt ?? null,
        last_event_at: run.lastEventAt ?? null,
        status: run.status,
        events_read: run.eventsRead,
        launches_read: run.launchesRead,
        duplicate_launches: run.duplicateLaunches,
        parser_rejects: run.parserRejects,
        reconnects: run.reconnects,
        stale_warnings: run.staleWarnings,
        events_per_minute: String(run.eventsPerMinute),
        launches_per_minute: String(run.launchesPerMinute),
        duplicate_rate: String(run.duplicateRate),
        parser_reject_rate: String(run.parserRejectRate),
        error_text: run.errorText ?? null,
        raw: run.raw
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          connected_at: run.connectedAt ?? null,
          disconnected_at: run.disconnectedAt ?? null,
          last_event_at: run.lastEventAt ?? null,
          status: run.status,
          events_read: run.eventsRead,
          launches_read: run.launchesRead,
          duplicate_launches: run.duplicateLaunches,
          parser_rejects: run.parserRejects,
          reconnects: run.reconnects,
          stale_warnings: run.staleWarnings,
          events_per_minute: String(run.eventsPerMinute),
          launches_per_minute: String(run.launchesPerMinute),
          duplicate_rate: String(run.duplicateRate),
          parser_reject_rate: String(run.parserRejectRate),
          error_text: run.errorText ?? null,
          raw: run.raw
        })
      )
      .execute();
  }

  async upsertTokenMemeMatch(match: TokenMemeMatch): Promise<void> {
    await this.db
      .insertInto("token_meme_matches")
      .values({
        mint: match.mint,
        observed_at: match.observedAt,
        meme_relevance_score: String(match.memeRelevanceScore),
        topic_id: match.topicId ?? null,
        canonical_phrase: match.canonicalPhrase ?? null,
        topic_type: match.topicType ?? null,
        aliases: match.aliases,
        evidence_urls: match.evidenceUrls,
        reasons: match.reasons,
        reject_flags: match.rejectFlags,
        raw: match.raw
      })
      .onConflict((oc) =>
        oc.columns(["mint", "observed_at"]).doUpdateSet({
          meme_relevance_score: String(match.memeRelevanceScore),
          topic_id: match.topicId ?? null,
          canonical_phrase: match.canonicalPhrase ?? null,
          topic_type: match.topicType ?? null,
          aliases: match.aliases,
          evidence_urls: match.evidenceUrls,
          reasons: match.reasons,
          reject_flags: match.rejectFlags,
          raw: match.raw
        })
      )
      .execute();
  }

  async insertRetentionRun(run: RetentionRun): Promise<void> {
    await this.db
      .insertInto("retention_runs")
      .values({
        id: run.id,
        ran_at: run.ranAt,
        dry_run: run.dryRun,
        rejected_raw_retention_hours: run.rejectedRawRetentionHours,
        interesting_raw_retention_days: run.interestingRawRetentionDays,
        raw_events_deleted: run.rawEventsDeleted,
        trade_events_deleted: run.tradeEventsDeleted
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }

  async getTokenLaunch(mint: string): Promise<TokenLaunch | undefined> {
    const row = await this.db.selectFrom("token_launches").selectAll().where("mint", "=", mint).executeTakeFirst();
    return row ? launchFromRow(row) : undefined;
  }

  async listTokenLaunches(): Promise<TokenLaunch[]> {
    const rows = await this.db.selectFrom("token_launches").selectAll().orderBy("created_at").execute();
    return rows.map(launchFromRow);
  }

  async listTradeEvents(mint: string, upTo?: Date): Promise<TradeEvent[]> {
    let query = this.db.selectFrom("trade_events").selectAll().where("mint", "=", mint);
    if (upTo) query = query.where("occurred_at", "<=", upTo);
    return (await query.orderBy("occurred_at").execute()).map(tradeFromRow);
  }

  async getLatestEnrichment(mint: string, upTo?: Date): Promise<TokenEnrichment | undefined> {
    let query = this.db.selectFrom("token_enrichments").selectAll().where("mint", "=", mint);
    if (upTo) query = query.where("observed_at", "<=", upTo);
    const row = await query.orderBy("observed_at", "desc").executeTakeFirst();
    return row ? enrichmentFromRow(row) : undefined;
  }

  async getOpenPosition(mint: string): Promise<PaperPosition | undefined> {
    const row = await this.db
      .selectFrom("paper_positions")
      .selectAll()
      .where("mint", "=", mint)
      .where("status", "=", "open")
      .executeTakeFirst();
    return row ? positionFromRow(row) : undefined;
  }

  async listOpenPositions(): Promise<PaperPosition[]> {
    return (await this.db.selectFrom("paper_positions").selectAll().where("status", "=", "open").execute()).map(positionFromRow);
  }

  async listPaperOrders(from?: Date, to?: Date): Promise<PaperOrder[]> {
    let query = this.db.selectFrom("paper_orders").selectAll();
    if (from) query = query.where("created_at", ">=", from);
    if (to) query = query.where("created_at", "<=", to);
    return (await query.orderBy("created_at").execute()).map(orderFromRow);
  }

  async listPaperPositions(): Promise<PaperPosition[]> {
    return (await this.db.selectFrom("paper_positions").selectAll().orderBy("opened_at").execute()).map(positionFromRow);
  }

  async listExitEvents(from?: Date, to?: Date): Promise<ExitEvent[]> {
    let query = this.db.selectFrom("exit_events").selectAll();
    if (from) query = query.where("occurred_at", ">=", from);
    if (to) query = query.where("occurred_at", "<=", to);
    return (await query.orderBy("occurred_at").execute()).map(exitFromRow);
  }

  async listScoreSnapshots(from?: Date, to?: Date): Promise<ScoreSnapshot[]> {
    let query = this.db.selectFrom("score_snapshots").selectAll();
    if (from) query = query.where("as_of", ">=", from);
    if (to) query = query.where("as_of", "<=", to);
    return (await query.orderBy("as_of").execute()).map(scoreFromRow);
  }

  async listTrendTopics(activeSince?: Date, limit = 250): Promise<TrendTopic[]> {
    let query = this.db.selectFrom("trend_topics").selectAll();
    if (activeSince) query = query.where("last_seen", ">=", activeSince);
    return (await query.orderBy("velocity_score", "desc").orderBy("last_seen", "desc").limit(limit).execute()).map(trendTopicFromRow);
  }

  async listTrendObservations(from?: Date, to?: Date): Promise<TrendObservation[]> {
    let query = this.db.selectFrom("trend_observations").selectAll();
    if (from) query = query.where("observed_at", ">=", from);
    if (to) query = query.where("observed_at", "<=", to);
    return (await query.orderBy("observed_at").execute()).map(trendObservationFromRow);
  }

  async listTrendRefreshRuns(from?: Date, to?: Date): Promise<TrendRefreshRun[]> {
    let query = this.db.selectFrom("trend_refresh_runs").selectAll();
    if (from) query = query.where("started_at", ">=", from);
    if (to) query = query.where("started_at", "<=", to);
    return (await query.orderBy("started_at", "desc").execute()).map(trendRefreshRunFromRow);
  }

  async listStreamHealthRuns(limit = 20): Promise<StreamHealthRun[]> {
    return (await this.db.selectFrom("stream_health_runs").selectAll().orderBy("started_at", "desc").limit(limit).execute()).map(streamHealthRunFromRow);
  }

  async getLatestTokenMemeMatch(mint: string, upTo?: Date): Promise<TokenMemeMatch | undefined> {
    let query = this.db.selectFrom("token_meme_matches").selectAll().where("mint", "=", mint);
    if (upTo) query = query.where("observed_at", "<=", upTo);
    const row = await query.orderBy("observed_at", "desc").executeTakeFirst();
    return row ? tokenMemeMatchFromRow(row) : undefined;
  }

  async listTokenMemeMatches(from?: Date, to?: Date): Promise<TokenMemeMatch[]> {
    let query = this.db.selectFrom("token_meme_matches").selectAll();
    if (from) query = query.where("observed_at", ">=", from);
    if (to) query = query.where("observed_at", "<=", to);
    return (await query.orderBy("observed_at").execute()).map(tokenMemeMatchFromRow);
  }

  async pruneRetention(options: RetentionPruneOptions): Promise<RetentionPruneResult> {
    const rejectedCutoff = new Date(options.now.getTime() - options.rejectedRawRetentionHours * 60 * 60 * 1000);
    const interestingCutoff = new Date(options.now.getTime() - options.interestingRawRetentionDays * 24 * 60 * 60 * 1000);
    const rawEventsDeleted = await countOrDeleteExpiredRawEvents(this.db, rejectedCutoff, interestingCutoff, options.dryRun);
    const tradeEventsDeleted = await countOrDeleteExpiredTradeEvents(this.db, rejectedCutoff, interestingCutoff, options.dryRun);
    const tokenLaunchesDeleted = options.pruneLaunches
      ? await countOrDeleteExpiredTokenLaunches(
          this.db,
          new Date(options.now.getTime() - (options.rawLaunchRetentionHours ?? 48) * 60 * 60 * 1000),
          new Date(options.now.getTime() - (options.matchedLaunchRetentionDays ?? 7) * 24 * 60 * 60 * 1000),
          new Date(options.now.getTime() - (options.rejectedLaunchRetentionDays ?? 14) * 24 * 60 * 60 * 1000),
          options.dryRun
        )
      : 0;

    if (!options.dryRun) {
      await this.insertRetentionRun({
        id: `retention:${options.now.toISOString()}`,
        ranAt: options.now,
        dryRun: false,
        rejectedRawRetentionHours: options.rejectedRawRetentionHours,
        interestingRawRetentionDays: options.interestingRawRetentionDays,
        rawEventsDeleted,
        tradeEventsDeleted
      });
    }

    return { rawEventsDeleted, tradeEventsDeleted, tokenLaunchesDeleted };
  }
}

function num(value: number | undefined): string | null {
  return value === undefined || Number.isNaN(value) ? null : String(value);
}

function n(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return Number(value);
}

function launchFromRow(row: Selectable<TokenLaunchesTable>): TokenLaunch {
  return {
    mint: row.mint,
    source: row.source,
    signature: row.signature,
    pool: row.pool,
    creator: row.creator ?? undefined,
    name: row.name ?? undefined,
    symbol: row.symbol ?? undefined,
    uri: row.uri ?? undefined,
    supply: n(row.supply),
    createdAt: new Date(row.created_at),
    initialBuyTokens: n(row.initial_buy_tokens),
    initialBuySol: n(row.initial_buy_sol),
    vSolInBondingCurve: n(row.v_sol_in_bonding_curve),
    marketCapSol: n(row.market_cap_sol),
    raw: row.raw
  };
}

function tradeFromRow(row: Selectable<TradeEventsTable>): TradeEvent {
  return {
    signature: row.signature,
    source: row.source,
    mint: row.mint,
    eventType: row.event_type as TradeEvent["eventType"],
    trader: row.trader ?? undefined,
    occurredAt: new Date(row.occurred_at),
    tokenAmount: n(row.token_amount),
    solAmount: n(row.sol_amount),
    vSolInBondingCurve: n(row.v_sol_in_bonding_curve),
    priceSol: n(row.price_sol),
    marketCapSol: n(row.market_cap_sol),
    isBotLike: row.is_bot_like,
    isWashTrade: row.is_wash_trade,
    raw: row.raw
  };
}

function enrichmentFromRow(row: Selectable<TokenEnrichmentsTable>): TokenEnrichment {
  return {
    mint: row.mint,
    observedAt: new Date(row.observed_at),
    provider: row.provider,
    priceSol: n(row.price_sol),
    priceUsd: n(row.price_usd),
    liquidityUsd: n(row.liquidity_usd),
    holderCount: row.holder_count ?? undefined,
    topHolderShare: n(row.top_holder_share),
    devHoldingShare: n(row.dev_holding_share),
    insiderShare: n(row.insider_share),
    bundlerShare: n(row.bundler_share),
    sniperShare: n(row.sniper_share),
    organicScore: n(row.organic_score),
    sentimentKeywords: row.sentiment_keywords,
    socialLinks: row.social_links as Record<string, string>,
    raw: row.raw
  };
}

function scoreFromRow(row: Selectable<ScoreSnapshotsTable>): ScoreSnapshot {
  const features = hydrateFeatureDates(row.feature_snapshot as unknown as FeatureSnapshot);
  return {
    mint: row.mint,
    asOf: new Date(row.as_of),
    graduationProbability: Number(row.graduation_probability),
    riskScore: Number(row.risk_score),
    trendScore: Number(row.trend_score),
    expectedValueScore: Number(row.expected_value_score),
    decision: row.decision as ScoreSnapshot["decision"],
    reasons: row.reasons,
    features
  };
}

function orderFromRow(row: Selectable<PaperOrdersTable>): PaperOrder {
  const score = row.score_snapshot as unknown as ScoreSnapshot;
  return {
    id: row.id,
    mint: row.mint,
    side: row.side as PaperOrder["side"],
    status: row.status as PaperOrder["status"],
    reason: row.reason,
    createdAt: new Date(row.created_at),
    solAmount: Number(row.sol_amount),
    tokenAmount: Number(row.token_amount),
    priceSol: Number(row.price_sol),
    feesSol: Number(row.fees_sol),
    slippageSol: Number(row.slippage_sol),
    scoreSnapshot: { ...score, asOf: new Date(score.asOf), features: hydrateFeatureDates(score.features) }
  };
}

function positionFromRow(row: Selectable<PaperPositionsTable>): PaperPosition {
  return {
    mint: row.mint,
    status: row.status as PaperPosition["status"],
    openedAt: new Date(row.opened_at),
    closedAt: row.closed_at ? new Date(row.closed_at) : undefined,
    entryPriceSol: Number(row.entry_price_sol),
    avgExitPriceSol: n(row.avg_exit_price_sol),
    tokensOpen: Number(row.tokens_open),
    tokensBought: Number(row.tokens_bought),
    solInvested: Number(row.sol_invested),
    solRealized: Number(row.sol_realized),
    stopPriceSol: Number(row.stop_price_sol),
    highPriceSol: Number(row.high_price_sol),
    ladderState: row.ladder_state as Record<string, boolean>
  };
}

function exitFromRow(row: Selectable<ExitEventsTable>): ExitEvent {
  return {
    id: row.id,
    mint: row.mint,
    occurredAt: new Date(row.occurred_at),
    reason: row.reason as ExitEvent["reason"],
    tokenAmount: Number(row.token_amount),
    solAmount: Number(row.sol_amount),
    priceSol: Number(row.price_sol),
    feesSol: Number(row.fees_sol)
  };
}

function trendTopicFromRow(row: Selectable<TrendTopicsTable>): TrendTopic {
  return {
    id: row.id,
    canonicalPhrase: row.canonical_phrase,
    aliases: row.aliases,
    topicType: row.topic_type as TrendTopic["topicType"],
    sourceCoverage: row.source_coverage,
    velocityScore: Number(row.velocity_score),
    noveltyScore: Number(row.novelty_score),
    geo: row.geo ?? undefined,
    firstSeen: new Date(row.first_seen),
    lastSeen: new Date(row.last_seen),
    evidenceUrls: row.evidence_urls,
    raw: row.raw
  };
}

function trendObservationFromRow(row: Selectable<TrendObservationsTable>): TrendObservation {
  return {
    id: row.id,
    source: row.source,
    phrase: row.phrase,
    observedAt: new Date(row.observed_at),
    url: row.url ?? undefined,
    title: row.title ?? undefined,
    summary: row.summary ?? undefined,
    traffic: n(row.traffic),
    weight: Number(row.weight),
    geo: row.geo ?? undefined,
    raw: row.raw
  };
}

function trendRefreshRunFromRow(row: Selectable<TrendRefreshRunsTable>): TrendRefreshRun {
  return {
    id: row.id,
    source: row.source,
    model: row.model,
    promptVersion: row.prompt_version,
    refreshWindowStartedAt: new Date(row.refresh_window_started_at),
    refreshWindowEndedAt: new Date(row.refresh_window_ended_at),
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    status: row.status as TrendRefreshRun["status"],
    topicsFound: row.topics_found,
    inputTokens: row.input_tokens,
    cachedInputTokens: row.cached_input_tokens,
    outputTokens: row.output_tokens,
    webSearchCalls: row.web_search_calls,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    responseId: row.response_id ?? undefined,
    errorText: row.error_text ?? undefined,
    raw: row.raw
  };
}

function streamHealthRunFromRow(row: Selectable<StreamHealthRunsTable>): StreamHealthRun {
  return {
    id: row.id,
    source: row.source,
    startedAt: new Date(row.started_at),
    connectedAt: row.connected_at ? new Date(row.connected_at) : undefined,
    disconnectedAt: row.disconnected_at ? new Date(row.disconnected_at) : undefined,
    lastEventAt: row.last_event_at ? new Date(row.last_event_at) : undefined,
    status: row.status as StreamHealthRun["status"],
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
    errorText: row.error_text ?? undefined,
    raw: row.raw
  };
}

function tokenMemeMatchFromRow(row: Selectable<TokenMemeMatchesTable>): TokenMemeMatch {
  return {
    mint: row.mint,
    observedAt: new Date(row.observed_at),
    memeRelevanceScore: Number(row.meme_relevance_score),
    topicId: row.topic_id ?? undefined,
    canonicalPhrase: row.canonical_phrase ?? undefined,
    topicType: row.topic_type ? (row.topic_type as TokenMemeMatch["topicType"]) : undefined,
    aliases: row.aliases,
    evidenceUrls: row.evidence_urls,
    reasons: row.reasons,
    rejectFlags: row.reject_flags,
    raw: row.raw
  };
}

function hydrateFeatureDates(features: FeatureSnapshot): FeatureSnapshot {
  return { ...features, asOf: new Date(features.asOf) };
}

async function countOrDeleteExpiredRawEvents(
  db: Kysely<Database>,
  rejectedCutoff: Date,
  interestingCutoff: Date,
  dryRun: boolean
): Promise<number> {
  const query = expiredRawEventsPredicate(rejectedCutoff, interestingCutoff);
  if (dryRun) {
    const result = await sql<{ count: string }>`select count(*)::text as count from raw_events where ${query}`.execute(db);
    return Number(result.rows[0]?.count ?? 0);
  }
  const result = await sql<{ count: string }>`with deleted as (delete from raw_events where ${query} returning 1) select count(*)::text as count from deleted`.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

async function countOrDeleteExpiredTradeEvents(
  db: Kysely<Database>,
  rejectedCutoff: Date,
  interestingCutoff: Date,
  dryRun: boolean
): Promise<number> {
  const query = expiredTradeEventsPredicate(rejectedCutoff, interestingCutoff);
  if (dryRun) {
    const result = await sql<{ count: string }>`select count(*)::text as count from trade_events where ${query}`.execute(db);
    return Number(result.rows[0]?.count ?? 0);
  }
  const result =
    await sql<{ count: string }>`with deleted as (delete from trade_events where ${query} returning 1) select count(*)::text as count from deleted`.execute(
      db
    );
  return Number(result.rows[0]?.count ?? 0);
}

async function countOrDeleteExpiredTokenLaunches(
  db: Kysely<Database>,
  rawLaunchCutoff: Date,
  matchedLaunchCutoff: Date,
  rejectedLaunchCutoff: Date,
  dryRun: boolean
): Promise<number> {
  const query = expiredTokenLaunchesPredicate(rawLaunchCutoff, matchedLaunchCutoff, rejectedLaunchCutoff);
  if (dryRun) {
    const result = await sql<{ count: string }>`select count(*)::text as count from token_launches where ${query}`.execute(db);
    return Number(result.rows[0]?.count ?? 0);
  }
  const result =
    await sql<{ count: string }>`with deleted as (delete from token_launches where ${query} returning 1) select count(*)::text as count from deleted`.execute(
      db
    );
  return Number(result.rows[0]?.count ?? 0);
}

function expiredRawEventsPredicate(rejectedCutoff: Date, interestingCutoff: Date) {
  return sql`
    (
      mint is null and observed_at < cast(${rejectedCutoff} as timestamptz)
    )
    or (
      mint is not null
      and observed_at < case
        when exists (
          select 1 from score_snapshots s
          where s.mint = raw_events.mint
            and s.decision in ('paper_buy', 'watch')
        )
        or exists (
          select 1 from paper_orders p
          where p.mint = raw_events.mint
            and p.status = 'filled'
        )
        then cast(${interestingCutoff} as timestamptz)
        else cast(${rejectedCutoff} as timestamptz)
      end
    )
  `;
}

function expiredTokenLaunchesPredicate(rawLaunchCutoff: Date, matchedLaunchCutoff: Date, rejectedLaunchCutoff: Date) {
  return sql`
    not exists (select 1 from paper_orders p where p.mint = token_launches.mint)
    and not exists (select 1 from paper_positions p where p.mint = token_launches.mint)
    and not exists (select 1 from exit_events e where e.mint = token_launches.mint)
    and (
      (
        created_at < cast(${rawLaunchCutoff} as timestamptz)
        and not exists (select 1 from token_meme_matches m where m.mint = token_launches.mint)
        and not exists (select 1 from score_snapshots s where s.mint = token_launches.mint)
      )
      or (
        created_at < cast(${matchedLaunchCutoff} as timestamptz)
        and exists (select 1 from token_meme_matches m where m.mint = token_launches.mint)
        and not exists (select 1 from score_snapshots s where s.mint = token_launches.mint)
      )
      or (
        created_at < cast(${rejectedLaunchCutoff} as timestamptz)
        and exists (select 1 from score_snapshots s where s.mint = token_launches.mint)
        and not exists (
          select 1 from score_snapshots s
          where s.mint = token_launches.mint
            and s.decision in ('paper_buy', 'watch')
        )
      )
    )
  `;
}

function expiredTradeEventsPredicate(rejectedCutoff: Date, interestingCutoff: Date) {
  return sql`
    occurred_at < case
      when exists (
        select 1 from score_snapshots s
        where s.mint = trade_events.mint
          and s.decision in ('paper_buy', 'watch')
      )
      or exists (
        select 1 from paper_orders p
        where p.mint = trade_events.mint
          and p.status = 'filled'
      )
      then cast(${interestingCutoff} as timestamptz)
      else cast(${rejectedCutoff} as timestamptz)
    end
  `;
}
