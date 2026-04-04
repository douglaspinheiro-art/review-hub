-- 🚀 ADMIN ROLE SUPPORT
alter table profiles add column if not exists role text default 'user' check (role in ('user', 'admin'));

-- Update RLS for webhook_logs to allow admins to see all logs
drop policy if exists "logs_read_own" on webhook_logs;
create policy "logs_read_policy" on webhook_logs 
  for select using (
    (exists (select 1 from profiles where id = auth.uid() and role = 'admin')) OR 
    (exists (select 1 from lojas where id = loja_id and user_id = auth.uid()))
  );
