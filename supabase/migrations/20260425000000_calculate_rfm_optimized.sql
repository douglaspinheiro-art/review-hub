-- Optimized RFM Calculation
-- Replaces per-customer loop with a single batch SQL update

CREATE OR REPLACE FUNCTION public.calculate_rfm_for_store(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count INT;
BEGIN
    WITH customer_stats AS (
        SELECT
            cliente_id,
            SUM(valor) as total_spent,
            COUNT(*) as total_orders,
            MAX(created_at) as last_order_date
        FROM public.orders_v3
        WHERE store_id = p_store_id
          AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'refunded', 'failed', 'voided')
          AND COALESCE(internal_status, '') != 'cancelled'
        GROUP BY cliente_id
    ),
    customer_scores AS (
        SELECT
            cliente_id,
            total_spent,
            total_orders,
            last_order_date,
            EXTRACT(DAY FROM (NOW() - last_order_date)) as days_since_last,
            CASE
                WHEN EXTRACT(DAY FROM (NOW() - last_order_date)) < 30 THEN 5
                WHEN EXTRACT(DAY FROM (NOW() - last_order_date)) < 90 THEN 4
                WHEN EXTRACT(DAY FROM (NOW() - last_order_date)) < 180 THEN 3
                WHEN EXTRACT(DAY FROM (NOW() - last_order_date)) < 365 THEN 2
                ELSE 1
            END as r_score,
            CASE
                WHEN total_orders >= 10 THEN 5
                WHEN total_orders >= 5 THEN 4
                WHEN total_orders >= 3 THEN 3
                WHEN total_orders >= 2 THEN 2
                ELSE 1
            END as f_score,
            CASE
                WHEN (total_spent / NULLIF(total_orders, 0)) >= 400 THEN 5
                WHEN (total_spent / NULLIF(total_orders, 0)) >= 200 THEN 4
                WHEN (total_spent / NULLIF(total_orders, 0)) >= 100 THEN 3
                WHEN (total_spent / NULLIF(total_orders, 0)) >= 50 THEN 2
                ELSE 1
            END as m_score
        FROM customer_stats
    ),
    customer_segments AS (
        SELECT
            *,
            CASE
                WHEN r_score >= 4 AND f_score >= 4 THEN 'champions'
                WHEN f_score >= 4 THEN 'loyal'
                WHEN r_score >= 4 AND f_score = 1 THEN 'new'
                WHEN r_score = 1 THEN 'lost'
                WHEN r_score <= 2 THEN 'at_risk'
                ELSE 'loyal'
            END as segment
        FROM customer_scores
    ),
    update_customers AS (
        UPDATE public.customers_v3 c
        SET
            rfm_recency = cs.r_score,
            rfm_frequency = cs.f_score,
            rfm_monetary = cs.m_score,
            rfm_segment = cs.segment,
            last_purchase_at = cs.last_order_date
        FROM customer_segments cs
        WHERE c.id = cs.cliente_id
          AND c.store_id = p_store_id
        RETURNING c.id
    )
    SELECT COUNT(*) INTO v_updated_count FROM update_customers;

    RETURN jsonb_build_object(
        'ok', true,
        'updated_count', v_updated_count
    );
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.calculate_rfm_for_store(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_rfm_for_store(UUID) TO authenticated;
