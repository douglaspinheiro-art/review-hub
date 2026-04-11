-- RFM Recalculation Queue Infrastructure
create table if not exists rfm_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  progress integer default 0,
  total_customers integer default 0,
  updated_count integer default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Index for performance
create index if not exists idx_rfm_jobs_store_status on rfm_jobs(store_id, status);

-- Trigger to update updated_at
create or replace trigger rfm_jobs_updated_at before update on rfm_jobs for each row execute procedure set_updated_at();

-- RLS
alter table rfm_jobs enable row level security;
create policy "Users can view own rfm_jobs" on rfm_jobs for all using (auth.uid() = user_id);
