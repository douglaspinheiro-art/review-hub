# Plano: Diagnóstico Continuado (Weekly Re-Analysis)

## Objetivo
Transformar `/resultado` (hoje one-shot) em **dashboard semanal evolutivo**: toda segunda 06:00 BRT o sistema reanalisa o funil GA4 de cada loja conectada, gera um novo `diagnostics_v3` com tag `weekly`, calcula o delta vs semana anterior (CHS, CVR, perda mensal, gargalo) e mostra ao lojista o que mudou + impacto das ações aplicadas. Notificação no sino do dashboard.

**Escopo aprovado:** todos os usuários com GA4 conectado (trial, starter, growth, scale).

## Por que é viável agora
- `diagnostics_v3` já tem `(user_id, created_at)` indexado, RLS, histórico
- `funil_diario` já populado pelo cron `sync-funil-ga4`
- `gerar-diagnostico` já tem idempotência 5min, rate limit, fallback
- `Resultado.tsx` já lê o último diagnóstico via polling
- `CRON_SECRET` já configurado

Tudo é aditivo. Zero refactor de schema, zero novo provider de IA.

---

## Mudanças no DB

**Migração nova** (timestamp na hora da execução):
```sql
ALTER TABLE public.diagnostics_v3
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('manual','weekly','onboarding')),
  ADD COLUMN IF NOT EXISTS previous_diagnostic_id uuid
    REFERENCES public.diagnostics_v3(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS week_over_week jsonb;

CREATE INDEX IF NOT EXISTS idx_diagnostics_v3_user_trigger_created
  ON public.diagnostics_v3 (user_id, trigger_source, created_at DESC);
```

`week_over_week` shape:
```json
{
  "chs_delta": 5,
  "cvr_delta_pp": 0.19,
  "perda_delta_brl": -9200,
  "gargalo_anterior": "Checkout → Pedido",
  "gargalo_atual": "Carrinho → Checkout",
  "gargalo_changed": true,
  "applied_recommendation": "Mostrar frete grátis a partir de R$ 199",
  "previous_created_at": "2026-04-17T09:00:00Z"
}
```

RLS herda das policies existentes (`diagnostics_v3_own`).

---

## Edge Functions

### Nova: `supabase/functions/weekly-diagnostic-cron/index.ts`
- Auth: header `Authorization: Bearer ${CRON_SECRET}` (sem JWT do usuário)
- `verify_jwt = false` no `config.toml`
- Lista lojas elegíveis: `stores` com `ga4_property_id IS NOT NULL` e `funil_diario` ingerido nos últimos 3 dias
- Para cada loja:
  1. Agrega funil dos últimos 7 dias do `funil_diario` (sessions, view_item, add_to_cart, begin_checkout, purchases, purchase_revenue)
  2. Skip se já existe `diagnostics_v3` com `trigger_source = 'weekly'` nos últimos 5 dias OU se há diag manual nas últimas 24h
  3. Chama `gerar-diagnostico` internamente com `x-internal-secret` + body com `trigger_source: 'weekly'`, `user_id`, `loja_id`, métricas agregadas
  4. Insere notificação tipo `weekly_diagnostic_ready`
  5. Loga em `audit_logs` com `action = 'weekly_diagnostic_run'`
- Processa em batches de 20 lojas (concorrência limitada para não estourar Anthropic rate limit)
- Retorna `{ processed, skipped, errors }`

### Atualizada: `supabase/functions/gerar-diagnostico/index.ts`
- Aceitar header opcional `x-internal-secret` (compara com `WEEKLY_DIAGNOSTIC_SECRET`); quando válido, pula JWT e usa `user_id`/`loja_id` do body
- Aceitar campo `trigger_source` no body (default `'manual'`, valores `'manual'|'weekly'|'onboarding'`)
- Após inserir o novo diagnóstico:
  - Buscar o `previous_diagnostic_id` (último `diagnostics_v3` para mesma `(user_id, store_id)` antes do atual)
  - Calcular `week_over_week` comparando CHS, CVR, perda, gargalo principal
  - Heurística de "ação aplicada": se o gargalo do anterior melhorou ≥ 15%, marcar `applied_recommendation = recomendacoes_ux[0].titulo` do anterior
  - Atualizar a row com `trigger_source`, `previous_diagnostic_id`, `week_over_week`
- **Não muda** lógica de IA, prompt, fallback, rate limit existente

### Cron (pg_cron, aplicado 1x via SQL Editor pelo user — não via migration porque tem secret)
```sql
SELECT cron.schedule(
  'weekly-diagnostic-monday-9utc',
  '0 9 * * 1',
  $$SELECT net.http_post(
    url:='https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/weekly-diagnostic-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <CRON_SECRET>"}'::jsonb,
    body:='{}'::jsonb
  );$$
);
```

---

## Mudanças no front

### Novo componente: `src/components/resultado/WeeklyEvolutionCard.tsx`
Renderiza o bloco "📈 Evolução semanal" acima do CHS Gauge, com:
- CHS antes → depois + delta (▲/▼ colorido)
- CVR pp delta
- Perda mensal R$ delta
- Se `gargalo_changed`: "Antes seu gargalo era X, agora é Y"
- Se `applied_recommendation`: card verde "💡 Você implementou: [titulo]. Resultado: +Xpp = R$ Y recuperados"

### Novo hook: `src/hooks/useWeeklyDiagnosticDelta.ts`
Retorna `{ hasDelta: boolean, weekOverWeek, previousCreatedAt }`. Lê do `diagnostic_json.week_over_week` do diag atual (já vem no fetch existente, sem nova query).

### Editado: `src/pages/Resultado.tsx`
Adicionar `<WeeklyEvolutionCard />` entre header e CHSGauge, renderizado **só quando** `diagnostic.week_over_week` existe e tem `previous_created_at`. Sem mexer no resto do layout/paywall.

### Editado: `src/components/dashboard/NotificationBell.tsx`
Handler para `notification.type === 'weekly_diagnostic_ready'`:
- Ícone 📊, texto "Seu diagnóstico semanal está pronto"
- Click → `navigate('/resultado')` + marca como lida

---

## Telemetria (não bloqueia)
- `weekly_diagnostic_generated` no edge (server-side via `funnel_telemetry_events`)
- `weekly_diagnostic_viewed` no front quando `<WeeklyEvolutionCard />` renderizar
- `weekly_diagnostic_notification_clicked` no sino

---

## Edge cases tratados

| Caso | Comportamento |
|---|---|
| Loja sem GA4 conectado | Skip silencioso |
| GA4 desatualizado (>3 dias) | Skip + log em audit |
| Primeiro diagnóstico semanal (sem anterior) | `week_over_week = null` → front esconde o bloco |
| Diag manual nas últimas 24h | Skip (manual ganha prioridade) |
| `funil_diario` zerado na semana | Skip + flag em audit |
| Anthropic rate limit | Batch de 20 + retry built-in da edge existente |
| Privacidade | RLS herdado; cron usa service role mas filtra por loja owner |
| Cron desligar | `SELECT cron.unschedule('weekly-diagnostic-monday-9utc')` — produto atual continua intacto |

---

## Arquivos

**Novos:**
- `supabase/migrations/<timestamp>_diagnostics_weekly_trigger.sql`
- `supabase/functions/weekly-diagnostic-cron/index.ts`
- `src/hooks/useWeeklyDiagnosticDelta.ts`
- `src/components/resultado/WeeklyEvolutionCard.tsx`

**Editados:**
- `supabase/functions/gerar-diagnostico/index.ts` (aceitar `x-internal-secret`, `trigger_source`, popular `week_over_week`)
- `supabase/config.toml` (`verify_jwt = false` para `weekly-diagnostic-cron`)
- `src/pages/Resultado.tsx` (renderizar `<WeeklyEvolutionCard />`)
- `src/components/dashboard/NotificationBell.tsx` (novo tipo)

**Secret novo a configurar antes do deploy:**
- `WEEKLY_DIAGNOSTIC_SECRET` (callback interno cron → gerar-diagnostico)

`CRON_SECRET` já existe.

---

## Não-objetivos (fora desta entrega)
- Tracking explícito de "qual recomendação o lojista aplicou" — usamos heurística por gargalo
- Email semanal (deixo para 2ª iteração reusando `enviar-pulse-semanal`)
- Gráfico de evolução multi-semana (4 semanas) — fica para v2
- Mudar paywall do `/resultado` (continua igual ao que está em produção)
- Mexer em prompt/lógica de IA do `gerar-diagnostico`

---

## Verificação
- `npx tsc --noEmit`
- `npm run test`
- `npm run validate:env:edge` (vai apontar `WEEKLY_DIAGNOSTIC_SECRET`)
- Teste manual via curl: `POST /functions/v1/weekly-diagnostic-cron` com `CRON_SECRET` → verificar `diagnostics_v3` novo com `trigger_source = 'weekly'` + `week_over_week` populado
- Reproduzir cenário "primeiro semanal" (sem `previous_diagnostic_id`) e "segundo semanal" (com delta visível em `/resultado`)

## Risco
**Médio-baixo.** Tudo aditivo (colunas nullable + edge function nova + componente novo). Refactor real só em `gerar-diagnostico` para aceitar secret interno — segue padrão idêntico ao `dispatch-newsletter` que já está em produção. Cron desligável a qualquer momento sem afetar nada.
