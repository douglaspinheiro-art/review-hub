ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS benchmark_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.benchmark_opt_out IS
'Quando true, exclui esta loja de agregações cross-tenant anônimas (benchmarks de setor). LGPD: opt-out explícito do lojista.';