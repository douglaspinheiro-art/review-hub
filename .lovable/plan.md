
Vou conduzir auditoria estruturada em 5 fases, focando nos riscos que ainda podem existir após Fases 1–3 já aplicadas (lockdown de RPCs, BFF com JWT, drift de schema corrigido).

**Escopo da investigação (read-only):**
1. Mapear integrações reais (Dizy/Shopify/Nuvemshop/etc, WhatsApp Meta, Email Resend, GA4, Stripe, Mercado Pago, webhooks, crons).
2. Auditar isolamento multi-tenant em **todas** as queries `.from(...)` do frontend (procurar `.select` sem `.eq("store_id"|"user_id")`, sem `enabled` gating, e sem `auth_row_*`).
3. Auditar **edge functions sensíveis** quanto a uso indevido de `SERVICE_ROLE_KEY` em handlers user-facing, ausência de `getClaims()`, ausência de validação de tenant, CORS aberto em endpoints autenticados.
4. Auditar cada uma das 21 páginas do dashboard (+ /resultado, /setup) com matriz: integrações | endpoint | tenant explícito? | risco de vazamento | erro silencioso.
5. Caçar falhas latentes: cache cross-tenant em `localStorage`/`sessionStorage`/TanStack Query, race conditions ao trocar de loja, RPCs ainda sem `assert_*`, RLS com `USING (true)` ou predicates fracos, tabelas sem RLS, webhooks sem HMAC, segredos compartilhados rotacionáveis.

**Ferramentas que usarei (todas read-only):**
- `code--search_files` para varrer queries sem filtro de tenant, uso de `SERVICE_ROLE_KEY`, `verify_jwt = false`, `localStorage.setItem` com dados de tenant.
- `code--view` para inspecionar páginas, hooks (`useDashboard`, `useConvertIQ`, etc.), edge functions críticas e `supabase/config.toml`.
- `supabase--read_query` para: (a) listar todas as RPCs `SECURITY DEFINER` e confirmar quais ainda **não** têm `assert_store_access`/`assert_owner_access`; (b) listar tabelas com RLS desabilitado; (c) listar policies com `USING (true)`; (d) verificar grants residuais para `anon`/`PUBLIC`.
- `supabase--linter` para issues automáticos (RLS off, search_path mutável, SECURITY DEFINER sem search_path).
- `supabase--analytics_query` em `postgres_logs` e `function_edge_logs` (últimas 24h) para capturar 401/403/500 reais e queries que ainda batem em colunas inexistentes.
- `security--run_security_scan` + `security--get_table_schema` para checagem cruzada.

**Entregável (relatório único, em chat):**
Estrutura fixa por achado:
```
[SEVERIDADE 🔴/🟠/🟡/🟢] Título
Local: arquivo:linha ou rpc/edge function
Evidência: trecho de código + (quando aplicável) query SQL/log
Causa raiz: 1–2 frases
Impacto: o que vaza / quebra / quem sente
Correção: patch sugerido (código)
```

Seções do relatório:
1. **Inventário de integrações** (tabela: integração | auth | onde configura | onde consome | risco residual).
2. **Lockdown multi-tenant — gaps remanescentes** (RPCs sem `assert_*`, queries frontend sem `.eq(store_id)`, edge functions com service-role indevido, cache keys sem `userId`).
3. **Auditoria página-a-página** (21 páginas + /resultado + /setup, formato matriz).
4. **Falhas críticas de integração** (Dizy → `customers_v3` vazio, Meta WA `META_APP_ID`, webhooks sem HMAC se houver, Stripe/MP sem `verify_jwt=false` correto).
5. **Riscos latentes** (RLS fraco, policies permissivas, segredos compartilhados, drift residual, race conditions em troca de loja, possível bypass via cache TanStack quando `activeStoreId` muda).
6. **Plano de remediação priorizado** — agrupado por:
   - **Fase A (P0, mesmo PR)**: itens que ainda permitem vazamento entre tenants.
   - **Fase B (P1)**: integrações quebradas (Dizy ingest pipeline, WA secrets).
   - **Fase C (P2)**: hardening (rotação de segredos, HMAC, observabilidade).

**O que NÃO faço nesta etapa:** nenhum código é alterado. O relatório fecha com lista de migrations/edits necessários para você aprovar antes da execução.

Pronto para executar a auditoria — ao aprovar este plano, troco para modo default e devolvo o relatório completo em uma única resposta (sem alterar nada ainda). As correções vêm em PRs separados, um por fase, cada um aguardando aprovação individual.
