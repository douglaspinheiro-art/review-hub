

## Análise das 4 imagens

| Imagem | O que mostra | Mensagem central | Melhor lugar na home |
|---|---|---|---|
| **Diagnostico.png** (score 68 + R$ 7.856/mês perdidos) | Score visual + valor concreto perdido vs benchmark | "Veja em segundos quanto está perdendo" | **Hero** (substituir mockup genérico) |
| **Diagnostico_1.png** (Problemas prioritários com R$/mês) | IA classifica gargalos por severidade e impacto financeiro | "A IA aponta exatamente onde está vazando" | **Nova seção "Diagnóstico em ação"** entre HowItWorks e Solutions |
| **Dash.png** (Radar de Lucro + Receita em risco) | Urgência: receita identificada mas não capturada | "Cada hora sem ação reduz recuperação" | **Benefits** (substituir um card) ou **CTASection** |
| **Dash_1.png** (Ações de receita hoje + Churn risk) | Operação diária priorizada por impacto | "Não é só diagnóstico — é execução" | **Solutions** (nova aba "Operação diária") |

## Plano de inserção (3 mudanças cirúrgicas)

### 1. Hero — substituir mockup fake pelo Diagnóstico real
**Arquivo:** `src/components/landing/Hero.tsx`
- Trocar o painel direito (gráfico de barras + métricas mock "Conversão 4.8%") por uma reprodução fiel da `Diagnostico.png`: card escuro com score grande **68 / Regular**, "VOCÊ ESTÁ PERDENDO **R$ 7.856/mês**", linha com "Sua CVR 1.40% / Benchmark 2.5% / Perda/dia R$ 262", e o box verde "ANÁLISE DA IA" embaixo.
- **Por quê:** o mockup atual é genérico ("R$ 847.320 +34%"). A imagem real do produto entrega a promessa do H1 ("descubra quanto sua loja perde") em 1 olhada.
- Mantém os cards flutuantes (nova venda, carrinho recuperado) ao redor.

### 2. Nova seção "Diagnóstico em ação" — entre `HowItWorks` e `Solutions`
**Novo arquivo:** `src/components/landing/DiagnosticPreview.tsx` (e import em `Index.tsx`)

Layout 2 colunas:
- **Esquerda (copy):**
  - Eyebrow: `DIAGNÓSTICO COM IA`
  - H2: `A IA aponta onde está vazando — em reais, por mês.`
  - Parágrafo: "Não é mais um dashboard bonito. É um raio-X que classifica cada problema por severidade e mostra o impacto financeiro mensal de cada um."
  - 3 bullets: "Severidade Crítico/Alto/Médio" · "Impacto em R$/mês por problema" · "Plano de ação priorizado"
  - CTA secundário: "Ver meu diagnóstico grátis →"
- **Direita:** reprodução da `Diagnostico_1.png` — 3 cards de problemas (ALTO R$ 20.429/mês, ALTO R$ 11.000/mês, CRÍTICO R$ 7.857/mês) com badges coloridos de severidade.

### 3. Solutions — adicionar 4ª aba "Operação diária"
**Arquivo:** `src/components/landing/Solutions.tsx`
- Adicionar nova aba `operacao` no array `tabs`:
  - Label: "Operação"
  - Title: "Receita do dia, priorizada"
  - Desc: "Toda manhã sua equipe abre o Radar de Lucro e vê exatamente o que mexer hoje — por impacto esperado, urgência e potencial de retenção."
  - Features: "Ações priorizadas por R$ esperado" · "Risco de churn por conta" · "Playbooks prontos por contexto" · "Recomendação de próxima melhor ação" · "Relatório semanal automático" · "Sinais proprietários de SDR"
  - Mockup: simplificação visual da `Dash_1.png` — lista "Ações de receita hoje" com 3 linhas (ALTA R$ 70.715, MÉDIA R$ 1.800, MÉDIA R$ 1.400) + lateral com "Risco de Churn 42 / médio".

### (Opcional, se quiser usar a 4ª imagem) Banner "Radar de Lucro" no CTASection
**Arquivo:** `src/components/landing/CTASection.tsx`
- Adicionar acima do CTA atual um banner inspirado em `Dash.png`: faixa vermelha "RECEITA EM RISCO AGORA — R$ 70.715 identificados mas não capturados" + botão "Recuperar agora".
- **Por quê:** fecha a página com urgência + valor concreto, em vez de só "Comece grátis".

## Resumo do mapa final

```
Hero            → Diagnostico.png (substitui mockup)
TickerBar/...
HowItWorks
[NOVA] Diagnostic→ Diagnostico_1.png
Solutions       → +1 aba com Dash_1.png
...
CTASection      → (opcional) banner Dash.png
```

## Arquivos afetados

- `src/components/landing/Hero.tsx` — substituir painel direito
- `src/components/landing/DiagnosticPreview.tsx` — **novo**
- `src/pages/Index.tsx` — importar e inserir `<DiagnosticPreview />` após `<HowItWorks />`
- `src/components/landing/Solutions.tsx` — adicionar 4ª aba
- *(opcional)* `src/components/landing/CTASection.tsx` — banner urgência

## Resultado esperado

A copy passa de "promessas genéricas + mockup fake" para **prova visual concreta**: o visitante vê em 3 momentos da página (Hero, Diagnostic Preview, Solutions) exatamente o que vai receber — score, problemas em R$ e fila de ações priorizadas. A jornada visual reforça o H1 "descubra quanto está perdendo" → "veja onde está vazando" → "saiba o que fazer hoje".

