create table if not exists raw_events (
  id bigserial primary key,
  source text not null,
  signature text not null,
  mint text,
  event_type text not null,
  observed_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (source, signature, event_type)
);

create table if not exists token_launches (
  mint text primary key,
  source text not null,
  signature text not null,
  pool text not null,
  creator text,
  name text,
  symbol text,
  uri text,
  supply numeric,
  created_at timestamptz not null,
  initial_buy_tokens numeric,
  initial_buy_sol numeric,
  v_sol_in_bonding_curve numeric,
  market_cap_sol numeric,
  raw jsonb not null
);

create table if not exists trade_events (
  signature text primary key,
  source text not null,
  mint text not null references token_launches(mint) on delete cascade,
  event_type text not null,
  trader text,
  occurred_at timestamptz not null,
  token_amount numeric,
  sol_amount numeric,
  v_sol_in_bonding_curve numeric,
  price_sol numeric,
  market_cap_sol numeric,
  is_bot_like boolean not null default false,
  is_wash_trade boolean not null default false,
  raw jsonb not null
);

create table if not exists token_enrichments (
  id bigserial primary key,
  mint text not null references token_launches(mint) on delete cascade,
  observed_at timestamptz not null,
  provider text not null,
  price_sol numeric,
  price_usd numeric,
  liquidity_usd numeric,
  holder_count integer,
  top_holder_share numeric,
  dev_holding_share numeric,
  insider_share numeric,
  bundler_share numeric,
  sniper_share numeric,
  organic_score numeric,
  sentiment_keywords text[] not null default '{}',
  social_links jsonb not null default '{}'::jsonb,
  raw jsonb not null
);

create table if not exists feature_snapshots (
  id bigserial primary key,
  mint text not null references token_launches(mint) on delete cascade,
  as_of timestamptz not null,
  trigger_type text not null,
  trigger_value text not null,
  features jsonb not null,
  unique (mint, trigger_type, trigger_value, as_of)
);

create table if not exists score_snapshots (
  id bigserial primary key,
  mint text not null references token_launches(mint) on delete cascade,
  as_of timestamptz not null,
  graduation_probability numeric not null,
  risk_score numeric not null,
  trend_score numeric not null,
  expected_value_score numeric not null,
  decision text not null,
  reasons text[] not null,
  feature_snapshot jsonb not null
);

create table if not exists paper_orders (
  id text primary key,
  mint text not null references token_launches(mint) on delete cascade,
  side text not null,
  status text not null,
  reason text not null,
  created_at timestamptz not null,
  sol_amount numeric not null,
  token_amount numeric not null,
  price_sol numeric not null,
  fees_sol numeric not null,
  slippage_sol numeric not null,
  score_snapshot jsonb not null
);

create table if not exists paper_positions (
  mint text primary key references token_launches(mint) on delete cascade,
  status text not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  entry_price_sol numeric not null,
  avg_exit_price_sol numeric,
  tokens_open numeric not null,
  tokens_bought numeric not null,
  sol_invested numeric not null,
  sol_realized numeric not null default 0,
  stop_price_sol numeric not null,
  high_price_sol numeric not null,
  ladder_state jsonb not null
);

create table if not exists exit_events (
  id text primary key,
  mint text not null references token_launches(mint) on delete cascade,
  occurred_at timestamptz not null,
  reason text not null,
  token_amount numeric not null,
  sol_amount numeric not null,
  price_sol numeric not null,
  fees_sol numeric not null
);

create table if not exists trend_topics (
  id text primary key,
  canonical_phrase text not null,
  aliases text[] not null,
  topic_type text not null,
  source_coverage integer not null,
  velocity_score numeric not null,
  novelty_score numeric not null,
  geo text,
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  evidence_urls text[] not null default '{}',
  raw jsonb not null
);

create table if not exists trend_observations (
  id text primary key,
  topic_id text references trend_topics(id) on delete set null,
  source text not null,
  phrase text not null,
  observed_at timestamptz not null,
  url text,
  title text,
  summary text,
  traffic numeric,
  weight numeric not null,
  geo text,
  raw jsonb not null
);

create table if not exists trend_refresh_runs (
  id text primary key,
  source text not null,
  model text not null,
  prompt_version text not null,
  refresh_window_started_at timestamptz not null,
  refresh_window_ended_at timestamptz not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null,
  topics_found integer not null default 0,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  web_search_calls integer not null default 0,
  estimated_cost_usd numeric not null default 0,
  response_id text,
  error_text text,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists stream_health_runs (
  id text primary key,
  source text not null,
  started_at timestamptz not null,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_event_at timestamptz,
  status text not null,
  events_read integer not null default 0,
  launches_read integer not null default 0,
  duplicate_launches integer not null default 0,
  parser_rejects integer not null default 0,
  reconnects integer not null default 0,
  stale_warnings integer not null default 0,
  events_per_minute numeric not null default 0,
  launches_per_minute numeric not null default 0,
  duplicate_rate numeric not null default 0,
  parser_reject_rate numeric not null default 0,
  error_text text,
  raw jsonb not null default '{}'::jsonb
);

alter table stream_health_runs add column if not exists parser_rejects integer not null default 0;
alter table stream_health_runs add column if not exists events_per_minute numeric not null default 0;
alter table stream_health_runs add column if not exists launches_per_minute numeric not null default 0;
alter table stream_health_runs add column if not exists duplicate_rate numeric not null default 0;
alter table stream_health_runs add column if not exists parser_reject_rate numeric not null default 0;

create table if not exists token_meme_matches (
  mint text not null references token_launches(mint) on delete cascade,
  observed_at timestamptz not null,
  meme_relevance_score numeric not null,
  topic_id text references trend_topics(id) on delete set null,
  canonical_phrase text,
  topic_type text,
  aliases text[] not null default '{}',
  evidence_urls text[] not null default '{}',
  reasons text[] not null default '{}',
  reject_flags text[] not null default '{}',
  raw jsonb not null,
  primary key (mint, observed_at)
);

create table if not exists retention_runs (
  id text primary key,
  ran_at timestamptz not null,
  dry_run boolean not null,
  rejected_raw_retention_hours integer not null,
  interesting_raw_retention_days integer not null,
  raw_events_deleted integer not null,
  trade_events_deleted integer not null
);

create index if not exists raw_events_mint_observed_at_idx on raw_events(mint, observed_at);
create index if not exists trade_events_mint_occurred_at_idx on trade_events(mint, occurred_at);
create index if not exists score_snapshots_mint_as_of_idx on score_snapshots(mint, as_of);
create index if not exists trend_topics_last_seen_idx on trend_topics(last_seen desc);
create index if not exists trend_refresh_runs_started_at_idx on trend_refresh_runs(started_at desc);
create index if not exists trend_refresh_runs_window_idx on trend_refresh_runs(source, model, refresh_window_started_at);
create index if not exists stream_health_runs_started_at_idx on stream_health_runs(started_at desc);
create index if not exists token_meme_matches_mint_observed_at_idx on token_meme_matches(mint, observed_at desc);
