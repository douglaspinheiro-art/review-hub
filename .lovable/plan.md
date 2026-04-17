
**Auditoria recebida — plano de correção em camadas**

A auditoria está correta nos pontos críticos. Vou propor uma correção em **3 fases**, priorizando o risco de **isolamento multi-tenant** (vazamento entre lojas) que é o mais grave.

---

## Fase 1 — Segurança crítica (multi-tenant lockdown)

**Objetivo:** impedir que uma loja veja dados de outra, mesmo com `store_id` manipulado.

### 1.1 Hardening das RPCs `SECURITY DEFINER`
Adicionar guarda de tenant no início de cada RPC sensível. Padrão único reutilizando funções já existentes (`auth_team_read_store`):

```sql
-- Guarda padrão a injetar no topo de cada RPC store-scoped
IF NOT EXISTS (
  SELECT 1 FROM public.stores s
  WHERE s.id = p_store_id
    AND (s.user_id = auth.uid() OR public.auth_team_read_store(s.id))
) THEN
  RAISE EXCEPTION 'forbidden: store access denied' USING ERRCODE = '42501';
END IF;
```

RPCs a endurecer (todas via migration):
- `get_campaigns_bundle_v2`
- `get_contacts_bundle_v2`
- `get_funil_page_data`
- `get_dashboard_snapshot`
- `get_inbox_chat_bundle_v2`
- `get_automacoes_bundle_v2`
- `get_abandoned_carts_v2` (já tem, validar)
- `get_ai_agent_bundle_v2`
- `get_whatsapp_bundle_v2`
- `get_roi_attribution_bundle_v2`
- `get_analytics_super_bundle_v2`
- `get_execution_monitor_bundle_v2`
- `get_prescriptions_bundle_v2`
- `search_conversation_ids_by_message`
- `get_rfm_report_counts_v2`

Para RPCs por `p_user_id` (`get_reviews_bundle_v2`, `get_loyalty_*`):
```sql
IF p_user_id <> auth.uid() AND NOT public.auth_team_read_owner(p_user_id) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
```

### 1.2 Revogar grants para `anon` / `PUBLIC`
```sql
REVOKE EXECUTE ON FUNCTION public.get_campaigns_bundle_v2(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaigns_bundle_v2(...) TO authenticated;
-- repetir para todas as RPCs sensíveis acima
```

### 1.3 BFF `get-cached-data` — usar JWT do usuário, não service role
Refatorar `supabase/functions/get-cached-data/index.ts`:
- Criar Supabase client com `Authorization: Bearer <jwt-do-usuário>` (não service role).
- Cache key passa a incluir `user.id`: `${user.id}:${rpc_name}:${stableParams}`.
- Assim, mesmo que params sejam manipulados, RLS + guarda da RPC bloqueiam vazamento, e o cache nunca cruza usuários.

---

## Fase 2 — Frontend defensivo

### 2.1 `useCampaigns` — eliminar fallback por `user_id` em modo multi-loja
Em `src/hooks/useDashboard.ts`:
- Quando `scope.ready === true` e existe `activeStoreId`, **só** chamar a RPC `get_campaigns_bundle_v2` com `p_store_id`.
- Remover o caminho `.from("campaigns").eq("user_id", effectiveUserId)` exceto quando `scope.storeOptions.length === 0` (conta sem nenhuma loja).
- `enabled: scope.ready && !!activeStoreId` para não disparar query antes do scope resolver.

### 2.2 `/dashboard/contatos` — estado explícito "base vazia"
Em `src/pages/dashboard/Contatos.tsx`:
- Quando `totalCount === 0` e **sem filtros** (`!hasListFilters`), renderizar empty state distinto de "sem resultados":
  - Título: "Sua base de contatos está vazia"
  - Texto: "Conecte sua loja Dizy ou importe um CSV para popular `customers_v3`."
  - CTAs: `[Conectar loja]` → `/dashboard/integracoes` e `[Importar CSV]` (placeholder, usa edge `bulk-import-contacts`).

### 2.3 Resolver `400` em `get_whatsapp_bundle_v2`, `get_abandoned_carts_v2` e `404` em `get_roi_attribution_bundle_v2`
Investigar (somente após Fase 1 aplicada) se 400 vem de assinatura desalinhada (parâmetros faltando) ou colunas inexistentes. 404 indica que a função não foi deployada no remoto — adicionar à migration faltante ou verificar via `supabase migration list`.

---

## Fase 3 — Drift de schema (correções pontuais)

Erros nos logs Postgres apontam queries chamando colunas inexistentes:
- `message_sends.created_at` → usar `sent_at` (ou adicionar coluna em migration)
- `conversations.sla_due_at` → confirmar se coluna existe ou ajustar query
- `phone_number` (provável `contacts.phone`)
- `utm_source` em `abandoned_carts` (já existe no schema visto, validar tabela alvo)
- `stores.ticket_medio` / `stores.meta_conversao` → já conhecido em `get_funil_page_data`

Cada caso: localizar no código, ajustar para coluna real ou migration adicionando a coluna se realmente faz parte do design.

---

## O que NÃO está incluído neste plano
- Pipeline de população de `customers_v3` a partir do Dizy (causa raiz funcional do "Contatos vazio") — requer investigação separada das edge functions de webhook/oauth Dizy. Cobrirei depois da Fase 1, em PR isolado.
- Fix do erro `META_APP_ID not configured` (já endereçado em diff anterior; aguarda configuração do secret pelo usuário).

---

## Ordem de execução proposta
1. **Migration** — guarda de tenant + revoke grants em todas as RPCs (Fase 1.1 + 1.2).
2. **Edge function** — refactor `get-cached-data` para JWT do usuário (Fase 1.3).
3. **Frontend** — `useCampaigns` sem fallback + empty state em Contatos (Fase 2.1 + 2.2).
4. **Investigação follow-up** — 400/404 das RPCs e drift de schema (Fase 2.3 + Fase 3) em ciclo separado, com diagnóstico fresh após Fase 1.

Após aprovado, aplico as 3 primeiras etapas em sequência (a migration exigirá sua aprovação no momento da execução).
