Ah, entendi — não é desconto de plano anual, é o **Success Fee** (taxa de sucesso sobre receita recuperada) que precisa ficar visível nos cards de plano em `/resultado`.

Olhando `src/lib/pricing-constants.ts`:

- Starter: `successFeeRate: 0.03` → **3%**
- Growth: `successFeeRate: 0.02` → **2%**
- Scale: `successFeeRate: 0.015` → **1.5%**

Hoje os cards na `/resultado` mostram só `R$ X /mês` sem mencionar essa fee — o usuário pode ser pego de surpresa na cobrança, e também perde o gancho de que **plano maior = fee menor** (ótimo argumento de upsell).

## Mudança (arquivo único)

`**src/pages/Resultado.tsx**` — seção de planos inline (`#planos-inline`):

Logo abaixo do preço base de cada card, adicionar uma linha discreta:

```
R$ 497  /mês
+ 3% sobre receita recuperada · Success Fee
```

Detalhes:

- Texto: `text-xs text-white/50` (sutil, não compete com o preço)
- Ícone pequeno `TrendingUp` ou `Percent` em emerald antes do `+ X%`
- Tooltip (hover) explicando: *"Você só paga essa taxa sobre o faturamento que o LTV Boost recupera. Sem recuperação, sem fee."*
- No card **Growth** e **Scale**, badge adicional ao lado: `Economia vs Starter` mostrando a diferença (ex: Growth = "-1pp" / Scale = "-1.5pp")

## Onde puxar o valor

Já temos `PLANS[planKey].successFeeRate` em `pricing-constants.ts`. Renderizar como `${(rate * 100).toFixed(rate < 0.02 ? 1 : 0)}%` (1.5% precisa de decimal, 2%/3% não).

## Bônus opcional (dizer sim/não)

Adicionar uma micro-linha no topo do toggle Mensal/Anual:

> "Mensalidade fixa + Success Fee variável só sobre o que recuperarmos"

Deixa o modelo de cobrança 100% transparente antes do clique.

## Fora de escopo

- Não muda `pricing-constants.ts` nem o cálculo
- Não toca `/planos` (lá já existe coluna de fee)
- Não muda fluxo Mercado Pago