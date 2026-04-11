-- Custo de envio agregado por campanha (denominador de ROAS no dashboard).
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS custo_total_envio NUMERIC(12,4) DEFAULT 0;
