-- 20260424020000_carrinho_abandonado_performance.sql
-- Otimização de performance para lista de carrinhos abandonados

-- 1. Índice para Keyset Pagination eficiente
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_pagination 
ON public.abandoned_carts (store_id, created_at DESC, id);

-- 2. BFF RPC consolidado: KPIs + Página de Dados (Ponto #8 aplicado aqui)
CREATE OR REPLACE FUNCTION public.get_abandoned_carts_v2(
  p_store_id UUID,
  p_since TIMESTAMP,
  p_status TEXT DEFAULT 'all',
  p_cursor_created_at TIMESTAMP DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kpi JSONB;
  v_rows JSONB;
  v_total_count INT;
BEGIN
  -- KPIs agregados
  SELECT jsonb_build_object(
    'total', count(*),
    'recovered', count(*) FILTER (WHERE status = 'recovered'),
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'total_value', coalesce(sum(cart_value), 0),
    'recovered_value', coalesce(sum(cart_value) FILTER (WHERE status = 'recovered'), 0)
  ) INTO v_kpi
  FROM abandoned_carts
  WHERE store_id = p_store_id AND created_at >= p_since;

  -- Contagem total filtrada (para paginação)
  SELECT count(*) INTO v_total_count
  FROM abandoned_carts
  WHERE store_id = p_store_id 
    AND created_at >= p_since
    AND (p_status = 'all' OR status = p_status);

  -- Linhas da página (Keyset)
  SELECT jsonb_agg(tmp) INTO v_rows
  FROM (
    SELECT *
    FROM abandoned_carts
    WHERE store_id = p_store_id
      AND created_at >= p_since
      AND (p_status = 'all' OR status = p_status)
      AND (p_cursor_created_at IS NULL OR created_at < p_cursor_created_at)
    ORDER BY created_at DESC
    LIMIT p_limit
  ) tmp;

  RETURN jsonb_build_object(
    'kpi', v_kpi,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total_count', v_total_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_carts_v2(UUID, TIMESTAMP, TEXT, TIMESTAMP, INT) TO authenticated;
