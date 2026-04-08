# Observability and Alerts Setup

Checklist mínimo para fechar prontidão operacional.

## 1) Client errors

- Garanta migration aplicada: `client_error_events`.
- Confirme inserção de eventos via `ErrorBoundary` em `src/components/ErrorBoundary.tsx`.
- Consulta recomendada (últimos 15 min):
  - `select count(*) from public.client_error_events where created_at > now() - interval '15 minutes';`

## 2) Edge function failures

- Monitore taxas de erro (`status >= 500`) nas funções:
  - `process-scheduled-messages`
  - `trigger-automations`
  - `conversion-attribution`
  - `unsubscribe-contact`

## 3) Alert thresholds (sugeridos)

- **SEV-1**: erro >= 5% por 5 min em função crítica.
- **SEV-2**: erro >= 2% por 15 min.
- **SEV-3**: aumento de 3x no volume de `client_error_events` (15 min vs baseline).

## 4) Secret validation before deploy

- Execute no ambiente de release:
  - `node scripts/ci/validate-required-env.mjs`
- Falha bloqueia deploy até segredos obrigatórios serem configurados.

## 5) Runbook linkage

- Use em conjunto com `docs/deploy-rollback-runbook.md`.
- Em incidente, congelar deploy, mitigar, e revalidar smoke checks.

## 6) Alertas HTTP 5xx (Supabase + destino)

O dashboard **Reports** e o **Logs Explorer** ajudam a ver erros, mas **não enviam notificação** sozinhos. Para alerta automático de **5xx** (API, PostgREST, Edge Network, Edge Functions), use **Log Drains** e configure regras no provedor de destino.

### Pré-requisito

- Plano **Pro** (ou superior) no projeto cloud: [Log Drains](https://supabase.com/docs/guides/platform/log-drains) ficam em **Project Settings → Log Drains**.
- Projeto de referência (LTV Boost): `https://supabase.com/dashboard/project/ydkglitowqlpizpnnofy/settings/log-drains`

> **Free tier:** não há Log Drain nativo. Alternativas: monitorar o host do app (ex.: Vercel) + health checks externos, ou polling da [Management API de logs](https://supabase.com/docs/reference/api/v1-get-project-logs) com job próprio.

### Fluxo recomendado

1. **Criar o drain** no Supabase (uma das opções):
   - **Datadog**: drain tipo Datadog → API key + site → [criar Log Monitor](https://docs.datadoghq.com/monitors/types/log/) com filtro em logs do serviço Supabase onde `status` / código HTTP **≥ 500** (ajuste o atributo exato após ver 1–2 eventos reais no Datadog).
   - **Grafana Loki + Alertmanager** ou **OTLP** (Grafana Cloud / Honeycomb / etc.): drain OTLP/Loki → regra de alerta no stack de destino.
   - **HTTP genérico**: POST em endpoint seu (n8n, Cloudflare Worker, Edge Function) que filtra batch JSON e chama **Slack / PagerDuty / Teams**. O payload chega em **lotes**; não dá para apontar o drain direto para a URL do Slack (formato incompatível).

2. **Escopo do alerta (sugestão)**

   - **SEV-1 (página):** mais de **N** eventos com HTTP **5xx** em **5 minutos** (N tunável: ex. 10 em produção, menor em staging).
   - **Edge Functions:** além do drain, use o report **Edge Functions** e logs `function_edge_logs` / invocations no destino com regra equivalente (falha/`status` 5xx).

3. **Destinos comuns**

   | Destino | Uso |
   |---------|-----|
   | Slack | Via Datadog notify, Alertmanager, ou webhook próprio após HTTP drain |
   | PagerDuty / Opsgenie | Integração nativa no Datadog/Grafana ou webhook |
   | E-mail | Mesmo padrão (provedor → regra → canal e-mail) |

4. **Custo e operação**

   - Ver [Manage Log Drain usage](https://supabase.com/docs/guides/platform/manage-your-usage/log-drains) (cobrança por drain + volume).
   - Evite drain HTTP apontando para Edge Function que gere **muito** log extra (pode amplificar volume); prefira Datadog/Loki para filtrar antes de notificar.

### Validação após configurar

- Gerar um **5xx controlado** (ex.: rota de health que retorna 500 em staging) e confirmar **1 notificação** no destino.
- Confirmar **silêncio** quando não houver 5xx (evitar flapping: janela mínima 5 min).
