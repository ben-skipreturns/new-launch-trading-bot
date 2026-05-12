create index if not exists score_snapshots_as_of_idx on score_snapshots(as_of desc);
create index if not exists token_launches_created_at_idx on token_launches(created_at desc);
create index if not exists token_launches_source_created_at_idx on token_launches(source, created_at desc);
create index if not exists paper_positions_status_opened_at_idx on paper_positions(status, opened_at desc);
create index if not exists paper_orders_status_side_created_at_idx on paper_orders(status, side, created_at desc);
create index if not exists exit_events_occurred_at_idx on exit_events(occurred_at desc);
create index if not exists token_enrichments_mint_observed_at_idx on token_enrichments(mint, observed_at desc);
