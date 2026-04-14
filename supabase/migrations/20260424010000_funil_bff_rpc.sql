-- 20260424010000_funil_bff_rpc.sql
-- Consolidates 9 funnel queries into 1 to reduce latencies and waterfall (Ponto #8)

CREATE OR REPLACE FUNCTION public.get_funil_page_data(
  p_store_id UUID,
  p_period TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INT;
  v_since TIMESTAMP;
  v_result JSONB;
BEGIN
  v_days := CASE 
    WHEN p_period = '7d' THEN 7 
    WHEN p_period = '90d' THEN 90 
    ELSE 30 
  END;
  v_since := now() - (v_days || ' days')::interval;

  WITH 
  loja_info AS (
    SELECT id, name, segment, ticket_medio, meta_conversao, pix_key
    FROM stores
    WHERE id = p_store_id
  ),
  metricas_funil AS (
    SELECT source, last_ingested_at, last_manual_updated_at, metricas
    FROM funil_page_metricas
    WHERE store_id = p_store_id AND periodo = p_period
    ORDER BY created_at DESC LIMIT 1
  ),
  metricas_enriquecidas AS (
    SELECT receita_travada_frete, receita_travada_pagamento, total_abandonos_frete, total_abandonos_pagamento
    FROM metricas_enriquecidas
    WHERE store_id = p_store_id AND periodo = p_period
    ORDER BY created_at DESC LIMIT 1
  ),
  saude_dados AS (
    SELECT score, status, alertas, recomendacoes_confiaveis, metric_contract, canais, etapas
    FROM data_health_v3
    WHERE store_id = p_store_id AND periodo = p_period
    ORDER BY created_at DESC LIMIT 1
  ),
  ultimo_diag AS (
    SELECT id, created_at, resumo, score, taxa_conversao
    FROM diagnostics_v3
    WHERE store_id = p_store_id
    ORDER BY created_at DESC LIMIT 1
  ),
  todos_diags AS (
    SELECT id, created_at, taxa_conversao, score
    FROM diagnostics_v3
    WHERE store_id = p_store_id
    ORDER BY created_at DESC LIMIT 10
  ),
  top_produtos AS (
    SELECT id, nome, sku, preco, estoque, taxa_conversao_produto, receita_30d
    FROM products
    WHERE store_id = p_store_id
    ORDER BY taxa_conversao_produto ASC
    LIMIT 5
  ),
  metrics_v3 AS (
    SELECT mobile_visitors, mobile_orders, desktop_visitors, desktop_orders, mobile_cvr, desktop_cvr
    FROM funnel_metrics_v3
    WHERE store_id = p_store_id
    ORDER BY created_at DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'loja', (SELECT row_to_json(loja_info) FROM loja_info),
    'funil_metricas', (SELECT row_to_json(metricas_funil) FROM metricas_funil),
    'enriquecidas', (SELECT row_to_json(metricas_enriquecidas) FROM metricas_enriquecidas),
    'data_health', (SELECT row_to_json(saude_dados) FROM saude_dados),
    'ultimo_diagnostico', (SELECT row_to_json(ultimo_diag) FROM ultimo_diag),
    'historico_diagnosticos', (SELECT json_agg(todos_diags) FROM todos_diags),
    'produtos', (SELECT json_agg(top_produtos) FROM top_produtos),
    'metrics_v3', (SELECT row_to_json(metrics_v3) FROM metrics_v3)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_funil_page_data(UUID, TEXT) TO authenticated;
