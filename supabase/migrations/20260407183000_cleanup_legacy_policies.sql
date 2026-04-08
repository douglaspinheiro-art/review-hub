-- Cleanup legacy policies and tighten grants.

-- campaigns
drop policy if exists "Users can view own campaigns" on public.campaigns;

-- contacts
drop policy if exists "Users can view own contacts" on public.contacts;

-- conversations
drop policy if exists "Users can view own conversations" on public.conversations;

-- messages
drop policy if exists "Users can view own messages" on public.messages;

-- system_config
drop policy if exists "read_config_all" on public.system_config;
drop policy if exists "update_config_admin" on public.system_config;
drop policy if exists "system_config_read" on public.system_config;
drop policy if exists "system_config_read_all" on public.system_config;
drop policy if exists "system_config_admin_write" on public.system_config;

create policy "system_config_admin_write" on public.system_config
  for all
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Ensure no client role can execute sensitive RPC directly.
revoke execute on function public.increment_unread_count(uuid) from public;
revoke execute on function public.increment_unread_count(uuid) from anon;
revoke execute on function public.increment_unread_count(uuid) from authenticated;
