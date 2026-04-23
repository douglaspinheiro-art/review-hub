

# Plano: Reforço de Confiança e Precisão nos Dados do Dashboard

Auditoria identificou **15 páginas** com qualidade variável. O plano abaixo prioriza ganhos por impacto e esforço, tratando lacunas comuns (selos de proveniência, glossário, fontes explícitas) e fechando o ponto crítico: `/dashboard/relatorios`.

## Princípio orientador

Toda métrica exibida precisa responder 3 perguntas em ≤1 clique:
1. **De onde vem?** (RPC, GA4, webhook, estimativa)
2. **Quando foi atualizada?** (timestamp/freshness)
3. **É real, derivada ou estimada?** (selo visual)

## Fases

### Fase 1 — Infraestrutura de Confiança (base reusável)
Criar componentes compartilhados que serão usados em todas as páginas:

1. **`<DataSourceBadge>`** — selo compacto com 3 variantes: `real` (verde), `derivado` (azul), `estimado` (âmbar). Inclui tooltip com fonte (ex: "RPC `get_dashboard_snapshot` · atualizado há 2min").
2. **`<MetricGlossary>`** — popover reutilizável com definições curtas (influenciada vs atribuída, last-touch vs assistida, amostra vs universo).
3. **`<FreshnessIndicator>`** — exibe "atualizado há Xmin" + ícone de stale quando >SLA.

Local: `src/components/dashboard/trust/`

### Fase 2 — Quick Wins (selos e badges nas páginas Parciais)
Aplicar componentes da Fase 1 sem refazer lógica:

| Página | Ação |
|--------|------|
| `/dashboard` | `<DataSourceBadge>` por KPI card + timestamp por bloco (Revenue OS, retention, propensity) |
| `/dashboard/analytics` | `<MetricGlossary>` no header com "influenciada vs atribuída" |
| `/dashboard/atribuicao` | Badge fixo "Modelo: last-touch real · linear/first-touch simulados" |
| `/dashboard/funil` | Separador visual "Medido (GA4)" vs "Heurístico" nos blocos |
| `/dashboard/rfm` | Badge "Amostra (X% de cobertura)" nos gráficos |
| `/dashboard/campanhas` | Indicador permanente "Base carregada: X de Y campanhas" |
| `/dashboard/em-execucao` | Renomear KPI para "Receita atribuída estimada" + tooltip |
| `/dashboard/operacoes` | Tooltip com fórmula e pesos do score de integridade |
| `/dashboard/canais` | Rodapé do card: "Fonte: `orders_v3` · janela 90d" |
| `/dashboard/carrinho-abandonado` | Card "Cobertura de captura" (capturados vs estimados via funnel) |
| `/dashboard/reviews` | Status badge por plataforma (Google/Mercado Livre): online/offline/atrasado |
| `/dashboard/benchmark-score` | Label "Histórico real" vs "Histórico ilustrativo" no gráfico |
| `/dashboard/contatos` | Header com "Última sincronização: Xmin atrás" |

### Fase 3 — Forecast: número oficial único
Hoje convivem cálculo local (`useForecastProjection`) e snapshot servidor (`useForecastSnapshot`). Decisão:

- **Número oficial:** snapshot do servidor (quando existe e <24h)
- **Fallback:** cálculo local **com badge `derivado`**
- Mover comparativo de metodologias para aba secundária "Metodologia"

### Fase 4 — Fechar `/dashboard/relatorios` (única Fraca)
Página tem stubs de heatmap e cohort. Implementar:

1. **Heatmap dia/hora** de conversão — RPC nova `get_conversion_heatmap_v1(p_store_id, p_days)` agregando `messages` + `attribution_events` por `extract(dow)` + `extract(hour)`.
2. **Cohort de retenção mensal** — usar tabela existente `customer_cohorts` (já populada por `data-pipeline-cron`).
3. **Remover placeholders `—`** de KPIs do topo: ligar aos mesmos hooks usados em `/dashboard`.
4. Exportação PDF (já existe scaffold) — validar que respeita os novos selos.

## Detalhes técnicos

**Novos arquivos:**
- `src/components/dashboard/trust/DataSourceBadge.tsx`
- `src/components/dashboard/trust/MetricGlossary.tsx`
- `src/components/dashboard/trust/FreshnessIndicator.tsx`
- `src/lib/data-provenance.ts` — tipos `DataSource = 'real' | 'derived' | 'estimated'` + helpers
- `supabase/migrations/<timestamp>_conversion_heatmap_rpc.sql` — RPC do heatmap
- `supabase/migrations/<timestamp>_retention_cohort_rpc.sql` — RPC de coorte (lê `customer_cohorts`)

**Arquivos editados (estimativa):** ~20 (1-2 linhas por página na Fase 2 + refactor maior em Forecast e Relatórios).

**Sem mudanças:** páginas marcadas como Corretas (analytics, contatos, operacoes, carrinho-abandonado) recebem apenas selos cosméticos (Fase 2).

## Ordem de execução proposta

```text
Fase 1  (infra)       →  ~20 min  →  destrava todo o resto
Fase 2  (selos)       →  ~40 min  →  ganho percebido imediato em 13 páginas
Fase 4  (relatorios)  →  ~30 min  →  fecha única página Fraca
Fase 3  (forecast)    →  ~15 min  →  resolve ambiguidade metodológica
```

Total estimado: ~1h45 de trabalho de código.

## Fora de escopo (decisões de produto futuras)

- **ConvertIQ — ingestão automática de topo/médio funil por plataforma:** requer conectores novos (Shopify Analytics, VTEX events). Tratar em projeto separado.
- **Reviews — sync Google "em breve":** depende de aprovação Google Business Profile API, fora do escopo técnico imediato.

## Sugestão

Posso executar **Fases 1 + 2 + 4** de uma vez (entrega o maior ganho de confiança e fecha a única página Fraca). Fase 3 fica como segunda rodada — envolve decisão de UX sobre qual metodologia exibir como "oficial".

Aprova fazer 1 + 2 + 4?

