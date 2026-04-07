-- FEEDBACK LOOP + BENCHMARK SCORE MIGRATION
-- LTV Boost — Moat de Dados

-- 1. PRESCRIPTION RESULTS — feedback loop automático
-- Registra o resultado de cada prescrição executada para treinar o modelo de timing
CREATE TABLE IF NOT EXISTS prescription_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    prescription_id TEXT NOT NULL,               -- ID da prescrição aprovada
    prescription_type TEXT NOT NULL,             -- 'carrinho', 'boleto', 'reativacao', 'pos_compra', etc.
    contact_id UUID REFERENCES contacts(id),
    executed_at TIMESTAMPTZ DEFAULT now(),
    -- Resultado
    converted BOOLEAN DEFAULT FALSE,             -- Houve venda após a prescrição?
    conversion_value DECIMAL(10,2),              -- Valor da venda gerada
    conversion_at TIMESTAMPTZ,                   -- Quando a venda ocorreu
    days_to_convert INTEGER,                     -- Dias entre prescrição e conversão
    -- Canal e timing usado
    channel TEXT,                                -- 'whatsapp', 'email', 'sms'
    sent_hour INTEGER,                           -- Hora em que foi enviado (0-23)
    sent_day_of_week INTEGER,                    -- Dia da semana (0=dom, 6=sab)
    used_preferred_hour BOOLEAN DEFAULT FALSE,   -- Usou get_contact_preferred_hour()?
    -- Metadata
    coupon_used TEXT,
    discount_pct DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE prescription_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own prescription results"
    ON prescription_results FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_prescription_results_user ON prescription_results(user_id, executed_at DESC);
CREATE INDEX idx_prescription_results_type ON prescription_results(prescription_type, converted);
CREATE INDEX idx_prescription_results_timing ON prescription_results(sent_hour, sent_day_of_week, converted);


-- 2. STORE BENCHMARKS — dados agregados por nicho para o Benchmark Score
-- Atualizado via cron job diário com dados anonimizados de todas as lojas
CREATE TABLE IF NOT EXISTS store_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nicho TEXT NOT NULL,                          -- 'moda', 'beleza', 'suplementos', 'eletronicos', 'casa'
    periodo TEXT NOT NULL,                        -- '2026-03', '2026-04', etc.
    -- Métricas de conversão (média e percentis)
    cvr_p25 DECIMAL(6,3),                        -- CVR no percentil 25
    cvr_p50 DECIMAL(6,3),                        -- CVR mediana
    cvr_p75 DECIMAL(6,3),                        -- CVR no percentil 75
    cvr_p90 DECIMAL(6,3),                        -- CVR top 10%
    -- LTV
    ltv_p50 DECIMAL(10,2),
    ltv_p75 DECIMAL(10,2),
    -- Ticket médio
    ticket_p50 DECIMAL(10,2),
    -- Churn
    churn_p50 DECIMAL(5,2),
    -- Timing médio de maior conversão (resultado do feedback loop)
    best_hour_p50 INTEGER,                       -- Hora com maior CVR média no nicho
    best_day_p50 INTEGER,                        -- Dia da semana com maior CVR
    -- Taxa de recuperação por tipo de automação
    cart_recovery_rate_p50 DECIMAL(5,2),
    boleto_recovery_rate_p50 DECIMAL(5,2),
    reactivation_rate_p50 DECIMAL(5,2),
    -- Amostra
    store_count INTEGER NOT NULL DEFAULT 0,       -- Número de lojas que geraram esses dados
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint por nicho + período
ALTER TABLE store_benchmarks ADD CONSTRAINT unique_benchmark_nicho_periodo UNIQUE (nicho, periodo);

-- Sem RLS — dados públicos/anonimizados, leitura livre para usuários autenticados
ALTER TABLE store_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read benchmarks"
    ON store_benchmarks FOR SELECT TO authenticated USING (true);


-- 3. STORE BENCHMARK SCORES — percentil calculado por loja
-- Atualizado diariamente para cada loja ativa
CREATE TABLE IF NOT EXISTS store_benchmark_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
    nicho TEXT NOT NULL,
    periodo TEXT NOT NULL,
    -- Percentil em cada dimensão (0-100)
    cvr_percentil INTEGER,
    ltv_percentil INTEGER,
    ticket_percentil INTEGER,
    churn_percentil INTEGER,
    -- Score geral ponderado
    score_geral INTEGER,                         -- 0-100, ponderação: CVR 40%, LTV 30%, Churn 20%, Ticket 10%
    -- Histórico
    score_anterior INTEGER,
    score_delta INTEGER,                         -- Variação vs período anterior
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE store_benchmark_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own benchmark score"
    ON store_benchmark_scores FOR SELECT USING (auth.uid() = user_id);


-- 4. FUNÇÃO: Calcular percentil de uma loja em tempo real
CREATE OR REPLACE FUNCTION calculate_store_percentil(
    p_user_id UUID,
    p_nicho TEXT,
    p_cvr DECIMAL,
    p_periodo TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM')
)
RETURNS INTEGER AS $$
DECLARE
    v_cvr_p25 DECIMAL;
    v_cvr_p50 DECIMAL;
    v_cvr_p75 DECIMAL;
    v_cvr_p90 DECIMAL;
    v_percentil INTEGER;
BEGIN
    SELECT cvr_p25, cvr_p50, cvr_p75, cvr_p90
    INTO v_cvr_p25, v_cvr_p50, v_cvr_p75, v_cvr_p90
    FROM store_benchmarks
    WHERE nicho = p_nicho AND periodo = p_periodo
    LIMIT 1;

    -- Interpolação simples dos percentis
    IF v_cvr_p50 IS NULL THEN
        RETURN NULL; -- Sem dados suficientes para este nicho/período
    END IF;

    IF p_cvr >= v_cvr_p90 THEN
        v_percentil := 90 + LEAST(10, ROUND((p_cvr - v_cvr_p90) / v_cvr_p90 * 100)::INTEGER);
    ELSIF p_cvr >= v_cvr_p75 THEN
        v_percentil := 75 + ROUND((p_cvr - v_cvr_p75) / (v_cvr_p90 - v_cvr_p75) * 15)::INTEGER;
    ELSIF p_cvr >= v_cvr_p50 THEN
        v_percentil := 50 + ROUND((p_cvr - v_cvr_p50) / (v_cvr_p75 - v_cvr_p50) * 25)::INTEGER;
    ELSIF p_cvr >= v_cvr_p25 THEN
        v_percentil := 25 + ROUND((p_cvr - v_cvr_p25) / (v_cvr_p50 - v_cvr_p25) * 25)::INTEGER;
    ELSE
        v_percentil := GREATEST(1, ROUND(p_cvr / v_cvr_p25 * 25)::INTEGER);
    END IF;

    RETURN LEAST(99, v_percentil);
END;
$$ LANGUAGE plpgsql;


-- 5. FUNÇÃO: Melhor hora para enviar para um contato (com fallback para benchmark do nicho)
CREATE OR REPLACE FUNCTION get_optimal_send_hour(
    p_contact_id UUID,
    p_nicho TEXT DEFAULT 'moda'
)
RETURNS INTEGER AS $$
DECLARE
    v_preferred INTEGER;
    v_benchmark_hour INTEGER;
BEGIN
    -- Tenta o horário preferencial do contato específico
    v_preferred := get_contact_preferred_hour(p_contact_id);

    IF v_preferred IS NOT NULL THEN
        RETURN v_preferred;
    END IF;

    -- Fallback: melhor hora do nicho com base no feedback loop
    SELECT best_hour_p50 INTO v_benchmark_hour
    FROM store_benchmarks
    WHERE nicho = p_nicho
    ORDER BY periodo DESC
    LIMIT 1;

    -- Fallback final: horário comercial padrão (10h)
    RETURN COALESCE(v_benchmark_hour, 10);
END;
$$ LANGUAGE plpgsql;
