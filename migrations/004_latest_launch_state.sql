create table if not exists latest_score_snapshots (
  mint text primary key references token_launches(mint) on delete cascade,
  as_of timestamptz not null,
  graduation_probability numeric not null,
  risk_score numeric not null,
  trend_score numeric not null,
  expected_value_score numeric not null,
  decision text not null,
  reasons text[] not null,
  feature_snapshot jsonb not null
);

create table if not exists token_launch_status (
  mint text primary key references token_launches(mint) on delete cascade,
  has_meme_match boolean not null default false,
  has_score boolean not null default false,
  latest_score_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into latest_score_snapshots (
  mint,
  as_of,
  graduation_probability,
  risk_score,
  trend_score,
  expected_value_score,
  decision,
  reasons,
  feature_snapshot
)
select distinct on (s.mint)
  s.mint,
  s.as_of,
  s.graduation_probability,
  s.risk_score,
  s.trend_score,
  s.expected_value_score,
  s.decision,
  s.reasons,
  s.feature_snapshot
from score_snapshots s
order by s.mint, s.as_of desc
on conflict (mint) do update set
  as_of = excluded.as_of,
  graduation_probability = excluded.graduation_probability,
  risk_score = excluded.risk_score,
  trend_score = excluded.trend_score,
  expected_value_score = excluded.expected_value_score,
  decision = excluded.decision,
  reasons = excluded.reasons,
  feature_snapshot = excluded.feature_snapshot
where latest_score_snapshots.as_of <= excluded.as_of;

insert into token_launch_status (
  mint,
  has_meme_match,
  has_score,
  latest_score_at,
  updated_at
)
select
  tl.mint,
  exists (
    select 1 from token_meme_matches m where m.mint = tl.mint
  ) as has_meme_match,
  exists (
    select 1 from score_snapshots s where s.mint = tl.mint
  ) as has_score,
  (
    select max(s.as_of) from score_snapshots s where s.mint = tl.mint
  ) as latest_score_at,
  now() as updated_at
from token_launches tl
on conflict (mint) do update set
  has_meme_match = excluded.has_meme_match,
  has_score = excluded.has_score,
  latest_score_at = excluded.latest_score_at,
  updated_at = now();

create index if not exists latest_score_snapshots_as_of_desc_idx on latest_score_snapshots(as_of desc);
create index if not exists token_launch_status_has_score_idx on token_launch_status(has_score);
create index if not exists token_launch_status_has_meme_match_idx on token_launch_status(has_meme_match);
