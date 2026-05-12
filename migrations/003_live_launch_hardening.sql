create index if not exists score_snapshots_mint_as_of_desc_idx on score_snapshots(mint, as_of desc);
create index if not exists feature_snapshots_mint_trigger_idx on feature_snapshots(mint, trigger_type, trigger_value, as_of desc);
create index if not exists token_meme_matches_distinct_mint_idx on token_meme_matches(mint);

