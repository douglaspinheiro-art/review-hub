-- 20260423130000_webhook_idempotency_and_skeletons.sql
-- Adiciona idempotência à fila de webhooks para evitar duplicidade de abandonos.

-- 1. Adicionar coluna external_id para rastreamento explícito
ALTER TABLE public.webhook_queue 
ADD COLUMN IF NOT EXISTS external_id TEXT;

-- 2. Índice único para evitar duplicidade de processamento por loja e ID externo
CREATE UNIQUE INDEX IF NOT EXISTS uniq_webhook_queue_store_external 
ON public.webhook_queue (store_id, external_id)
WHERE external_id IS NOT NULL;

-- 3. Atualizar a função process-scheduled-messages para preencher o external_id se necessário (ou fazer no INSERT)
-- Mas para webhooks futuros, o INSERT já deve enviar o external_id.
