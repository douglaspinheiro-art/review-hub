-- Priority 4: Database Indexing for Scalability (100+ stores)
-- Composite indexes for multi-tenant and time-series queries

-- analytics_daily: already has idx_analytics_date, but adding store_id makes it faster for tenants
create index if not exists idx_analytics_daily_store_date on analytics_daily(store_id, date desc);

-- message_sends: critical for attribution and heatmap
create index if not exists idx_message_sends_store_created on message_sends(store_id, created_at desc);
create index if not exists idx_message_sends_store_sent on message_sends(store_id, sent_at desc);

-- messages: critical for inbox and performance
create index if not exists idx_messages_conversation_created on messages(conversation_id, created_at asc);

-- attribution_events: critical for ROI dashboard
create index if not exists idx_attribution_events_user_date on attribution_events(user_id, order_date desc);

-- abandoned_carts: critical for recovery dashboard
create index if not exists idx_abandoned_carts_store_created on abandoned_carts(store_id, created_at desc);

-- reviews: critical for reputation dashboard
create index if not exists idx_reviews_user_created on reviews(user_id, created_at desc);

-- orders: critical for RFM and Lifetime Value
create index if not exists idx_orders_store_created on orders(store_id, created_at desc);
create index if not exists idx_orders_customer_created on orders(customer_id, created_at desc);

-- customers_v3: already has idx_customers_v3_store, but adding created_at helps for recently added lists
create index if not exists idx_customers_v3_store_created on customers_v3(store_id, created_at desc);
