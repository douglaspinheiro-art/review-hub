

# Plano: Ajustes Finais para Produção

## Diagnóstico Atual

Após auditar linter, security scan, console logs e schema RLS, restam **3 blocos** de trabalho:

---

## Bloco 1 — RLS Policies `TO public` → `TO authenticated` (15 tabelas)

Estas tabelas ainda têm policies com role `public` em vez de `authenticated`, criando risco de exposição se `user_id` for NULL:

| Tabela | Policy |
|---|---|
| `affiliate_referrals` | `affiliates_own` |
| `ai_agent_config` | `agente_ia_own` |
| `ai_generated_coupons` | `ai_coupons_own` |
| `api_keys` | `api_keys_own` |
| `benchmark_reports` | `benchmark_reports_own` |
| `channels` | `canais_own` |
| `communications_sent` | `comunicacoes_enviadas_own` |
| `convertiq_settings` | `users own configuracoes_convertiq` |
| `diagnostics` | `users own diagnosticos` |
| `executions` | `execucoes_own` |
| `funnel_metrics` | `users own metricas_funil` |
| `funnel_metrics_v3` | `metricas_v3_own` |
| `loyalty_points` | `loyalty_points_owner` |
| `audit_logs` | `Owners can view own audit logs` + `audit_logs_collaborator_read` |
| `integration_interest` | 3 policies (`insert/select/update_own`) |

Além disso, tabelas com policies `TO public` que usam `store_id IN (stores where user_id = auth.uid())`:
- `journeys_config`, `loyalty_config`, `loyalty_points_v3`, `loyalty_rewards`, `diagnostics_v3`

**Migration:** Drop + recreate cada policy com `TO authenticated`.

---

## Bloco 2 — Console Warning no Planos.tsx

A página `/planos` gera warning:
> "Function components cannot be given refs" — Badge e Footer recebem ref via Radix TabsContent.

**Fix:** Envolver `Footer` com `React.forwardRef` ou reestruturar o JSX para que `Badge` e `Footer` não sejam filhos diretos de componentes Radix que passam ref.

---

## Bloco 3 — Security Audit Report: Views SECURITY DEFINER

O relatório identifica **12 Security Definer Views** que devem ser convertidas para `SECURITY INVOKER`. Isso precisa de uma migration com:
```sql
ALTER VIEW <view_name> SET (security_invoker = on);
```

Para as views existentes no schema. Vou identificar quais são e criar a migration.

---

## Bloco 4 — Ações Manuais (Lembrete)

Estas já foram documentadas e não são possíveis via migration:
1. **Leaked Password Protection** — Dashboard → Authentication → Settings
2. **Extensions** — mover `pg_trgm`/`pgcrypto` para schema `extensions` (opcional)

---

## Resumo de Execução

| Bloco | Tipo | Esforço |
|---|---|---|
| 1. 15+ policies `public` → `authenticated` | Migration SQL | 10 min |
| 2. Console warning Planos.tsx (forwardRef) | Code edit | 3 min |
| 3. Security Definer Views → Invoker | Migration SQL | 5 min |
| 4. Dashboard manual actions | Manual (you) | 2 min |

**Total:** 2 migrations + 1 code edit + ações manuais no Dashboard.

