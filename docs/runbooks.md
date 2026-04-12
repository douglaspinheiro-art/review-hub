# Runbooks operacionais (LTV Boost)

Procedimentos curtos para incidentes comuns. Ajustar URLs e segredos ao ambiente (Dashboard Supabase, Meta, GA4).

## Fila de webhooks / `process-scheduled-messages` “presa”

1. **Supabase → Table Editor → `webhook_queue`**: filtrar `status in ('pending','processing')`, ordenar por `created_at`. Itens muito antigos em `processing` podem ser reset manualmente para `pending` se não houver worker ativo (avaliar duplicidade de processamento).
2. **Logs da Edge** `process-scheduled-messages`: verificar JSON de resposta com `caps`, `breakdown`, `request_id` e `errors`.
3. **Dead letter**: linhas em `dead_letter` — inspecionar `payload` / último erro; corrigir origem ou re-enfileirar após fix.
4. **Cron / invocação**: confirmar que o agendamento continua a chamar a função com `Authorization: Bearer <CRON_SECRET>` quando aplicável.

## Meta WhatsApp (Business) — erros / número restrito

1. **Edge `meta-whatsapp-send` / webhook**: logs com classificação de erro Meta; repetir envio só após corrigir causa (template, opt-in, 24h, etc.).
2. **Business Manager**: verificar qualidade do número, limites de tier e políticas de modelo (Marketing vs Utility).
3. **Credenciais**: `META_APP_SECRET`, tokens de sistema no Supabase Secrets; reassociar `whatsapp_connections` se a conexão foi revogada.
4. **Documentação interna**: `docs/meta-whatsapp-cloud-setup.md`.

## GA4 / funil sem dados

1. **Loja (`stores`)**: confirmar `ga4_property_id`, refresh token / credenciais conforme integração em uso.
2. **Edge `buscar-ga4` / `sync-funil-ga4`**: testar invocação manual; rever erros de OAuth ou property ID.
3. **UI ConvertIQ / funil**: fallback para dados manuais ou mock conforme produto; informar o cliente que a série histórica depende do pipeline diário (`sync-funil-ga4` + cron).

## `api_request_logs` / retenção distribuída

A tabela **`api_request_logs`** alimenta o rate limit distribuído (`checkDistributedRateLimit` em `supabase/functions/_shared/edge-utils.ts`). **Não** há no repositório integração com Redis/Upstash nem partição nativa da tabela: a estratégia prevista é **índice** (`rate_key`, `created_at`) + **prune periódico**.

### Prune manual

```sql
select public.prune_api_request_logs(7);  -- apaga mais antigas que 7 dias; ajustar o parâmetro
```

Migração: `supabase/migrations/20260418120000_prune_api_request_logs.sql`.

### Exemplo `pg_cron` (Supabase com extensão activa)

Executar como utilizador com permissão (ex.: cron job com `service_role` via HTTP scheduled function que corre SQL, ou `pg_cron` no projecto):

```sql
-- Exemplo ilustrativo — validar nome do job e permissões no vosso projecto
select cron.schedule(
  'prune-api-request-logs-daily',
  '5 4 * * *',  -- 04:05 UTC diariamente
  $$select public.prune_api_request_logs(7)$$
);
```

Alternativa: job externo (GitHub Actions, Vercel cron, etc.) com `supabase db query --linked` ou API SQL.

## Diagnóstico IA — limite diário

1. Variável **`GERAR_DIAGNOSTICO_MAX_PER_STORE_PER_DAY`** (e corpo com `loja_id` válido) controla chamadas por loja; respostas 429 incluem retry-after quando rate limit distribuído aplicável.
2. **Outras funções de IA** (`ai-reply-suggest`, `ai-copy`, etc.) não partilham ainda um orçamento global por loja nem fila assíncrona única — tratar como roadmap; ver também `docs/performance-queries.md`.

## Observabilidade (roadmap)

- **Front:** não há `@sentry/react` nem OpenTelemetry ligados no bundle; activação futura via `VITE_SENTRY_DSN` / provider manual.
- **Edges:** várias funções devolvem `request_id` no JSON (`process-scheduled-messages`, `flow-engine`, `webhook-cart`, …). Padronizar o mesmo campo + `console.log` estruturado (`JSON.stringify({ request_id, ... })`) nas restantes é trabalho incremental.
