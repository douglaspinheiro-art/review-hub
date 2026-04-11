-- Webhook Queue Infrastructure for Scalability
-- Moves heavy order processing to background tasks

create table if not exists webhook_queue (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  payload_normalized jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  attempts integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Index for the worker to find pending jobs quickly
create index if not exists idx_webhook_queue_status_created on webhook_queue(status, created_at asc);

-- RLS
alter table webhook_queue enable row level security;
create policy "Users can view own webhook_queue" on webhook_queue for select using (auth.uid() = user_id);

-- Trigger for updated_at
create or replace trigger webhook_queue_updated_at before update on webhook_queue for each row execute procedure set_updated_at();
