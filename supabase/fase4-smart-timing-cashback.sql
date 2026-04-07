-- FASE 4: SMART TIMING & CASHBACK (LTV BOOST CORE)

-- 1. SMART TIMING INTELLIGENCE
-- Função para calcular o horário preferencial de contato baseado no histórico
CREATE OR REPLACE FUNCTION get_contact_preferred_hour(p_contact_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_hour INTEGER;
BEGIN
    -- Analisa o horário das mensagens lidas ou respondidas pelo contato
    SELECT EXTRACT(HOUR FROM created_at) INTO v_hour
    FROM messages
    WHERE contact_id = p_contact_id
    AND (direction = 'inbound' OR status = 'read')
    GROUP BY 1
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- Se não houver histórico, retorna NULL (fallback para horário comercial ou padrão do lojista)
    RETURN v_hour;
END;
$$ LANGUAGE plpgsql;

-- 2. CASHBACK & LOYALTY SYSTEM
-- Tabela de configuração de programas de fidelidade por lojista
CREATE TABLE IF NOT EXISTS loyalty_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    cashback_percentage DECIMAL(5,2) DEFAULT 0, -- Porcentagem de cashback sobre a compra
    min_purchase_value DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de créditos/cashback por cliente
CREATE TABLE IF NOT EXISTS customer_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    contact_id UUID REFERENCES contacts(id) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending', -- 'pending', 'available', 'used', 'expired'
    origin_order_id TEXT, -- ID do pedido que gerou o cashback
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Users can manage their own loyalty programs" ON loyalty_programs
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage credits of their own customers" ON customer_credits
    FOR ALL USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_loyalty_programs_updated_at BEFORE UPDATE ON loyalty_programs FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_customer_credits_updated_at BEFORE UPDATE ON customer_credits FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
