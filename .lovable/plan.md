

# Métricas em Falta — Análise de Cobertura vs Funcionalidades

Cruzando o que a plataforma promete (LTV Boost + ConvertIQ + WhatsApp + Fidelidade + Atribuição) com o que realmente é exibido hoje, identifiquei **6 famílias de métricas críticas ausentes ou subexploradas**.

## Critério usado
- ✅ **Coberta** — métrica calculada e exibida com selo de proveniência
- ⚠️ **Parcial** — dado existe no banco mas não é exibido / sem selo
- ❌ **Falta** — funcionalidade existe mas a métrica que prova seu valor não está em lugar nenhum

## Lacunas identificadas

### 1. LTV e Retenção real (núcleo do produto) ❌
A plataforma se chama **LTV Boost** mas **não exibe LTV** em nenhuma página de forma direta.
- **LTV médio por cliente** (12m / 24m / lifetime) — temos `customers_v3.rfm_monetary` + `last_purchase_at`, falta agregação
- **LTV por coorte de aquisição** — `customer_cohorts` já existe (D30 retention) mas só é usado em `/relatorios`. Faltam D60/D90/D180.
- **CAC payback** — sem CAC declarado pelo lojista, não dá. Adicionar input em Configurações.
- **Repeat Purchase Rate (RPR)** — % de clientes com 2+ pedidos. Cálculo trivial sobre `orders_v3`.
- **Tempo médio entre compras** — base para o "Lembrete de Reposição" do PLAYBOOK.

**Onde exibir:** novo bloco "LTV & Retenção" em `/dashboard` + aba dedicada em `/relatorios`.

### 2. Mensageria — qualidade e custo ⚠️
Hoje exibimos enviados/entregues/lidos. Falta a camada de **eficiência operacional**:
- **Custo por mensagem entregue** — `campaigns.custo_total_envio` existe mas só aparece em forma agregada
- **Custo por conversão atribuída** — `custo_total / ga4_attributed_revenue` → ROAS real
- **Taxa de opt-out por campanha** — temos `unsubscribed_at` em `customers_v3`, falta correlacionar com campanhas
- **Taxa de bounce/complaint email** — colunas `email_hard_bounce_at` e `email_complaint_at` já existem, **não são exibidas**
- **Health score do número WhatsApp** — Meta retorna quality rating, não está sendo consumido

**Onde exibir:** card "Saúde de envio" em `/canais` + coluna nova em `/campanhas`.

### 3. Atribuição assistida e multi-touch ⚠️
`/atribuicao` mostra last-touch. Faltam:
- **Conversões assistidas** — coluna `executions.conversoes_assistidas` existe e está zerada/sem leitura
- **Time-to-conversion** — gap entre `attribution_events.created_at` e `order_date`
- **Decay model** — atribuição com peso decrescente no tempo (já no roadmap, badge "estimado" basta)

**Onde exibir:** segunda aba em `/atribuicao` ("Modelos avançados").

### 4. Fidelidade e Pontos ❌
Página `/dashboard/fidelidade` existe no roadmap mas **não tem KPIs operacionais**:
- Clientes ativos no programa
- Pontos em circulação vs pontos resgatados
- Taxa de resgate
- Receita incremental atribuída ao programa
- Distribuição por tier (Bronze/Prata/Ouro/Diamante)

**Onde exibir:** header de `/dashboard/fidelidade` + widget em `/dashboard`.

### 5. Inbox e SLA de atendimento ⚠️
`conversations.sla_due_at` e `priority` existem (mem `conversation-management`), mas a UI não mostra:
- **Tempo médio de primeira resposta** (TMR)
- **% dentro do SLA**
- **Volume por agente** (round-robin já existe em `inbox_routing_settings`)
- **Taxa de resolução em primeira interação**

**Onde exibir:** header de `/dashboard/inbox` com 4 KPIs compactos.

### 6. Saúde de dados e integrações ⚠️
`data_quality_snapshots` é populada diariamente mas só exposta parcialmente em `/operacoes`:
- **UTM fill rate** — coluna existe, não é mostrada (impacta toda atribuição)
- **GA4 vs Orders diff %** — coluna existe, sinaliza divergência crítica
- **Phone fill rate** — base para % de clientes alcançáveis via WhatsApp
- **Duplicate order rate** — qualidade do webhook

**Onde exibir:** expandir card "Score de integridade" em `/operacoes` com breakdown desses 4 indicadores.

## Resumo prioritário

| Prioridade | Métrica | Impacto | Esforço |
|------------|---------|---------|---------|
| 🔴 P0 | LTV médio + LTV por coorte | Identidade do produto | M |
| 🔴 P0 | Repeat Purchase Rate | Tese central de retenção | S |
| 🔴 P0 | Bounce/complaint email visível | Risco de blacklist | S |
| 🟡 P1 | Custo por conversão atribuída (ROAS) | Decisão de investimento | S |
| 🟡 P1 | KPIs de Fidelidade | Página existe vazia | M |
| 🟡 P1 | TMR + SLA do Inbox | Operação diária | S |
| 🟢 P2 | Time-to-conversion | Sofisticação atribuição | S |
| 🟢 P2 | UTM fill / GA4 diff em destaque | Qualidade upstream | XS |

## Proposta de execução (2 ondas)

### Onda 1 — P0 (LTV, RPR, Email Health) — ~1h30
1. **RPC `get_ltv_summary_v1`** — retorna LTV médio, LTV por coorte (D30/D90/D180), RPR, tempo médio entre compras
2. Novo card "LTV & Retenção" em `/dashboard` (3 KPIs + sparkline de coorte)
3. Aba "LTV" em `/relatorios` com tabela de coortes completa
4. Card "Saúde de envio" em `/canais`: bounce rate, complaint rate, opt-out rate (lê `customers_v3` + `email_engagement_events`)

### Onda 2 — P1 (Fidelidade, Inbox, ROAS) — ~1h
5. RPC `get_loyalty_kpis_v1` + header de `/dashboard/fidelidade` com 4 KPIs
6. RPC `get_inbox_sla_kpis_v1` + header de `/dashboard/inbox` com TMR/SLA/volume
7. Coluna "ROAS" em `/dashboard/campanhas` (custo / receita atribuída) + selo "estimado" quando GA4 não maduro

## Fora desta proposta
- **CAC payback** — depende de input do lojista (CAC não rastreado). Tratar separadamente com formulário em `/configuracoes`.
- **WhatsApp quality rating da Meta** — requer chamada nova à Meta Graph API; abrir tarefa específica.
- **Decay/multi-touch atribuição completa** — projeto de modelagem dedicado, não cabe em ondas curtas.

**Aprova executar Onda 1 (P0) primeiro?** É o que mais falta dado o nome do produto. Onda 2 vem em sequência.

