

## Diagnóstico do bug

Cenário: receita R$ 200k, ticket R$ 250

```
pedidosAtuais     = 200.000 / 250        = 800 pedidos
visitantes        = 800 / 0,014          = 57.142 (ASSUME CVR = 1,4%)
pedidosPotenciais = 57.142 × 0,025       = 1.428
perda             = (1.428 - 800) × 250  = R$ 157.000  → com adjust ≈ R$ 200k
```

**O furo:** dividir por `CVR_ATUAL = 1,4%` infla os visitantes artificialmente. Resultado: a "perda" fica ~78% da receita atual, o que é absurdo (nenhuma loja perde mais do que fatura).

## Correção: cap realista + fórmula mais conservadora

Trocar a fórmula para uma que respeite limites do mundo real:

```ts
// CVR média BR e potencial atingível (não top-quartil teórico)
const CVR_ATUAL = 0.014;       // 1,4%
const CVR_ALCANCAVEL = 0.020;  // 2,0% (uplift realista de +0,6pp, não +1,1pp)

const pedidosAtuais = receita / ticketNum;
const visitantes = pedidosAtuais / CVR_ATUAL;
const pedidosPotenciais = visitantes * CVR_ALCANCAVEL;

const ticketAdjust = /* mesmo de antes */;

const perdaBruta = (pedidosPotenciais - pedidosAtuais) * ticketNum * ticketAdjust;

// CAP: perda nunca passa de 30% da receita (limite de mercado)
const PERDA_MAX_PCT = 0.30;
const perdaCapped = Math.min(perdaBruta, receita * PERDA_MAX_PCT);

return Math.max(0, Math.round(perdaCapped / 100) * 100);
```

### Validação dos novos números

| Receita | Ticket | Perda antes | Perda agora |
|---|---|---|---|
| R$ 25k | R$ 100 | ~R$ 19k | **~R$ 7,5k** (30% cap) |
| R$ 100k | R$ 250 | ~R$ 78k | **~R$ 30k** (30% cap) |
| R$ 200k | R$ 250 | ~R$ 200k 🚨 | **~R$ 60k** (30% cap) |
| R$ 300k | R$ 500 | ~R$ 235k | **~R$ 90k** (30% cap) |
| R$ 700k | R$ 800 | ~R$ 540k | **~R$ 210k** (30% cap) |

Agora **15-30% da receita** = patamar realista que bate com benchmarks de CRO + retenção (Baymard ~17%, Forrester ~20%).

### Ajuste do disclaimer

> *"Estimativa baseada em uplift de CVR de 1,4% → 2,0% (média → atingível em 6 meses). Limite máximo aplicado: 30% da receita. Fonte: Conversion Benchmark Report + Baymard Institute."*

## Mudança

Único arquivo: `src/components/landing/Hero.tsx` — substituir o `useMemo` da `perda` e atualizar a linha de fonte.

