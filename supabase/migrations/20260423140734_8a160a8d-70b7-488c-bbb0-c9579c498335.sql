-- 4.3 — Coluna para marcar diagnósticos com baixa conversão (heurística para retroalimentar prompt da IA)
ALTER TABLE public.diagnostics_v3
  ADD COLUMN IF NOT EXISTS quality_label text,
  ADD COLUMN IF NOT EXISTS quality_marked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_diagnostics_v3_quality_label
  ON public.diagnostics_v3 (quality_label)
  WHERE quality_label IS NOT NULL;

-- RPC: marca como low_conversion diagnósticos com 7+ dias sem checkout/conversão
CREATE OR REPLACE FUNCTION public.mark_low_conversion_diagnostics()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH candidates AS (
    SELECT d.id
    FROM public.diagnostics_v3 d
    WHERE d.quality_label IS NULL
      AND d.created_at < (now() - interval '7 days')
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = d.user_id
          AND p.subscription_status = 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.funnel_telemetry_events e
        WHERE e.user_id = d.user_id
          AND e.event_name = 'resultado_checkout_started'
          AND e.created_at > d.created_at
      )
  ),
  upd AS (
    UPDATE public.diagnostics_v3
    SET quality_label = 'low_conversion',
        quality_marked_at = now()
    WHERE id IN (SELECT id FROM candidates)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upd;
  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_low_conversion_diagnostics() TO service_role;

-- 3.5 — Tokens de compartilhamento público de diagnóstico
CREATE TABLE IF NOT EXISTS public.diagnostic_share_tokens (
  token text PRIMARY KEY,
  diagnostic_id uuid NOT NULL REFERENCES public.diagnostics_v3(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  store_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  view_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_share_tokens_user
  ON public.diagnostic_share_tokens (user_id);

ALTER TABLE public.diagnostic_share_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can manage own share tokens" ON public.diagnostic_share_tokens;
CREATE POLICY "owner can manage own share tokens"
  ON public.diagnostic_share_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RPC pública: retorna SOMENTE dados não-sensíveis (sem números absolutos)
CREATE OR REPLACE FUNCTION public.get_shared_diagnostic(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_row public.diagnostic_share_tokens%ROWTYPE;
  v_diag public.diagnostics_v3%ROWTYPE;
  v_diag_json jsonb;
  v_result jsonb;
BEGIN
  SELECT * INTO v_token_row FROM public.diagnostic_share_tokens
  WHERE token = p_token AND expires_at > now()
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found_or_expired');
  END IF;

  SELECT * INTO v_diag FROM public.diagnostics_v3
  WHERE id = v_token_row.diagnostic_id
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'diagnostic_missing');
  END IF;

  v_diag_json := COALESCE(v_diag.diagnostic_json, '{}'::jsonb);

  -- Incrementa contador (best-effort)
  UPDATE public.diagnostic_share_tokens
  SET view_count = view_count + 1
  WHERE token = p_token;

  -- Devolve apenas: chs, label, resumo, perda_principal, # de problemas (sem impacto em R$)
  v_result := jsonb_build_object(
    'store_name', COALESCE(v_token_row.store_name, 'Loja'),
    'chs', v_diag.chs,
    'chs_label', v_diag.chs_label,
    'resumo', v_diag_json -> 'resumo',
    'perda_principal', v_diag_json -> 'perda_principal',
    'percentual_explicado', v_diag_json -> 'percentual_explicado',
    'problemas_count', COALESCE(jsonb_array_length(v_diag_json -> 'problemas'), 0),
    'recomendacoes_count', COALESCE(jsonb_array_length(v_diag_json -> 'recomendacoes'), 0),
    'created_at', v_diag.created_at
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_diagnostic(text) TO anon, authenticated;