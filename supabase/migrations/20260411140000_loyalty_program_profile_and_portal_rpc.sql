-- Portal público: lookup por telefone precisa executar como anon (SECURITY DEFINER isola dados por slug).
grant execute on function public.resolve_loyalty_by_phone(text, text) to anon;

-- Configuração do programa no perfil do lojista (fonte única para o dashboard de fidelidade).
alter table public.profiles
  add column if not exists loyalty_program_enabled boolean not null default true;

alter table public.profiles
  add column if not exists loyalty_points_ttl_days integer null;

comment on column public.profiles.loyalty_program_enabled is 'Liga/desliga exibição e regras do programa no dashboard e comunicações.';
comment on column public.profiles.loyalty_points_ttl_days is 'Prazo opcional em dias para expiração de pontos (null = não definido no painel).';
