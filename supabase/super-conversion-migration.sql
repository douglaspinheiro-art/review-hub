-- Migração para Funcionalidades de Super-Conversão (LTV Boost)

-- 1. Configurações de Negociação e IA na tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ia_negotiation_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ia_max_discount_pct INTEGER DEFAULT 10; -- Max 10% de desconto automático
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pix_key TEXT; -- Chave PIX da loja
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_proof_enabled BOOLEAN DEFAULT TRUE;

-- 2. Tabela para registrar cupons gerados pela IA (para controle e expiração)
CREATE TABLE IF NOT EXISTS ai_generated_coupons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_pct int NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3. Configurações de WhatsApp Flows (JSON dinâmico para cada loja se necessário)
CREATE TABLE IF NOT EXISTS whatsapp_flows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  flow_id text NOT NULL, -- ID do Meta
  name text NOT NULL, -- ex: "Escolha de Tamanho", "Calculadora de Frete"
  screen_id text NOT NULL, -- Tela inicial do fluxo
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 4. RLS para novas tabelas
ALTER TABLE ai_generated_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_flows ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ai_coupons_own') THEN
        CREATE POLICY "ai_coupons_own" ON ai_generated_coupons FOR ALL USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'whatsapp_flows_own') THEN
        CREATE POLICY "whatsapp_flows_own" ON whatsapp_flows FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ai_coupons_contact ON ai_generated_coupons(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_flows_user ON whatsapp_flows(user_id);
