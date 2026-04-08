-- Harden multi-tenant isolation and align policy contracts.

-- Campaigns / Contacts: remove permissive null-owner access.
drop policy if exists "campaigns_own" on public.campaigns;
create policy "campaigns_own" on public.campaigns
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "contacts_own" on public.contacts;
create policy "contacts_own" on public.contacts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Conversations / Messages: strict ownership through contact owner.
drop policy if exists "conversations_own" on public.conversations;
create policy "conversations_own" on public.conversations
  for all
  using (
    contact_id in (
      select id from public.contacts where user_id = auth.uid()
    )
  )
  with check (
    contact_id in (
      select id from public.contacts where user_id = auth.uid()
    )
  );

drop policy if exists "messages_own" on public.messages;
create policy "messages_own" on public.messages
  for all
  using (
    conversation_id in (
      select c.id
      from public.conversations c
      join public.contacts ct on c.contact_id = ct.id
      where ct.user_id = auth.uid()
    )
  )
  with check (
    conversation_id in (
      select c.id
      from public.conversations c
      join public.contacts ct on c.contact_id = ct.id
      where ct.user_id = auth.uid()
    )
  );

drop policy if exists "segments_own" on public.campaign_segments;
create policy "segments_own" on public.campaign_segments
  for all
  using (
    campaign_id in (
      select id from public.campaigns where user_id = auth.uid()
    )
  )
  with check (
    campaign_id in (
      select id from public.campaigns where user_id = auth.uid()
    )
  );

drop policy if exists "abandoned_carts_own" on public.abandoned_carts;
create policy "abandoned_carts_own" on public.abandoned_carts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Analytics: enforce tenant-scoped reads/writes.
drop policy if exists "analytics_read" on public.analytics_daily;
drop policy if exists "analytics_insert" on public.analytics_daily;
drop policy if exists "analytics_own" on public.analytics_daily;
create policy "analytics_own" on public.analytics_daily
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- system_config: readable only by authenticated users.
drop policy if exists "system_config_read" on public.system_config;
drop policy if exists "system_config_read_all" on public.system_config;
create policy "system_config_read_auth" on public.system_config
  for select
  to authenticated
  using (true);

-- Limit direct execution of sensitive RPC from clients.
revoke execute on function public.increment_unread_count(uuid) from anon;
revoke execute on function public.increment_unread_count(uuid) from authenticated;
