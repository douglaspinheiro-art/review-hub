CREATE OR REPLACE FUNCTION public.execute_campaign_segmentation_v4(p_campaign_id uuid, p_store_id uuid, p_actor_user_id uuid, p_holdout_pct integer DEFAULT 0, p_min_expected_value numeric DEFAULT 0, p_max_recipients integer DEFAULT 0, p_cooldown_hours integer DEFAULT 24, p_message_template text DEFAULT ''::text, p_meta_template_name text DEFAULT NULL::text, p_content_type text DEFAULT 'text'::text, p_media_url text DEFAULT NULL::text, p_campaign_name text DEFAULT ''::text)
 RETURNS TABLE(enqueued_count integer, holdout_count integer, cooldown_count integer, opt_out_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted INT := 0;
  v_holdouts INT := 0;
  v_cooldown INT := 0;
  v_opt_out  INT := 0;
  v_cutoff   TIMESTAMP;
BEGIN
  v_cutoff := now() - (p_cooldown_hours * interval '1 hour');

  SELECT count(*)::int INTO v_opt_out
  FROM customers_v3
  WHERE store_id = p_store_id
    AND unsubscribed_at IS NOT NULL;

  WITH recipients_cooldown AS (
    SELECT DISTINCT c.id AS customer_id
    FROM message_sends ms
    JOIN contacts ct ON ct.id = ms.contact_id
    JOIN customers_v3 c ON c.store_id = p_store_id AND c.phone = ct.phone
    WHERE ms.store_id = p_store_id
      AND ms.status LIKE 'sent%'
      AND ms.sent_at >= v_cutoff
  ),
  segmented_candidates AS (
    SELECT 
      c.id,
      c.name,
      c.phone,
      c.email,
      (least(5, coalesce(c.rfm_monetary, 1)) * 18) +
      (least(5, coalesce(c.rfm_recency, 1)) * 18) +
      (greatest(0, 1 - coalesce(c.churn_score, 0)) * 12) AS expected_value
    FROM customers_v3 c
    WHERE c.store_id = p_store_id
      AND c.unsubscribed_at IS NULL
      AND c.phone IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recipients_cooldown rc WHERE rc.customer_id = c.id)
  ),
  ranked_candidates AS (
    SELECT *,
      row_number() OVER (ORDER BY expected_value DESC) as rank
    FROM segmented_candidates
    WHERE expected_value >= p_min_expected_value
  ),
  limited_candidates AS (
    SELECT *
    FROM ranked_candidates
    WHERE (p_max_recipients = 0 OR rank <= p_max_recipients)
  ),
  final_split AS (
    SELECT *,
      (abs(hashtext(p_campaign_id::text || ':' || id::text)) % 100) as bucket
    FROM limited_candidates
  )
  INSERT INTO scheduled_messages (
    user_id, store_id, customer_id, campaign_id, message_content,
    scheduled_for, status, metadata
  )
  SELECT 
    p_actor_user_id, p_store_id, fs.id, p_campaign_id,
    replace(p_message_template, '{{name}}', coalesce(fs.name, '')),
    now(), 'pending',
    jsonb_build_object(
      'campaign_name', p_campaign_name,
      'content_type', p_content_type,
      'media_url', p_media_url,
      'meta_template_name', p_meta_template_name,
      'expected_value', fs.expected_value
    )
  FROM final_split fs
  WHERE fs.bucket >= p_holdout_pct
  ON CONFLICT (campaign_id, customer_id) 
    WHERE status IN ('pending', 'processing')
    DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT count(*)::int INTO v_holdouts
  FROM (
    SELECT id FROM (
      SELECT id, (abs(hashtext(p_campaign_id::text || ':' || id::text)) % 100) as bucket 
      FROM (
        SELECT id FROM segmented_candidates 
        WHERE expected_value >= p_min_expected_value
        LIMIT (CASE WHEN p_max_recipients = 0 THEN 999999999 ELSE p_max_recipients END)
      ) tmp
    ) tmp2 WHERE bucket < p_holdout_pct
  ) h;

  SELECT count(*)::int INTO v_cooldown FROM recipients_cooldown;

  UPDATE campaigns
  SET status = 'running',
      total_contacts = v_inserted + v_holdouts,
      updated_at = now()
  WHERE id = p_campaign_id;

  RETURN QUERY SELECT v_inserted, v_holdouts, v_cooldown, v_opt_out;
END;
$function$;