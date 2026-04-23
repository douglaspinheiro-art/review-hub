

# Plano: Diagnóstico Premium na `/resultado`

Objetivo: elevar a `/resultado` de "tela bonita com fallback genérico" para um diagnóstico transparente, específico e acionável — usando 100% do que a edge já retorna e enriquecendo o payload com sinais reais da loja.

## O que muda (por arquivo)

### 1. Payload enriquecido — `src/pages/Analisando.tsx`
Antes de invocar `gerar-diagnostico`, agregar sinais adicionais por `store_id`:
- `canais_conectados` — `select tipo from channels where ativo`
- `visitantes_mobile/desktop` + `pedidos_mobile/desktop` — última linha de `funnel_metrics_v3`
- `produtos_estoque_critico` — `count from catalog_snapshot where stock_qty < 5`
- `produtos_avaliacao_baixa` — RPC ou contagem em `reviews` (rating < 3)
- `historico_prescricoes` — últimas 10 `executions` com `prescricao_id`, `conversao_antes/depois`, `receita_gerada` para a edge evitar repetir ações que falharam
- `proximos_eventos_sazonais` — próximos 3 eventos de `commercial_calendar_br` em janela de 30 dias
- `data_quality` — última `data_quality_snapshots` (utm_fill_rate, ga4_diff) → marca confiança

Tudo opcional: se a query falhar, cai no payload atual (compat).

### 2. Edge `gerar-diagnostico` — `supabase/functions/gerar-diagnostico/index.ts`
- Aceitar os campos novos no schema Zod (todos opcionais)
- Injetar no `system`/`user` prompt da Anthropic apenas os que vieram populados
- Retornar 2 campos novos na resposta:
  - `meta.fallback_mode: boolean` (true quando IA falhou e usou fallback local)
  - `meta.confidence: { real_signals_pct, data_window_days, last_sync_at }`
- Persistir `meta` dentro de `diagnostic_json.meta` em `diagnostics_v3` (não muda schema)

### 3. `/resultado` — `src/pages/Resultado.tsx`
- **Parse seguro do sessionStorage** com `try/catch` e validador (zod ou guard manual). Se inválido, refetch direto de `diagnostics_v3` por `user_id`/`store_id` mais recente.
- **Selo de confiança no topo** (usa `DataSourceBadge` + `FreshnessIndicator` já existentes):
  - `real` quando `meta.real_signals_pct >= 70`
  - `derived` entre 30 e 70
  - `estimated` abaixo de 30
  - Se `meta.fallback_mode === true` → badge âmbar "Diagnóstico automático (modo fallback)"
- **Janela de dados** + "Última sincronização há Xmin" abaixo do título
- **Renderizar campos hoje sub-aproveitados** já presentes na resposta da IA:
  - `chs_breakdown` — gauge ou barra empilhada por dimensão (UX, oferta, retenção, mídia)
  - `oportunidades` — lista compacta abaixo dos `problemas`, com `impacto_reais` + CTA "Criar prescrição"
  - `forecast_30d` — card com cenário base vs cenário com prescrições aplicadas

### 4. Loop de aprendizado — `supabase/functions/gerar-diagnostico/index.ts`
- Quando `historico_prescricoes` chega populado, instruir o prompt explicitamente: "Não recomende ações já executadas com `lift_pp <= 0`. Priorize variações."
- Sem nova tabela; lift é calculado de `conversao_depois - conversao_antes` que já existe em `executions`.

### 5. Validação cruzada
- Adicionar teste em `src/pages/__tests__/Diagnostico.test.tsx` (ou criar `Resultado.test.tsx`) para parse seguro do sessionStorage com payload corrompido.

## O que NÃO muda
- Schema do banco (sem migração)
- Layout principal da `/resultado` — só ganha 3 blocos novos (selo, oportunidades, forecast) acima do CTA
- Fluxo `Analisando → Resultado` — mesma navegação, mesmos timers

## Notas técnicas
- Selos reusam `DataSourceBadge`, `FreshnessIndicator`, `MetricGlossary` já criados nas Ondas anteriores → consistência visual com o resto do dashboard
- Toda query nova em `Analisando.tsx` roda em `Promise.allSettled` para não bloquear o diagnóstico se uma falhar
- Edge mantém compatibilidade: se nenhum campo novo chegar, comportamento idêntico ao atual

## Fora deste escopo
- Modelo de atribuição decay/multi-touch (já marcado como projeto separado)
- Quality rating do WhatsApp via Meta Graph (tarefa separada já listada)
- Dashboard novo de "lift histórico de prescrições" — usar dado existente apenas no prompt; UI dedicada fica para próxima rodada se houver demanda

