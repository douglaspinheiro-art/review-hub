-- Idempotência na fila de campanhas: evita duplicar scheduled_messages (pending/processing)
-- para o mesmo par (campaign_id, customer_id) e RPC em lote com ON CONFLICT DO NOTHING.

-- Remove duplicados antigos (mantém o registo mais antigo por par campanha+cliente).
DELETE FROM public.scheduled_messages sm
WHERE sm.id IN (
  SELECT id FROM (
    SELECT id,
      row_number() OVER (
        PARTITION BY campaign_id, customer_id
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.scheduled_messages
    WHERE campaign_id IS NOT NULL
      AND status IN ('pending', 'processing')
  ) d
  WHERE d.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_scheduled_messages_campaign_customer_pending
  ON public.scheduled_messages (campaign_id, customer_id)
  WHERE campaign_id IS NOT NULL
    AND status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.enqueue_campaign_scheduled_messages(p_messages jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ins int := 0;
  n_in int := 0;
BEGIN
  IF p_messages IS NULL OR jsonb_typeof(p_messages) <> 'array' THEN
    RETURN jsonb_build_object('inserted', 0, 'skipped', 0, 'error', 'invalid_payload');
  END IF;

  n_in := jsonb_array_length(p_messages);
  IF n_in = 0 THEN
    RETURN jsonb_build_object('inserted', 0, 'skipped', 0);
  END IF;

  INSERT INTO public.scheduled_messages (
    user_id,
    store_id,
    customer_id,
    journey_id,
    campaign_id,
    message_content,
    scheduled_for,
    status,
    metadata
  )
  SELECT
    (r->>'user_id')::uuid,
    (r->>'store_id')::uuid,
    (r->>'customer_id')::uuid,
    NULLIF(trim(BOTH FROM coalesce(r->>'journey_id', '')), '')::uuid,
    (r->>'campaign_id')::uuid,
    coalesce(r->>'message_content', ''),
    coalesce((r->>'scheduled_for')::timestamptz, now()),
    coalesce(nullif(trim(BOTH FROM coalesce(r->>'status', '')), ''), 'pending'),
    coalesce(r->'metadata', '{}'::jsonb)
  FROM jsonb_array_elements(p_messages) AS r
  ON CONFLICT (campaign_id, customer_id)
    WHERE (campaign_id IS NOT NULL AND status IN ('pending', 'processing'))
    DO NOTHING;

  GET DIAGNOSTICS ins = ROW_COUNT;
  RETURN jsonb_build_object(
    'inserted', ins,
    'skipped', greatest(0, n_in - ins)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_campaign_scheduled_messages(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.enqueue_campaign_scheduled_messages(jsonb) TO service_role;
