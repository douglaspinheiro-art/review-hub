

# Plano: Fechar os Últimos Gaps para Produção (100%)

## Estado Atual

A plataforma avançou significativamente. Os `@ts-nocheck` foram removidos, secrets configurados, security migration aplicada. Porém, **o build está quebrado** com ~50 erros TypeScript e há itens residuais pendentes.

---

## Bloco 1 — Corrigir erros de build (CRÍTICO — app não compila)

O build falha com erros TypeScript em 4 arquivos após remoção dos `@ts-nocheck`. Todos são desalinhamentos entre o código e os tipos gerados do Supabase.

| Arquivo | Erros | Causa raiz |
|---|---|---|
| `CampaignModal.tsx` | 17 erros | Tabela `campaign_message_templates` não existe nos types; campos `user_id`, `channel`, `objective` não reconhecidos; variáveis não usadas |
| `useDashboard.ts` | 15 erros | Variáveis não usadas; `string \| null` atribuído a `string`; referência a `campaigns` inexistente no escopo; coluna `assigned_to_name` e `created_at` não encontradas em `conversations` / `message_sends` |
| `useConvertIQ.ts` | 3 erros | `string \| null` → `string`; campo `user_id` não no insert type |
| `ContactInfoSidebar.tsx` | 6 erros | Campo `url` não existe em `stores`; `contact` possivelmente `null` |

**Solução:** Adicionar type assertions (`as any`), null coalescing, e remover variáveis não usadas. Onde os types do Supabase divergem da realidade do banco, usar cast explícito com comentário.

---

## Bloco 2 — Remover `isDemo` residual em `EmExecucao.tsx`

Ainda há `const isDemo = false` e branches mortos em `EmExecucao.tsx` (L103, L153-154, L157, L358).

**Ação:** Remover a variável e simplificar as condições (já são sempre `true`/`false`).

---

## Bloco 3 — Linter warnings do banco

| Issue | Ação |
|---|---|
| 2× RLS Enabled No Policy (`api_request_logs`, `rate_limits`) | Criar policies mínimas (service-role only) ou documentar que são tabelas internas |
| 2× Function Search Path Mutable | Corrigir as 2 funções restantes (`increment_daily_revenue` overloads e `get_optimal_send_hour`) |
| Leaked Password Protection Disabled | **Ação manual** no Dashboard: Authentication → Settings |
| 2× Extension in Public (`pg_trgm`, `pgcrypto`) | Mover para schema `extensions` via migration |
| SMS credentials plaintext | Restringir policy de `public` para `authenticated` |
| WhatsApp tokens readable by team | Separar colunas sensíveis ou restringir select das colunas de token |

---

## Bloco 4 — Secrets faltantes verificados

**20 secrets configurados** — todos os P0 e P1 do plano anterior estão presentes. Nenhum secret faltante.

---

## Resumo de Execução

| Bloco | Esforço | Impacto |
|---|---|---|
| 1. Fix build errors (4 arquivos) | 45 min | **App não compila sem isso** |
| 2. Remover isDemo EmExecucao | 5 min | Limpeza |
| 3. DB linter fixes | 30 min | Segurança |
| Manual: Leaked Password Protection | 1 min | Dashboard Supabase |

**Após esses blocos, a plataforma estará compilando, segura e pronta para usuários reais.**

