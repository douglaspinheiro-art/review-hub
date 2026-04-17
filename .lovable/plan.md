

## Veredito sobre a auditoria: **CORRETA**

Validei cada ponto:

| Achado | Status | Evidência |
|---|---|---|
| 4 edges com `service_role` + `store_id` sem ownership | ✅ Confirmado | grep mostrou as 4 linhas `SERVICE_ROLE_KEY` sem `getClaims`/`assert_store_access` |
| `google-oauth-callback` state em string, sem persistência | ✅ Confirmado | Código usa `${userId}:${storeId}:${uuid}` e `split(":")` — embora `oauth_states` + `consume_oauth_state` já existam no DB e estejam sendo usados por outros OAuth (Shopify/Nuvemshop) |
| `api_request_logs` e `rate_limits` com RLS sem policy | ✅ Confirmado | Linter + query: `rowsecurity=true`, `policies=0` |
| `resolve_loyalty_by_phone` com EXECUTE para PUBLIC | ✅ Confirmado | `grantee=PUBLIC, privilege=EXECUTE` |
| Frontend confia em RLS para mutações | ✅ Plausível (padrão amplo no código) |

**Concordo com NO-GO** até P0 ser resolvido. P1 pode ir logo após.

---

## Plano de correção (ordem de execução)

### P0 — Bloqueadores cross-tenant (1 migração + 4 edges)

**1. Hardenizar 4 edge functions** — substituir `service_role` cego por:
- Validar `Authorization: Bearer <jwt>` via `supabase.auth.getClaims(token)`
- Resolver `auth.uid()` e validar ownership via `assert_store_access(store_id)` (RPC já existe e cobre owner + team) antes de qualquer query
- Manter `service_role` apenas para o trabalho interno depois do check, OU usar cliente com JWT do usuário (preferível)

Arquivos:
- `supabase/functions/relatorio-semanal/index.ts`
- `supabase/functions/benchmark-setor/index.ts`
- `supabase/functions/verificar-frequencia/index.ts`
- `supabase/functions/sincronizar-canal/index.ts`

**2. Refatorar `google-oauth-callback`** para reutilizar `oauth_states` (tabela + RPC `consume_oauth_state` já existem):
- No `action=start`: `INSERT INTO oauth_states (state_token, user_id, store_id, platform='google', expires_at=now()+10min)`
- No callback: chamar `consume_oauth_state(state_token)` (DELETE + RETURNING, one-time, com expiração)
- Eliminar `split(":")` e o user_id/store_id viajando dentro do state

**3. Migração SQL — fechar gaps de banco**:
```sql
-- a) Revogar grant amplo
REVOKE EXECUTE ON FUNCTION public.resolve_loyalty_by_phone(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_loyalty_by_phone(text, text) TO authenticated;
-- (a função é chamada pela página pública /portal/Pontos; manter anon se for esse o caso — investigar antes; default = só authenticated)

-- b) Policies para api_request_logs e rate_limits (uso interno service_role)
CREATE POLICY "service_only_select" ON public.api_request_logs FOR SELECT TO authenticated USING (false);
CREATE POLICY "deny_all_writes"     ON public.api_request_logs FOR ALL    TO authenticated USING (false) WITH CHECK (false);
-- mesmo padrão para rate_limits
-- (service_role bypassa RLS, então funciona; clientes não acessam)
```

> **Decisão necessária:** `resolve_loyalty_by_phone` é chamada na página pública `/p/:slug` (portal de pontos do cliente final, sem login). Se sim, manter `GRANT TO anon` e mitigar via rate-limit por IP no edge. Vou verificar antes de aplicar o REVOKE.

### P1 — Higiene pós-go-live (mesma sessão, opcional bloqueante)

**4. Endurecer mutações no frontend** — varrer `update()`/`delete()` em hooks e páginas críticas (`Inbox`, `EmExecucao`, `WhatsApp`, `Prescricoes`) e adicionar `.eq('store_id', activeStoreId)` redundante além do `id`. Defesa em profundidade vs. regressão de RLS.

**5. Remover fallbacks silenciosos de métricas** — em `Funil`, `Atribuicao`, `BenchmarkScore`: quando `data === null` ou erro, exibir empty state explícito ao invés de heurística mock. (Já existe mock em telas demo — restringir a `import.meta.env.DEV`).

### Fora de escopo (não bloqueador)
- Leaked Password Protection: requer plano Pro
- Extensions in public: warning de organização, sem impacto runtime

---

## Arquivos a alterar

```
supabase/functions/relatorio-semanal/index.ts        (auth + ownership)
supabase/functions/benchmark-setor/index.ts          (auth + ownership)
supabase/functions/verificar-frequencia/index.ts     (auth + ownership)
supabase/functions/sincronizar-canal/index.ts        (auth + ownership)
supabase/functions/google-oauth-callback/index.ts    (usar oauth_states)
supabase/migrations/<novo>.sql                       (REVOKE + policies)
```

P1 (após validar P0):
```
src/pages/dashboard/Inbox.tsx, EmExecucao.tsx, WhatsApp.tsx, Prescricoes.tsx
src/pages/dashboard/Funil.tsx, Atribuicao.tsx, BenchmarkScore.tsx
```

---

## Pergunta antes de implementar

A função `resolve_loyalty_by_phone` alimenta o portal público de pontos (`/p/:slug`) que clientes finais consultam **sem login** — devo:
- (A) Manter `GRANT TO anon` e blindar via rate-limit + sem dados sensíveis no retorno (status quo funcional)
- (B) Mover para uma edge function pública com rate-limit por IP/telefone e revogar do anon

Recomendo **A** (já é seguro: retorna apenas pontos do próprio número informado). Confirme para eu aplicar.

