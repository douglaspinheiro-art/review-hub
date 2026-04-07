-- Migração para Atribuição de Elite (LTV Boost)

-- 1. Adicionar colunas de Atribuição na tabela pedidos_v3
ALTER TABLE pedidos_v3 ADD COLUMN IF NOT EXISTS cupom_utilizado TEXT;
ALTER TABLE pedidos_v3 ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE pedidos_v3 ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE pedidos_v3 ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE pedidos_v3 ADD COLUMN IF NOT EXISTS atribuicao_manual BOOLEAN DEFAULT FALSE;

-- 2. Coluna para custo de envio (para ROI no dashboard)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS custo_total_envio NUMERIC(12,4) DEFAULT 0;

-- 3. Índices para performance de busca por cupom
CREATE INDEX IF NOT EXISTS idx_pedidos_cupom ON pedidos_v3(cupom_utilizado);
CREATE INDEX IF NOT EXISTS idx_pedidos_utm_source ON pedidos_v3(utm_source);
