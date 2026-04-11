-- Permitir escrita em system_config a staff da plataforma (has_role admin)
-- além de contas com profiles.role = 'admin' (administrador da loja).
drop policy if exists "system_config_admin_write" on public.system_config;

create policy "system_config_admin_write" on public.system_config
  for all
  using (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
