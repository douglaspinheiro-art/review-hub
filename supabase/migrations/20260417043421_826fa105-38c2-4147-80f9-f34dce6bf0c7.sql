-- ============================================================
-- FASE A — Hardening multi-tenant em SECURITY DEFINER RPCs
-- ============================================================
-- Estratégia: adicionar guards (assert_store_access / assert_owner_access)
-- nas funções user-facing, e REVOKE EXECUTE em funções administrativas
-- (que só devem ser chamadas via service_role / SQL interno).

-- ------------------------------------------------------------
-- 1) Recriar wrappers das RPCs user-facing com guard no topo.
--    Usamos CREATE OR REPLACE FUNCTION para preservar assinatura.
--    O corpo original é preservado via uma função "_impl" separada
--    NÃO — preferimos uma abordagem mais simples: prefixar o corpo
--    existente com a chamada de assert via ALTER FUNCTION ... 
--    Como não há ALTER que injete, usamos um wrapper SQL que
--    chama assert e depois delega para a função original renomeada.
--
--    Para evitar quebrar comportamento, usamos a abordagem mais
--    segura e auditável: DROP+CREATE OR REPLACE só dos guards via
--    *event-style*: criamos uma função `enforce_store_access(uuid)`
--    e chamamos manualmente. Já existe `assert_store_access`.
--
--    Vamos usar uma técnica diferente e mais robusta: criar
--    funções de *trampolim* `*_safe` não — em vez disso, REVOKE 
--    do `authenticated` em todas as funções administrativas
--    abaixo, e os RPCs de leitura (get_*) já filtram internamente
--    por `auth.uid()` em joins. Vamos confirmar com REVOKE +
--    GRANT explícito apenas onde queremos expor.
-- ------------------------------------------------------------

-- ============================================================
-- 1. REVOKE EXECUTE em funções administrativas
--    Estas funções só devem ser chamadas por service_role
--    (edge functions internas, cron, webhooks).
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.add_loyalty_points(uuid, uuid, integer, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_old_scheduled_messages(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_oauth_state(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_integration_config(bytea, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_integration_config(jsonb, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_campaign_scheduled_messages(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_campaign_segmentation_v4(uuid, uuid, uuid, integer, numeric, integer, integer, text, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_campaign_sent_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_daily_analytics_messages(uuid, date, integer, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_daily_revenue(date, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_daily_revenue(uuid, date, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_unread_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_api_request_logs(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_cart_with_customer(uuid, uuid, text, text, text, text, text, numeric, jsonb, text, jsonb, text, text, text, numeric, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_cart_with_customer(uuid, uuid, text, text, text, text, text, numeric, jsonb, text, jsonb, text, text, text, numeric, text, text, jsonb, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_order_with_customer(uuid, uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, text, text, jsonb, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit_log(text, text, uuid, jsonb, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_prescription_campaign_draft(uuid, text, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, interval) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_atomic(text, integer, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.integration_health_summary(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_conversation_ids_by_message(text) FROM anon, authenticated;

-- ============================================================
-- 2. Adicionar guard `assert_store_access` em RPCs user-facing
--    que recebem p_store_id. Recriamos cada função adicionando
--    a chamada de assert no início. Preservamos o corpo original
--    intacto extraindo via pg_get_functiondef e re-criando.
--
--    Como não temos a definição original disponível aqui sem
--    risco, adoptamos abordagem alternativa: REVOKE+GRANT via
--    wrapper. Mas isso quebraria invocação por nome.
--
--    Solução prática: usar DO block para, para cada função alvo,
--    obter a definição atual, injetar o assert no início do
--    corpo (após "AS $$" / após "BEGIN") e re-criar.
--    Risco alto de quebrar parsing → optamos por abordagem
--    cirúrgica: as funções get_*_bundle_v2 já são chamadas
--    apenas via BFF (verifyJwt + assert no edge), portanto
--    REVOKE direto de authenticated para essas RPCs é a
--    proteção mais forte e simples.
-- ============================================================

-- RPCs que SÃO chamadas direto pelo frontend autenticado:
-- (manter EXECUTE; precisam de guard interno)
--   - get_dashboard_snapshot
--   - get_funil_page_data
--   - calculate_rfm_for_store (chamada via edge calculate-rfm)
--   - calculate_forecast_projection
--   - get_loyalty_dashboard_summary
--   - resolve_loyalty_by_phone (público intencional /portal)
--   - has_role
--   - is_password_rotation_due
--   - assert_store_access / assert_owner_access / auth_* (helpers)

-- RPCs *_bundle_v2 / get_review_stats / get_journey_sent_counts /
-- get_channel_order_stats / get_conversion_baseline_summary /
-- get_abandoned_cart_kpis / get_abandoned_carts_v2 /
-- get_loyalty_transactions_v2 / get_rfm_report_counts_v2 →
-- são todas servidas por edges BFF (com verifyJwt + assert).
-- Frontend NÃO deve chamar diretamente — REVOKE de authenticated.

REVOKE EXECUTE ON FUNCTION public.get_advanced_reports_bundle_v2(uuid, integer)             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_agent_bundle_v2(uuid)                              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_analytics_super_bundle_v2(uuid, integer)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_automacoes_bundle_v2(uuid)                            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_campaigns_bundle_v2(uuid, text, text, timestamp, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_contacts_bundle_v2(uuid, text, text, timestamp, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_execution_monitor_bundle_v2(uuid)                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_inbox_chat_bundle_v2(uuid, integer)                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_loyalty_dashboard_bundle_v2(uuid, uuid)               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_loyalty_transactions_v2(uuid, timestamp, integer)     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_operational_health_bundle_v2(uuid)                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_prescriptions_bundle_v2(uuid)                         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_review_stats(uuid)                                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_reviews_bundle_v2(uuid, text, text, timestamp, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_rfm_report_counts_v2(uuid)                            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_roi_attribution_bundle_v2(uuid, integer)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_bundle_v2(uuid)                              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_journey_sent_counts(uuid, uuid[])                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_channel_order_stats(uuid, timestamptz)                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_conversion_baseline_summary(uuid, integer)            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_abandoned_cart_kpis(uuid, timestamptz)                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_abandoned_carts_v2(uuid, timestamp, text, timestamp, integer) FROM anon, authenticated;

-- ============================================================
-- 3. RPCs que o frontend chama DIRETO precisam de guard interno.
--    Recriamos com assert_store_access no topo, preservando lógica
--    via chamada para a função interna (re-fetch via pg_get_functiondef
--    seria ideal, mas vamos adicionar guard manual nas que conhecemos
--    o corpo). Para as outras, REVOKE força passagem por edge BFF.
--
--    get_dashboard_snapshot, get_funil_page_data, calculate_rfm_for_store,
--    calculate_forecast_projection: usadas direto pelo frontend.
--    Vamos adicionar wrapper de assert via SECURITY DEFINER trigger
--    no início — usando ALTER FUNCTION não é possível, então
--    REVOKE essas também e o frontend passa a chamar via edge `bff-rpc`
--    OU mantemos EXECUTE e confiamos no RLS interno (joins por auth.uid()).
--
--    Política conservadora: manter EXECUTE para essas 4 RPCs
--    (já filtram por auth.uid via joins/RLS), mas adicionar
--    assert_store_access como camada extra recriando-as.
--    Como recriar exige conhecer corpo completo, optamos por
--    adicionar uma função GUARD pública chamada antes pelo
--    frontend (não viável retroativamente).
--
--    Decisão final desta fase A: REVOKE em TUDO _bundle_v2 e
--    sensíveis. Os 4 RPCs restantes (dashboard_snapshot, funil,
--    rfm, forecast) serão tratados na próxima fase com recriação
--    cirúrgica. Por enquanto, registamos um aviso via comment.
-- ============================================================

COMMENT ON FUNCTION public.get_dashboard_snapshot(uuid, integer) IS
  'TODO Fase B: adicionar PERFORM assert_store_access(p_store_id) no início.';
COMMENT ON FUNCTION public.get_funil_page_data(uuid, text) IS
  'TODO Fase B: adicionar PERFORM assert_store_access(p_store_id) no início.';
COMMENT ON FUNCTION public.calculate_rfm_for_store(uuid) IS
  'TODO Fase B: chamada via edge calculate-rfm que já valida ownership; manter EXECUTE só para authenticated bloqueado.';
COMMENT ON FUNCTION public.calculate_forecast_projection(uuid, integer) IS
  'TODO Fase B: adicionar PERFORM assert_store_access(p_store_id) no início.';

-- Já que calculate_rfm_for_store é chamada via edge service-role
-- e o edge já valida ownership, podemos revogar do authenticated:
REVOKE EXECUTE ON FUNCTION public.calculate_rfm_for_store(uuid)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_forecast_projection(uuid, integer) FROM anon, authenticated;

-- ============================================================
-- 4. Limpeza de RLS duplicada/permissiva em diagnostics_v3
--    Remove a policy ALL "Users can view own diagnostics" baseada
--    apenas em stores join; mantém diagnostics_v3_own (user_id +
--    auth_team_*) que é mais restritiva e cobre o caso.
-- ============================================================

DROP POLICY IF EXISTS "Users can view own diagnostics" ON public.diagnostics_v3;

-- ============================================================
-- 5. Limpeza de RLS duplicada em diagnostics
--    Remove a policy "users own diagnosticos" (legado) já coberta
--    por diagnostics_tenant.
-- ============================================================

DROP POLICY IF EXISTS "users own diagnosticos" ON public.diagnostics;

-- ============================================================
-- 6. Limpeza em audit_logs — manter só a policy admin/own;
--    remover a duplicada "Owners can view own audit logs" que
--    depende de subquery em stores (já coberta por
--    audit_logs_collaborator_read e read_own_or_admin_audit_logs).
-- ============================================================

DROP POLICY IF EXISTS "Owners can view own audit logs" ON public.audit_logs;

-- ============================================================
-- 7. Garantir RLS habilitado em api_request_logs (sem policies
--    = tabela bloqueada para authenticated, só service_role
--    consegue inserir via prune/check_rate_limit). OK.
-- ============================================================

ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
