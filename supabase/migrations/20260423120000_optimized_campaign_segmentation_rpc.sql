-- 20260423120000_optimized_campaign_segmentation_rpc.sql
-- Migra a segmentação e enfileiramento de campanhas do Deno (RAM) para SQL (Performance).
-- Garante escalabilidade para lojas com >100k contatos.

CREATE OR REPLACE FUNCTION public.execute_campaign_segmentation_v4(
  p_campaign_id UUID,
  p_store_id UUID,
  p_actor_user_id UUID,
  p_holdout_pct INT DEFAULT 0,
  p_min_expected_value NUMERIC DEFAULT 0,
  p_max_recipients INT DEFAULT 0,
  p_cooldown_hours INT DEFAULT 24,
  p_message_template TEXT DEFAULT '',
  p_meta_template_name TEXT DEFAULT NULL,
  p_content_type TEXT DEFAULT 'text',
  p_media_url TEXT DEFAULT NULL,
  p_campaign_name TEXT DEFAULT ''
)
RETURNS TABLE (
  enqueued_count INT,
  holdout_count INT,
  cooldown_count INT,
  opt_out_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
  v_holdouts INT := 0;
  v_cooldown INT := 0;
  v_opt_out  INT := 0;
  v_cutoff   TIMESTAMP;
BEGIN
  v_cutoff := now() - (p_cooldown_hours * interval '1 hour');

  -- 1. Contagem de Opt-outs (Apenas para relatório, não enfileiramos)
  SELECT count(*)::int INTO v_opt_out
  FROM customers_v3
  WHERE store_id = p_store_id
    AND unsubscribed_at IS NOT NULL;

  -- 2. Identificar Cooldown (Clientes que receberam algo recentemente)
  -- Criamos um CTE/Temp para facilitar o filtro de exclusão
  WITH recipients_cooldown AS (
    SELECT DISTINCT customer_id
    FROM message_sends
    WHERE store_id = p_store_id
      AND status LIKE 'sent%'
      AND created_at >= v_cutoff
  ),
  -- 3. Segmentação com Scoring (Lógica migrada do JS)
  segmented_candidates AS (
    SELECT 
      c.id,
      c.name,
      c.phone,
      c.email,
      -- Cálculo de Expected Value (Scoring LTV Boost)
      (least(5, coalesce(c.rfm_monetary, 1)) * 18) +
      (least(5, coalesce(c.rfm_recency, 1)) * 18) +
      (greatest(0, 1 - coalesce(c.churn_score, 0)) * 12) AS expected_value
    FROM customers_v3 c
    WHERE c.store_id = p_store_id
      AND c.unsubscribed_at IS NULL
      AND c.phone IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recipients_cooldown rc WHERE rc.customer_id = c.id)
  ),
  -- 4. Ranking e Limite (Max Recipients)
  ranked_candidates AS (
    SELECT *,
      row_number() OVER (ORDER BY expected_value DESC) as rank
    FROM segmented_candidates
    WHERE expected_value >= p_min_expected_value
  ),
  limited_candidates AS (
    SELECT *
    FROM ranked_candidates
    WHERE (p_max_recipients = 0 OR rank <= p_max_recipients)
  ),
  -- 5. Holdout Exclusion (Deterministic Hash based on campaign_id and customer_id)
  final_split AS (
    SELECT *,
      (abs(hashtext(p_campaign_id::text || ':' || id::text)) % 100) as bucket
    FROM limited_candidates
  )
  -- 6. Inserção Atômica em scheduled_messages
  INSERT INTO scheduled_messages (
    user_id,
    store_id,
    customer_id,
    campaign_id,
    message_content,
    scheduled_for,
    status,
    metadata
  )
  SELECT 
    p_actor_user_id,
    p_store_id,
    fs.id,
    p_campaign_id,
    -- Interpolação básica de nome (outras variáveis como cart_url ainda precisam ser tratadas no worker ou via templates)
    replace(p_message_template, '{{name}}', coalesce(fs.name, '')) as message_content,
    now(),
    'pending',
    jsonb_build_object(
      'campaign_name', p_campaign_name,
      'content_type', p_content_type,
      'media_url', p_media_url,
      'meta_template_name', p_meta_template_name,
      'expected_value', fs.expected_value
    )
  FROM final_split fs
  WHERE fs.bucket >= p_holdout_pct
  ON CONFLICT (campaign_id, customer_id) 
    WHERE status IN ('pending', 'processing')
    DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- 7. Contabilizar Holdouts (Para retorno da função)
  SELECT count(*)::int INTO v_holdouts
  FROM (
    SELECT id FROM (
      SELECT id, (abs(hashtext(p_campaign_id::text || ':' || id::text)) % 100) as bucket 
      FROM (
        SELECT id FROM segmented_candidates 
        WHERE expected_value >= p_min_expected_value
        LIMIT (CASE WHEN p_max_recipients = 0 THEN 999999999 ELSE p_max_recipients END)
      ) tmp
    ) tmp2 WHERE bucket < p_holdout_pct
  ) h;

  -- 8. Contabilizar Cooldown (Clientes filtrados pela regra de frequência)
  SELECT count(*)::int INTO v_cooldown
  FROM recipients_cooldown;

  -- 9. Atualizar status da Campanha de forma atômica
  UPDATE campaigns
  SET 
    status = 'running',
    total_contacts = v_inserted + v_holdouts,
    updated_at = now()
  WHERE id = p_campaign_id;

  RETURN QUERY SELECT v_inserted, v_holdouts, v_cooldown, v_opt_out;
END;
$$;

-- Garantir acesso ao service_role para execução via Edge Function
REVOKE ALL ON FUNCTION public.execute_campaign_segmentation_v4 FROM public;
GRANT EXECUTE ON FUNCTION public.execute_campaign_segmentation_v4 TO service_role;

-- Função auxiliar para incremento atômico (Garantia de concorrência)
CREATE OR REPLACE FUNCTION public.increment_campaign_sent_count(p_campaign_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE campaigns
  SET sent_count = coalesce(sent_count, 0) + 1,
      updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;
