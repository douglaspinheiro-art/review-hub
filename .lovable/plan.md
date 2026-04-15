

# Plano: Produção 100% — Últimos Gaps

## Estado Atual
- **Build:** Compilando com sucesso (zero erros TS)
- **Secrets:** 20 secrets configurados (todos P0/P1 presentes)
- **Linter:** 7 issues (2 INFO já ignorados, 5 WARN pendentes)
- **Security scan:** 3 findings (1 ERROR crítico, 1 ERROR de auditoria, 1 WARN)

---

## Bloco 1 — Security Fixes (CRÍTICO)

### 1a. SMS credentials exposure (ERROR)
A tabela `sms_connections` tem policy `FOR ALL USING (auth.uid() = user_id)` com role `public`. Se alguma row tiver `user_id = NULL`, as colunas `api_key` e `api_secret` ficam expostas a requests não autenticados.

**Migration:**
- Drop policy `sms_connections_own`, recriar com role `authenticated` em vez de `public`

### 1b. Team members privilege escalation (ERROR)
A policy `team_members_owner_manage` concede ALL ao owner, mas operadores com write access podem potencialmente escalar privilégios.

**Migration:**
- Adicionar policies explícitas de INSERT/UPDATE/DELETE em `team_members` restringindo escrita ao owner (`store_id` owner check)
- Garantir que `membros_loja` não permite inserts não autorizados

### 1c. `api_request_logs` sem policy (INFO — já ignorado)
Tabela interna, service-role only. RLS bloqueia tudo por padrão — correto. Nenhuma ação.

---

## Bloco 2 — Linter Warnings

### 2a. Function Search Path Mutable (2 funções)
As 2 overloads de `increment_daily_revenue` (2 args e 3 args) não têm `search_path` definido.

**Migration:**
- `ALTER FUNCTION increment_daily_revenue(date, numeric) SET search_path = public;`
- `ALTER FUNCTION increment_daily_revenue(uuid, date, numeric) SET search_path = public;`

### 2b. Extensions in Public (`pg_trgm`, `pgcrypto`)
Já ignorado no scan. Mover extensões requer ação manual no Dashboard (não é possível via migration). Documentado e aceito.

### 2c. Leaked Password Protection Disabled
**Ação manual:** Dashboard Supabase → Authentication → Settings → Habilitar "Leaked password protection". Não é possível via migration.

---

## Bloco 3 — Policies com role `public` → `authenticated`

Várias tabelas usam `FOR ALL ... TO public` em vez de `TO authenticated`. Isso é um padrão inseguro (permite match se `user_id` for NULL). Tabelas afetadas:

| Tabela | Policy atual |
|---|---|
| `sms_connections` | `sms_connections_own` TO public |
| `ai_generated_coupons` | `ai_coupons_own` TO public |
| `channels` | `canais_own` TO public |
| `communications_sent` | `comunicacoes_enviadas_own` TO public |
| `executions` | `execucoes_own` TO public |
| `loyalty_points` | `loyalty_points_owner` TO public |
| `benchmark_reports` | `benchmark_reports_own` TO public |
| `ai_agent_config` | `agente_ia_own` TO public |

**Migration:** Recriar essas policies com `TO authenticated`.

---

## Resumo de Execução

| Bloco | Tipo | Esforço |
|---|---|---|
| 1a. Fix SMS credentials exposure | Migration SQL | 5 min |
| 1b. Team members escalation guard | Migration SQL | 10 min |
| 2a. search_path nas 2 funções | Migration SQL | 2 min |
| 2b. Extensions in public | Manual (Dashboard) | — |
| 2c. Leaked password protection | Manual (Dashboard) | 1 min |
| 3. Policies public → authenticated | Migration SQL | 15 min |

**Total:** 1 migration com todos os fixes SQL + 2 ações manuais no Dashboard.

### Ações manuais (você precisa fazer):
1. **Leaked Password Protection:** Dashboard → Authentication → Settings → Enable
2. **Extensions:** Opcionalmente mover `pg_trgm`/`pgcrypto` para schema `extensions` no Dashboard

### Após este plano:
- Zero security findings
- Zero linter warnings (exceto extensions — aceito)
- Build compilando
- Secrets completos
- **Plataforma pronta para usuários reais**

