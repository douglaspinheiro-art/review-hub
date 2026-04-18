
## Ideia: Paywall blur nos Problemas Prioritários

Boa estratégia de conversão — mostra valor (lista existe, IA já analisou) mas trava o detalhe acionável atrás do upgrade. Padrão usado por Semrush, Ahrefs, etc.

## Proposta

Em `/resultado`, na seção "Problemas Prioritários":
- **1º problema:** visível 100% (prova que a análise é real)
- **2º e 3º problemas:** renderizados normalmente, mas com `blur-sm` + overlay escuro + cadeado central
- **Overlay CTA:** "Desbloqueie os outros 2 gargalos críticos · R$ X em receita perdida identificada" + botão "Desbloquear diagnóstico completo"

O botão usa o mesmo fluxo do CTA principal já existente (Mercado Pago checkout do plano recomendado).

## Implementação

Arquivo único: `src/pages/Resultado.tsx`

1. Identificar onde os problemas são mapeados (`.map`)
2. Para `index >= 1`, envolver o `ProblemCard` em `<div class="relative">` com:
   - filho com `filter blur-sm pointer-events-none select-none`
   - `<div class="absolute inset-0">` com gradiente + ícone `Lock`
3. Acima do bloco bloqueado, um único overlay-CTA centralizado (não um por card — fica mais limpo) com:
   - Headline: "Veja os outros N gargalos identificados"
   - Subtext com soma de `impacto_estimado` dos bloqueados
   - Botão verde reusando o handler de checkout existente

## Detalhes visuais (alinhado ao dark minimal)

- Blur: `blur-[6px]` + `opacity-60`
- Overlay: `bg-gradient-to-b from-transparent via-[#0A0A0F]/80 to-[#0A0A0F]`
- Ícone: `Lock` Lucide, `text-emerald-500`
- CTA: mesmo estilo do botão principal (emerald, font-black, tracking-widest)

## Fora de escopo

- Não muda a edge `gerar-diagnostico` (continua retornando todos os problemas)
- Não muda persistência — bloqueio é puramente visual no client
- Sem A/B test agora; se quiser medir, adicionamos `analytics-events` depois
