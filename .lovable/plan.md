

## Avaliação do plano: muito bom, com 3 ajustes críticos

O plano está **estrategicamente correto** e a leitura do código existente é precisa — os loops realmente já existem parcialmente, e fechá-los é o caminho de menor esforço com maior diferenciação. Aprovo a Fase 1 quase integral. Tenho 3 ressalvas técnicas e 2 sugestões de priorização antes de executar.

## Pontos fortes

- **Diagnóstico correto:** UTM ausente é mesmo o gargalo #1 — sem isso, atribuição é teatro
- **Fase 1.2 (ciclo IA → resultado → IA)** é o diferencial mais difícil de copiar e o mais barato de implementar
- **ISL combinado** resolve a queixa "qual número eu olho de manhã?"
- **Não recriar o que existe** — o plano respeita `prescriptions`, `opportunities`, `source_prescription_id`, `chs_history`. Bom.

## Ressalvas técnicas (resolver antes de começar)

### R1 — UTM injection precisa de allowlist de domínios (Fase 1.1)

Regex cego em todas as URLs vai injetar UTM em links de WhatsApp wa.me, links de unsubscribe, links de tracking de pixel e até em URLs de imagens da Meta — quebrando deliverability e contagem de cliques.

**Correção:** o helper `inject-utm.ts` precisa de allowlist baseada em `stores.url` (domínio da loja) + lista de domínios bloqueados (`wa.me`, `api.whatsapp.com`, `*.meta.com`, URLs de unsubscribe internas, URLs de tracking `track-email-*`).

### R2 — Fase 1.2 tem risco de loop infinito de contexto

Se você sempre envia todo o histórico de prescrições à IA, em 6 meses o payload estoura tokens e custa caro. 

**Correção:** limitar a últimas 10 prescrições resolvidas + agregado estatístico ("23 campanhas anteriores: ROI médio 4.2x, taxa sucesso 67%"). Hook precisa truncar e sumarizar antes de enviar.

### R3 — ISL precisa de período de "warm-up"

Loja nova com 2 dias de dados vai ter ISL distorcido (sem RFM, sem variação mês-a-mês). Isso gera má primeira impressão.

**Correção:** RPC `calculate_isl` retorna `null` + flag `insufficient_data: true` quando `created_at < 30 dias` ou `customers_v3 count < 50`. UI mostra estado "Coletando dados — ISL disponível em X dias" no lugar do score.

## Sugestões de priorização

### S1 — Inverter ordem: 1.1 → 1.5 → 1.2 → 1.4 → 1.3

- **1.5 (benchmark visível)** é trivial (extrair constantes pra `src/lib/`, exibir 2 linhas) e gera percepção de valor imediata. Faça depois de 1.1.
- **1.3 (ISL)** é o mais complexo e precisa que 1.1 esteja rodando há ~2 semanas para ter dados de engajamento confiáveis. Deixar por último na Fase 1.

### S2 — Adicionar "Fase 0" de telemetria

Antes de mexer em qualquer coisa, instrumentar 2 eventos analytics:
- `convertiq_diagnostic_to_campaign_conversion_rate` (% de prescrições que viram campanha disparada)
- `campaign_attributed_revenue_ratio` (receita atribuída ÷ receita total da loja)

São os 2 KPIs que provam que o plano funcionou. Sem baseline antes/depois, vira opinião.

## Plano final aprovado (ordem de execução)

```text
Fase 0  → Telemetria baseline (2 eventos)             [1 dia]
Fase 1.1 → UTM injection com allowlist de domínio    [2 dias]
Fase 1.5 → Benchmark visível na UI ConvertIQ          [1 dia]
Fase 1.2 → Ciclo IA com histórico truncado (top 10)  [2 dias]
Fase 1.4 → Widget IA proativa no Dashboard            [2 dias]
Fase 1.3 → ISL com warm-up + sparkline                [3 dias]
─────────────────────────────────────────────────────
Total Fase 1: ~11 dias úteis
```

Fases 2 e 3 do seu plano ficam como estão — só revalidar depois que Fase 1 estiver em produção 30 dias e telemetria mostrar adoção.

## Riscos não-cobertos no plano original

- **Custo da IA** vai subir 2-3x com `historico_prescricoes` no payload — orçar Anthropic
- **GDPR/LGPD do benchmark cross-tenant (Fase 3.1)** precisa de aviso explícito no Termos de Uso antes de agregar dados anônimos
- **UTM injection** muda URLs que o cliente já viu em mensagens antigas — só aplicar a mensagens novas (`scheduled_messages.status = 'pending'`), nunca rewriting retroativo

## Veredito

Plano sólido. Com os 3 ajustes técnicos (R1-R3) e a reordenação (S1-S2), executo com confiança. Quer que eu abra um plano detalhado da **Fase 0 + Fase 1.1** para começar agora?

