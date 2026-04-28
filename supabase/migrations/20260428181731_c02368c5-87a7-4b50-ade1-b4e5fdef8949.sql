
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  journey_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  language TEXT NOT NULL DEFAULT 'pt_BR',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_review','approved','rejected','disabled','paused')),
  header_type TEXT CHECK (header_type IN ('NONE','TEXT','IMAGE','VIDEO','DOCUMENT')) DEFAULT 'NONE',
  header_content TEXT,
  body_text TEXT NOT NULL,
  footer_text TEXT,
  buttons JSONB DEFAULT '[]'::jsonb,
  variables JSONB DEFAULT '[]'::jsonb,
  meta_template_id TEXT,
  meta_template_name TEXT,
  meta_synced_at TIMESTAMPTZ,
  meta_rejection_reason TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, journey_key, language)
);

CREATE INDEX IF NOT EXISTS idx_wa_templates_store ON public.whatsapp_templates(store_id);
CREATE INDEX IF NOT EXISTS idx_wa_templates_journey ON public.whatsapp_templates(journey_key);
CREATE INDEX IF NOT EXISTS idx_wa_templates_status ON public.whatsapp_templates(status);
CREATE INDEX IF NOT EXISTS idx_wa_templates_category ON public.whatsapp_templates(category);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_templates_global_journey
  ON public.whatsapp_templates(journey_key, language)
  WHERE store_id IS NULL;

DROP TRIGGER IF EXISTS trg_wa_templates_updated_at ON public.whatsapp_templates;
CREATE TRIGGER trg_wa_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global templates visible to authenticated"
  ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (store_id IS NULL);

CREATE POLICY "Store members can view their templates"
  ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid()));

CREATE POLICY "Store owners can insert templates"
  ON public.whatsapp_templates FOR INSERT TO authenticated
  WITH CHECK (store_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid()));

CREATE POLICY "Store owners can update templates"
  ON public.whatsapp_templates FOR UPDATE TO authenticated
  USING (store_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid()));

CREATE POLICY "Store owners can delete templates"
  ON public.whatsapp_templates FOR DELETE TO authenticated
  USING (store_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='has_role' AND pronamespace='public'::regnamespace) THEN
    EXECUTE 'CREATE POLICY "Admins manage all templates" ON public.whatsapp_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))';
  END IF;
END $$;

-- ============= SEED =============
INSERT INTO public.whatsapp_templates
  (store_id, journey_key, name, description, category, language, header_type, body_text, footer_text, buttons, variables)
VALUES
(NULL, 'pedido_confirmado', 'Pedido confirmado', 'Confirmação automática enviada após checkout aprovado.', 'UTILITY', 'pt_BR', 'TEXT',
 'Olá {{1}}! Seu pedido #{{2}} foi confirmado no valor de R$ {{3}}. Em breve você receberá o código de rastreio.', 'Equipe da loja',
 '[{"type":"URL","text":"Ver pedido","url":"https://exemplo.com/pedido/{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"order_number","example":"10245"},{"index":3,"name":"order_total","example":"249,90"}]'::jsonb),

(NULL, 'pedido_enviado', 'Pedido enviado', 'Notificação de envio com código de rastreio.', 'UTILITY', 'pt_BR', 'TEXT',
 'Boa notícia, {{1}}! Seu pedido #{{2}} foi enviado. Código de rastreio: {{3}}. Acompanhe pelo link abaixo.', NULL,
 '[{"type":"URL","text":"Rastrear","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"order_number","example":"10245"},{"index":3,"name":"tracking_code","example":"BR123456789"}]'::jsonb),

(NULL, 'pedido_entregue', 'Pedido entregue', 'Confirmação de entrega.', 'UTILITY', 'pt_BR', 'TEXT',
 'Olá {{1}}! Seu pedido #{{2}} foi entregue. Esperamos que você ame! Qualquer coisa, é só responder esta mensagem.', NULL,
 '[]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"order_number","example":"10245"}]'::jsonb),

(NULL, 'boleto_gerado', 'Boleto gerado', 'Envio do boleto após escolha do método de pagamento.', 'UTILITY', 'pt_BR', 'TEXT',
 'Olá {{1}}, aqui está seu boleto no valor de R$ {{2}} com vencimento em {{3}}. Pague agora pelo link.', NULL,
 '[{"type":"URL","text":"Abrir boleto","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"amount","example":"249,90"},{"index":3,"name":"due_date","example":"30/04/2026"}]'::jsonb),

(NULL, 'pix_pendente', 'PIX pendente', 'Envio do código PIX copia-e-cola.', 'UTILITY', 'pt_BR', 'TEXT',
 'Olá {{1}}! Para finalizar seu pedido, copie o código PIX abaixo e pague no app do seu banco. Valor: R$ {{2}}. Código: {{3}}', 'O código expira em 30 minutos',
 '[]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"amount","example":"249,90"},{"index":3,"name":"pix_code","example":"00020126..."}]'::jsonb),

(NULL, 'boleto_vencendo', 'Boleto vencendo', 'Lembrete enviado 1 dia antes do vencimento.', 'UTILITY', 'pt_BR', 'TEXT',
 'Oi {{1}}, lembrando que seu boleto de R$ {{2}} vence amanhã. Quer que eu envie a 2ª via?', NULL,
 '[{"type":"URL","text":"2a via","url":"{{1}}"},{"type":"QUICK_REPLY","text":"Ja paguei"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"amount","example":"249,90"}]'::jsonb),

(NULL, 'boleto_vencido', 'Boleto vencido', 'Recuperação de boleto vencido.', 'UTILITY', 'pt_BR', 'TEXT',
 'Oi {{1}}, seu boleto de R$ {{2}} venceu, mas ainda dá tempo de garantir seu pedido. Geramos uma 2ª via para você:', NULL,
 '[{"type":"URL","text":"Pagar agora","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"amount","example":"249,90"}]'::jsonb),

(NULL, 'agendamento_entrega', 'Agendamento de entrega', 'Confirmação de janela logística.', 'UTILITY', 'pt_BR', 'TEXT',
 'Olá {{1}}! Sua entrega está agendada para {{2}} no período {{3}}. Por favor, confirme se alguém estará no endereço.', NULL,
 '[{"type":"QUICK_REPLY","text":"Confirmar"},{"type":"QUICK_REPLY","text":"Reagendar"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"date","example":"30/04"},{"index":3,"name":"window","example":"manha"}]'::jsonb),

(NULL, 'carrinho_abandonado_1h', 'Carrinho abandonado — 1h', 'Primeiro toque da jornada de carrinho abandonado.', 'MARKETING', 'pt_BR', 'TEXT',
 'Oi {{1}}, vi que você esqueceu {{2}} no carrinho. Quer que eu te ajude a finalizar?', 'Responda SAIR para nao receber mais',
 '[{"type":"URL","text":"Voltar ao carrinho","url":"{{1}}"},{"type":"QUICK_REPLY","text":"Tenho duvida"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"product_name","example":"Tenis Runner"}]'::jsonb),

(NULL, 'carrinho_abandonado_24h_cupom', 'Carrinho abandonado — 24h com cupom', 'Última tentativa da jornada com desconto.', 'MARKETING', 'pt_BR', 'TEXT',
 '{{1}}, separamos um cupom especial de {{2}} pra você finalizar seu pedido hoje. Use o código no checkout.', 'Responda SAIR para nao receber mais',
 '[{"type":"URL","text":"Finalizar com desconto","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"coupon_value","example":"10% OFF"}]'::jsonb),

(NULL, 'reativacao_60d', 'Reativação 60 dias', 'Primeiro toque de reativação para clientes dormentes.', 'MARKETING', 'pt_BR', 'TEXT',
 'Oi {{1}}, faz um tempo que não nos vemos! Lançamos novidades em {{2}} que você vai amar. Dá uma olhada?', 'Responda SAIR para nao receber mais',
 '[{"type":"URL","text":"Ver novidades","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"category","example":"calcados"}]'::jsonb),

(NULL, 'reativacao_90d_oferta', 'Reativação 90 dias — oferta', 'Etapa final de reativação com cupom.', 'MARKETING', 'pt_BR', 'TEXT',
 '{{1}}, queremos você de volta! Use {{2}} até {{3}} e aproveite uma condição especial só pra você.', 'Responda SAIR para nao receber mais',
 '[{"type":"URL","text":"Aproveitar","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"coupon_code","example":"VOLTA15"},{"index":3,"name":"valid_until","example":"05/05"}]'::jsonb),

(NULL, 'winback_perdidos', 'Winback — clientes perdidos', 'Última cartada para o segmento RFM Perdidos.', 'MARKETING', 'pt_BR', 'TEXT',
 '{{1}}, sentimos sua falta. Preparamos {{2}} de desconto exclusivo pra te ver de novo por aqui.', 'Responda SAIR para nao receber mais',
 '[{"type":"URL","text":"Resgatar","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"coupon_value","example":"20%"}]'::jsonb),

(NULL, 'aniversario_cliente', 'Aniversário do cliente', 'Cupom de aniversário enviado no dia.', 'MARKETING', 'pt_BR', 'TEXT',
 'Feliz aniversário, {{1}}! Pra comemorar com a gente, use o cupom {{2}} até {{3}}.', 'Responda SAIR para nao receber mais',
 '[{"type":"URL","text":"Aproveitar presente","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"coupon_code","example":"BDAY20"},{"index":3,"name":"valid_until","example":"05/05"}]'::jsonb),

(NULL, 'pos_compra_cross_sell', 'Pós-compra cross-sell', 'Recomendação 14 dias após compra.', 'MARKETING', 'pt_BR', 'TEXT',
 'Oi {{1}}! Quem comprou o que você levou costuma amar também {{2}}. Quer dar uma olhada?', 'Responda SAIR para nao receber mais',
 '[{"type":"URL","text":"Ver produto","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"product_name","example":"Meia tecnica"}]'::jsonb),

(NULL, 'lancamento_produto', 'Lançamento de produto', 'Disparo para base segmentada em lançamentos.', 'MARKETING', 'pt_BR', 'TEXT',
 '{{1}}, acabou de chegar: {{2}} - você está entre os primeiros a saber. Garante o seu antes que esgote.', 'Responda SAIR para nao receber mais',
 '[{"type":"URL","text":"Ver lancamento","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"product_name","example":"Linha Verao 26"}]'::jsonb),

(NULL, 'promocao_sazonal', 'Promoção sazonal', 'Campanhas sazonais (Black Friday, Natal, Dia das Maes).', 'MARKETING', 'pt_BR', 'IMAGE',
 '{{1}}, nossa {{2}} começou! Descontos de até {{3}} válidos até {{4}}.', 'Responda SAIR para nao receber mais',
 '[{"type":"URL","text":"Ver ofertas","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"campaign_name","example":"Black Friday"},{"index":3,"name":"discount","example":"50% OFF"},{"index":4,"name":"valid_until","example":"30/11"}]'::jsonb),

(NULL, 'pedir_avaliacao', 'Pedir avaliação', 'Solicitação de review do produto.', 'MARKETING', 'pt_BR', 'TEXT',
 'Oi {{1}}! Como foi sua experiência com {{2}}? Sua avaliação ajuda muito outros clientes.', NULL,
 '[{"type":"URL","text":"Avaliar","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"product_name","example":"Tenis Runner"}]'::jsonb),

(NULL, 'fidelidade_pontos', 'Fidelidade — pontos creditados', 'Notificação de pontos ganhos.', 'MARKETING', 'pt_BR', 'TEXT',
 '{{1}}, você ganhou {{2}} pontos no nosso programa de fidelidade! Saldo atual: {{3}} pontos.', NULL,
 '[{"type":"URL","text":"Ver recompensas","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"points_earned","example":"120"},{"index":3,"name":"points_balance","example":"840"}]'::jsonb),

(NULL, 'fidelidade_tier_up', 'Fidelidade — novo tier', 'Cliente subiu de nível no programa.', 'MARKETING', 'pt_BR', 'TEXT',
 'Parabéns, {{1}}! Você acabou de subir para o tier {{2}}. Novos benefícios já estão liberados pra você.', NULL,
 '[{"type":"URL","text":"Ver beneficios","url":"{{1}}"}]'::jsonb,
 '[{"index":1,"name":"customer_name","example":"Maria"},{"index":2,"name":"new_tier","example":"Ouro"}]'::jsonb),

(NULL, 'codigo_verificacao', 'Código de verificação', 'OTP para login ou confirmação no checkout.', 'AUTHENTICATION', 'pt_BR', 'NONE',
 'Seu código de verificação é {{1}}. Não compartilhe com ninguém.', NULL,
 '[{"type":"OTP","text":"Copiar codigo","otp_type":"COPY_CODE"}]'::jsonb,
 '[{"index":1,"name":"otp_code","example":"123456"}]'::jsonb)

ON CONFLICT DO NOTHING;
