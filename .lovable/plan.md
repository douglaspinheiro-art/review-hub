

## Próximos passos — Operacionalizar e validar o que foi construído

Tudo que foi planejado (Fases 0 → 3) está no código. O que falta agora é **ligar, agendar e medir**. Sem esses passos, o trabalho não gera valor em produção.

## O que precisa acontecer (em ordem)

### 1. Deploy das 3 novas Edge Functions
Fazer deploy das funções criadas na Fase 2/3 — sem isto, ficam inertes no repositório:
- `proactive-calendar` — gera oportunidades sazonais
- `reconcile-ga4-attribution` — cruza GA4 com campanhas via UTM
- `revenue-autopilot` — dispara prescrições quando meta atrasa

### 2. Agendar os crons (pg_cron)
Criar 3 schedules no Supabase usando `CRON_SECRET` para autenticação:

| Função | Frequência | Cron |
|--------|------------|------|
| `proactive-calendar` | Mensal — dia 1 às 09h | `0 9 1 * *` |
| `reconcile-ga4-attribution` | Diário — 05h | `0 5 * * *` |
| `revenue-autopilot` | Semanal — segunda 08h | `0 8 * * 1` |

Cada job faz `net.http_post` com header `Authorization: Bearer <CRON_SECRET>`.

### 3. Validação manual em produção (smoke tests)

**Fase 1.1 — UTM injection**
- Criar campanha-teste com link da loja no corpo
- Disparar para 1 contato real
- Verificar em `scheduled_messages.metadata` que a URL recebeu `?utm_source=ltvboost&utm_medium=whatsapp&utm_campaign=...`
- Confirmar no GA4 da loja: sessão com `utm_source=ltvboost`

**Fase 1.2 — Loop IA**
- Gerar diagnóstico via ConvertIQ
- Inspecionar payload enviado a `gerar-diagnostico` — deve incluir `historico_prescricoes` (top 10) + agregado

**Fase 1.3 — ISL**
- Rodar `select calculate_isl('<store_id>');` no SQL Editor
- Confirmar `stores.isl_score` populado e card no Dashboard renderizando sparkline
- Em loja nova: confirmar mensagem "Coletando dados — ISL em X dias"

**Fases 2 e 3 — Crons**
- Após primeiro tick: confirmar inserts em `opportunities` (proactive-calendar) e updates em `campaigns.ga4_attributed_revenue` (reconcile)

### 4. Cron diário para `calculate_isl`
Hoje o ISL só atualiza quando a UI chama. Adicionar 4º cron:
- `0 4 * * *` — itera por todas as `stores` ativas e roda `calculate_isl` para popular histórico/sparkline automaticamente

### 5. Telemetria — primeiro relatório de baseline
Após 7 dias rodando, consultar `funnel_telemetry_events` para extrair:
- `prescription_converted_to_campaign` rate
- `campaign_attributed_revenue_snapshot` médio

Esses 2 números são a baseline contra a qual mediremos o impacto da Fase 1 daqui a 30 dias.

### 6. Compliance LGPD (bloqueante para Fase 3.1)
A RPC `get_segment_benchmark` agrega dados anônimos cross-tenant. Antes de expor na UI:
- Atualizar Termos de Uso explicitando agregação anônima
- Adicionar opt-out no `Configuracoes.tsx` (flag `stores.benchmark_opt_out`)

### 7. Orçamento Anthropic
Fase 1.2 aumenta payload do diagnóstico em ~2-3x. Monitorar consumo na primeira semana e definir alerta de gasto.

## Sugestão de execução

Posso fazer agora **passos 1, 2 e 4** (deploy + agendar 4 crons) numa única tacada — é tudo trabalho de infra que não depende de validação humana. Os passos 3, 5, 6 e 7 ficam para você executar/decidir, pois envolvem testes manuais, decisões de produto e jurídico.

Aprova fazer 1+2+4 agora?

