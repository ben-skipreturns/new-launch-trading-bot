create unique index if not exists trend_refresh_runs_active_window_idx
  on trend_refresh_runs (source, model, prompt_version, refresh_window_started_at)
  where status in ('running', 'success');
