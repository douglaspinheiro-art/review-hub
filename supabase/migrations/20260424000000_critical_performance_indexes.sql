-- 20260424000000_critical_performance_indexes.sql
-- 1. GIN index for full-text search on message content (Ponto #2)
-- Using to_tsvector for English and Portuguese (simple is safer for mixed content)
CREATE INDEX IF NOT EXISTS idx_messages_content_gin ON public.messages USING GIN (to_tsvector('simple', content));

-- 2. Optimized index for Inbox list (Ponto #16)
-- Covers multi-tenancy (store_id), filtering (status) and ordering (last_message_at)
CREATE INDEX IF NOT EXISTS idx_conversations_inbox_optimized 
ON public.conversations (store_id, status, last_message_at DESC NULLS LAST);

-- 3. Refactor search RPC to use GIN index (Ponto #2)
CREATE OR REPLACE FUNCTION public.search_conversation_ids_by_message(p_search text)
RETURNS TABLE (conversation_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT conversation_id
  FROM messages
  WHERE to_tsvector('simple', content) @@ websearch_to_tsquery('simple', p_search)
  LIMIT 1000;
$$;

-- 4. Add per-store rate limit metadata table (Ponto #6)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text UNIQUE NOT NULL, -- e.g., 'gerar-diagnostico:{store_id}'
  last_request_at timestamptz NOT NULL DEFAULT now()
);

-- Function to check and update rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_interval interval)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last timestamptz;
BEGIN
  SELECT last_request_at INTO v_last FROM rate_limits WHERE key = p_key;
  
  IF v_last IS NOT NULL AND (now() - v_last) < p_interval THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limits (key, last_request_at)
  VALUES (p_key, now())
  ON CONFLICT (key) DO UPDATE SET last_request_at = now();
  
  RETURN true;
END;
$$;
