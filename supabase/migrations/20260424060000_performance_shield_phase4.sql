-- 20260424060000_performance_shield_phase4.sql
-- Phase 4 Performance Shield: Consolidated RPCs for Inbox, WhatsApp and AI Agent

-- 1. INBOX CHAT BUNDLE: Conversation + Messages + Contact Info
-- Consolidates the 3 requests made when opening a chat to reduce latency.
CREATE OR REPLACE FUNCTION public.get_inbox_chat_bundle_v2(
  p_conversation_id UUID,
  p_messages_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation JSONB;
  v_messages JSONB;
  v_contact JSONB;
BEGIN
  -- 1. Get Conversation
  SELECT row_to_json(c.*) INTO v_conversation
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_conversation IS NULL THEN
    RETURN jsonb_build_object('error', 'Conversation not found');
  END IF;

  -- 2. Get Contact Info (joined from conversations.contact_id)
  SELECT row_to_json(con.*) INTO v_contact
  FROM public.contacts con
  WHERE con.id = (v_conversation->>'contact_id')::uuid;

  -- 3. Get Recent Messages (last N)
  SELECT jsonb_agg(m) INTO v_messages
  FROM (
    SELECT id, conversation_id, content, created_at, direction, status, type, external_id, user_id, metadata
    FROM public.messages
    WHERE conversation_id = p_conversation_id
    ORDER BY created_at DESC
    LIMIT p_messages_limit
  ) m;

  RETURN jsonb_build_object(
    'conversation', v_conversation,
    'contact', v_contact,
    'messages', coalesce(v_messages, '[]'::jsonb),
    'notes', (
      SELECT jsonb_agg(n) FROM (
        SELECT id, conversation_id, user_id, note, created_at
        FROM public.conversation_notes
        WHERE conversation_id = p_conversation_id
        ORDER BY created_at DESC
        LIMIT 20
      ) n
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inbox_chat_bundle_v2(UUID, INT) TO authenticated;

-- 2. WHATSAPP BUNDLE: Connections + Health Summary
CREATE OR REPLACE FUNCTION public.get_whatsapp_bundle_v2(
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connections JSONB;
  v_health_summary JSONB;
BEGIN
  -- 1. Get Connections
  SELECT jsonb_agg(c) INTO v_connections
  FROM (
    SELECT id, instance_name, phone_number, status, provider, meta_phone_number_id, meta_waba_id, meta_default_template_name, connected_at, created_at, store_id
    FROM public.whatsapp_connections
    WHERE store_id = p_store_id
    ORDER BY created_at DESC
  ) c;

  -- 2. Health Summary (recent webhook errors or audits related to WhatsApp)
  SELECT jsonb_build_object(
    'recent_errors', (
      SELECT jsonb_agg(l) FROM (
        SELECT id, created_at, event_type, status, error_message
        FROM public.webhook_logs
        WHERE (metadata->>'store_id')::uuid = p_store_id
          AND status = 'error'
          AND event_type ILIKE '%whatsapp%'
        ORDER BY created_at DESC
        LIMIT 10
      ) l
    ),
    'total_connected', count(*) FILTER (WHERE status = 'connected')
  ) INTO v_health_summary
  FROM public.whatsapp_connections
  WHERE store_id = p_store_id;

  RETURN jsonb_build_object(
    'connections', coalesce(v_connections, '[]'::jsonb),
    'health', v_health_summary
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_bundle_v2(UUID) TO authenticated;

-- 3. AI AGENT BUNDLE: Config + Context
CREATE OR REPLACE FUNCTION public.get_ai_agent_bundle_v2(
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config JSONB;
  v_recent_actions JSONB;
BEGIN
  -- 1. Get AI Configuration
  SELECT row_to_json(cfg.*) INTO v_config
  FROM public.ai_agent_config cfg
  WHERE cfg.store_id = p_store_id
  LIMIT 1;

  -- 2. Get Recent AI Actions (from audit logs)
  SELECT jsonb_agg(a) INTO v_recent_actions
  FROM (
    SELECT id, action, resource, metadata, created_at
    FROM public.audit_logs
    WHERE store_id = p_store_id
      AND resource = 'ai_agent'
    ORDER BY created_at DESC
    LIMIT 20
  ) a;

  RETURN jsonb_build_object(
    'config', v_config,
    'recent_actions', coalesce(v_recent_actions, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_agent_bundle_v2(UUID) TO authenticated;
