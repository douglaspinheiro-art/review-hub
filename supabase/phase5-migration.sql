-- ============================================================
-- LTV Boost — Phase 5: Orders & RFM Intelligence
-- ============================================================

-- 1. ORDERS TABLE
create table if not exists orders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  external_order_id text, -- ID from e-commerce (Shopify, Nuvemshop, etc)
  total_amount numeric(12,2) not null default 0,
  currency text default 'BRL',
  status text not null default 'pending', -- pending, paid, cancelled, shipped, delivered
  items_count int default 0,
  source text, -- shopify, nuvemshop, manual, etc
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for performance
create index if not exists idx_orders_contact on orders(contact_id);
create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_orders_status on orders(status);

-- RLS
alter table orders enable row level security;

create policy "orders_own" on orders
  for all using (auth.uid() = user_id);

-- 3. PROFILES KNOWLEDGE BASE & LOYALTY CONFIG
alter table profiles add column if not exists knowledge_base text;
alter table profiles add column if not exists ai_model text default 'claude-3-5-sonnet-20241022';
alter table profiles add column if not exists loyalty_program_name text default 'Clube VIP';
alter table profiles add column if not exists points_per_real int default 1;

-- 2. TRIGGER TO UPDATE CONTACT METRICS (Total Orders, Spent, RFM Segment & Loyalty)
alter table contacts add column if not exists rfm_segment text default 'new';
alter table contacts add column if not exists loyalty_points int default 0;
alter table contacts add column if not exists loyalty_tier text default 'Bronze';

create or replace function update_contact_metrics()
returns trigger language plpgsql as $$
declare
  total_count int;
  total_val numeric(12,2);
  days_since_join int;
  recency_score numeric(4,2);
  freq_score numeric(4,2);
  val_score numeric(4,2);
  rfm_score numeric(4,2);
  max_orders int;
  max_spent numeric(12,2);
  new_segment text;
  new_points int;
  new_tier text;
  pts_per_real int;
begin
  -- 1. Calculate aggregates from paid/delivered orders
  select count(*), sum(total_amount)
  into total_count, total_val
  from orders
  where contact_id = coalesce(new.contact_id, old.contact_id)
    and status in ('paid', 'shipped', 'delivered');

  total_count := coalesce(total_count, 0);
  total_val := coalesce(total_val, 0);

  -- 2. Loyalty Logic: Calculate points (1 point per R$ 1 by default, or from profile)
  select points_per_real into pts_per_real 
  from profiles 
  where id = (select user_id from contacts where id = coalesce(new.contact_id, old.contact_id));
  
  pts_per_real := coalesce(pts_per_real, 1);
  new_points := floor(total_val * pts_per_real);

  -- Tier logic
  if new_points >= 5000 then new_tier := 'Diamante';
  elsif new_points >= 1500 then new_tier := 'Ouro';
  elsif new_points >= 500 then new_tier := 'Prata';
  else new_tier := 'Bronze';
  end if;

  -- 3. Get global maximums for normalization
  select max(total_orders), max(total_spent) into max_orders, max_spent from contacts;
  max_orders := coalesce(nullif(max_orders, 0), 10);
  max_spent := coalesce(nullif(max_spent, 0), 1000);

  -- 4. Calculate RFM Scores
  select extract(day from (now() - created_at)) into days_since_join from contacts where id = coalesce(new.contact_id, old.contact_id);
  
  recency_score := max(0, 1 - (days_since_join / 365.0)); 
  freq_score := min(1, total_count / max_orders::numeric);
  val_score := min(1, total_val / max_spent::numeric);
  
  rfm_score := (recency_score + freq_score + val_score) / 3.0;

  -- 5. Classification Logic
  if total_count <= 2 and days_since_join < 90 then
    new_segment := 'new';
  elsif rfm_score >= 0.55 and total_count >= 5 then
    new_segment := 'champions';
  elsif rfm_score >= 0.3 then
    new_segment := 'loyal';
  elsif rfm_score < 0.1 then
    new_segment := 'lost';
  else
    new_segment := 'at_risk';
  end if;

  -- 6. Update contact
  update contacts
  set 
    total_orders = total_count,
    total_spent = total_val,
    rfm_segment = new_segment,
    loyalty_points = new_points,
    loyalty_tier = new_tier,
    status = case when status = 'inactive' and total_count > 0 then 'active' else status end,
    updated_at = now()
  where id = coalesce(new.contact_id, old.contact_id);

  return new;
end;
$$;

create or replace trigger on_order_change
  after insert or update or delete on orders
  for each row execute procedure update_contact_metrics();

-- 3. UPDATED_AT TRIGGER
create or replace trigger orders_updated_at before update on orders
  for each row execute procedure set_updated_at();

-- 4. ANALYTICS SYNC TRIGGER
-- Influences revenue_influenced in analytics_daily when an order is paid
create or replace function sync_order_to_analytics()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT' and new.status in ('paid', 'shipped', 'delivered')) or
     (TG_OP = 'UPDATE' and new.status in ('paid', 'shipped', 'delivered') and old.status not in ('paid', 'shipped', 'delivered')) then
    
    insert into analytics_daily (date, revenue_influenced)
    values (current_date, new.total_amount)
    on conflict (date) do update
    set revenue_influenced = analytics_daily.revenue_influenced + excluded.revenue_influenced;
    
  end if;
  return new;
end;
$$;

create or replace trigger on_order_paid_analytics
  after insert or update on orders
  for each row execute procedure sync_order_to_analytics();
