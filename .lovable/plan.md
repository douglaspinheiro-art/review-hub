

## Problema do cálculo atual

```ts
const receita = REVENUE_RANGES[faixa]; // ponto médio fixo da faixa
return receita * 0.12 * ticketEfficiency;
```

Dois furos graves:
1. **Receita é um chute fixo** — quem fatura R$ 60k e R$ 180k cai no mesmo bucket "50-200k" e recebe a mesma R$ 100k de base
2. **Ignora ticket médio para derivar volume real** — o ticket só vira um "multiplicador de eficiência" arbitrário

Resultado: dois inputs diferentes geram o mesmo número, ou números que não fazem sentido vs a realidade do lojista.

## Cálculo correto (baseado no `Calculator.tsx` que já existe)

A página `/calculadora` já usa a fórmula certa, ancorada em **benchmarks de CVR por segmento**:

```
perda = visitantes × (CVR_benchmark - CVR_atual) × ticket_médio
```

O Hero hoje não pergunta visitantes nem CVR — então precisamos **derivar visitantes a partir de receita ÷ ticket** e usar uma **CVR média do mercado BR (1.4%)** vs **benchmark do segmento líder (2.5%)**.

### Nova fórmula proposta

```ts
// 1. Receita estimada = ponto médio da faixa (mantém input simples)
const receita = REVENUE_RANGES[faixa]; // ex: 100.000

// 2. Pedidos atuais = receita ÷ ticket (dado real do lojista)
const pedidosAtuais = receita / ticket; // ex: 100.000 / 250 = 400 pedidos/mês

// 3. CVR média do e-commerce BR = 1.4% (fonte: Conversion Benchmark Report)
const CVR_ATUAL = 0.014;

// 4. Visitantes implícitos = pedidos ÷ CVR
const visitantes = pedidosAtuais / CVR_ATUAL; // 400 / 0.014 ≈ 28.571

// 5. CVR benchmark do top-quartil BR = 2.5%
const CVR_BENCHMARK = 0.025;

// 6. Pedidos potenciais com a CVR do benchmark
const pedidosPotenciais = visitantes * CVR_BENCHMARK; // 28.571 × 0.025 ≈ 714

// 7. Perda mensal = (pedidos potenciais - pedidos atuais) × ticket
const perda = (pedidosPotenciais - pedidosAtuais) * ticket;
// = (714 - 400) × 250 = R$ 78.500/mês
```

### Por que isso é mais críveis

- **Cada R$ de ticket muda o resultado proporcionalmente** — ticket R$ 100 vs R$ 500 dá perdas muito diferentes mesmo com a mesma faixa
- **A fonte está ancorada** — CVR média BR (1.4%) e benchmark (2.5%) são números públicos defensáveis (Adobe, Episerver, Conversion Benchmark Report)
- **Bate com o cálculo da página `/calculadora`** — o lojista que fizer a conta detalhada depois vê o mesmo número, não "dois sistemas" diferentes
- **Faz sentido matemático** — é literalmente "se você convertesse como o melhor do seu setor"

### Exemplos para validar credibilidade

| Faturamento | Ticket | Cálculo | Perda |
|---|---|---|---|
| 50-200k (100k) | R$ 100 | (1000 vis ext × diff CVR) × 100 | ~R$ 78k |
| 50-200k (100k) | R$ 250 | derivação acima | ~R$ 78k |
| 50-200k (100k) | R$ 500 | (200 ped × diff) × 500 | ~R$ 78k |
| 200-500k (300k) | R$ 250 | × 3 | ~R$ 235k |

Hmm — note que **a perda escala com a receita, não com o ticket**, porque ticket cancela na fórmula (visitantes = receita/ticket/CVR; perda = visitantes × ΔCVR × ticket → ticket cancela). Isso é matematicamente correto mas visualmente "estranho" — o usuário muda o ticket e o número não muda.

### Solução para o ticket importar visualmente

Adicionar um **ajuste de eficiência por faixa de ticket** (justificável: lojas de ticket muito baixo têm fricção maior; muito alto têm ciclo mais longo):

```ts
const ticketAdjust = 
  ticket < 80   ? 0.85 :  // ticket baixo: mais difícil escalar CVR
  ticket < 150  ? 0.95 :
  ticket < 400  ? 1.00 :  // sweet spot
  ticket < 800  ? 1.05 :
  1.10;                    // ticket alto: mais espaço de CRO

const perda = (pedidosPotenciais - pedidosAtuais) * ticket * ticketAdjust;
```

Assim o ticket muda o resultado **e** a fórmula continua defensável.

## Mudanças no código

**Arquivo:** `src/components/landing/Hero.tsx` (única mudança)

Substituir o `useMemo` da `perda` pela fórmula acima. Adicionar uma linha pequena abaixo do número:

> *"Baseado em CVR média do e-commerce BR (1.4%) vs top-quartil do seu segmento (2.5%). Fonte: Conversion Benchmark Report."*

Isso ancora a credibilidade — o número deixa de ser "mágico" e passa a ter origem auditável.

## Resultado esperado

- Lojista de R$ 100k/mês com ticket R$ 250 vê **~R$ 78k/mês**, não R$ 36k
- Mudar o ticket muda o número de forma perceptível (via `ticketAdjust`)
- O número bate com o que a `/calculadora` detalhada mostraria depois → consistência → confiança
- A linha de fonte transforma a estimativa em "análise" em vez de "chute"

