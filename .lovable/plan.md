

## Diagnóstico do funil atual

Mapeei a jornada de conversão da plataforma:

```
Landing (/) → Signup (5 campos) → Onboarding (3 passos)
           → Analisando (25s loading) → Resultado (paywall)
           → Planos → Checkout MP → Dashboard
```

### Pontos de atrito identificados

| # | Onde | Problema | Impacto |
|---|---|---|---|
| 1 | **Hero** | CTA único "Fazer diagnóstico" exige signup antes de mostrar valor | Alto — drop imediato |
| 2 | **Signup.tsx** | 5 campos obrigatórios (nome + email + senha + WhatsApp + plataforma) antes de qualquer prova | Altíssimo — fricção pré-wow |
| 3 | **Onboarding** | 3 passos cheios antes do diagnóstico; usuário ainda não viu resultado | Alto |
| 4 | **Analisando** | 25s de loading sem variação; usuário fecha aba | Médio |
| 5 | **Resultado** | Paywall imediato após o wow, sem ancoragem de preço vs perda | Alto — conversão paga |
| 6 | **Planos** | 3 tiers sem destaque do ROI vs "R$ 7.856/mês perdidos" | Médio |
| 7 | **Checkout MP** | Sem trust badges / garantia visível no último clique | Médio |
| 8 | Geral | Zero remarketing para quem abandona entre Resultado → Planos | Alto (recuperável) |

## Plano de otimização (6 mudanças priorizadas por ROI)

### 1. Hero interativo — mini-calculadora antes do signup `[ALTO IMPACTO]`
**Arquivo:** `src/components/landing/Hero.tsx`

Substituir o CTA "Fazer diagnóstico grátis" por um mini-formulário inline no Hero com 2 campos:
- Faturamento mensal (select: até 50k / 50-200k / 200-500k / 500k+)
- Ticket médio (R$)

Ao preencher, mostra em tempo real: *"Sua loja pode estar perdendo ~R$ X.XXX/mês"* (usando a fórmula do `Calculator.tsx` que já existe). Só **depois** da estimativa aparece o CTA "Quero o diagnóstico completo grátis →".

**Por quê:** entrega valor antes de pedir dado. Cria compromisso cognitivo (sunk cost mental).

### 2. Signup mínimo — 2 campos `[ALTO IMPACTO]`
**Arquivo:** `src/pages/Signup.tsx`

Reduzir o form para **email + senha**. Mover `full_name`, `whatsapp` e `plataforma` para o Onboarding (que já é wizard). Passa-se o `perda` estimado via query string para reforço visual na lateral.

**Por quê:** cada campo extra custa ~10% de conversão em signup. Esses 3 campos não bloqueiam a geração do diagnóstico.

### 3. Analisando com progresso real + social proof `[MÉDIO]`
**Arquivo:** `src/pages/Analisando.tsx`

Transformar os 25s em 4 steps visuais com timing escalonado:
- `✓ Conectando ao seu funil` (0-5s)
- `✓ Comparando com 847 lojas do seu setor` (5-12s)
- `✓ A IA está identificando vazamentos…` (12-20s)
- `✓ Gerando plano de ação priorizado` (20-25s)

Abaixo: carrossel de 3 depoimentos curtos ("Recuperamos R$ 38k na 1ª semana — Lucas, ModaFit"). Cada step com checkmark animado.

**Por quê:** percepção de trabalho justifica a espera e aumenta valor percebido do output.

### 4. Resultado com âncora de preço `[ALTO IMPACTO NA CONVERSÃO PAGA]`
**Arquivo:** `src/pages/Resultado.tsx`

Adicionar no topo da paywall, antes dos planos:
> *"Você está perdendo **R$ 7.856/mês**. O Growth custa **R$ 497/mês** — 16x menos. Payback em 3 dias."*

E reposicionar o card Growth como "default selected" (borda emerald + badge "Recomendado para o seu tamanho") baseado no `revenue_range` do diagnóstico.

**Por quê:** transforma preço absoluto em ROI relativo. Reduz abandono no paywall.

### 5. Exit-intent + e-mail de recuperação `[MÉDIO — receita recuperável]`
**Arquivos novos/editados:**
- `src/components/ExitIntentModal.tsx` (novo) — detecta mouse saindo da viewport em `/resultado` e `/planos`
- `supabase/functions/send-email` (já existe) — trigger para enviar e-mail 1h e 24h depois de quem chegou em `/resultado` sem converter

Modal: *"Antes de sair — te envio o diagnóstico completo por e-mail?"* (captura e-mail se ainda não logou) ou *"Posso te mandar o plano de ação por WhatsApp?"*

E-mails:
- **+1h:** "Seu diagnóstico está esperando — aqui está o resumo dos 3 gargalos"
- **+24h:** "Cupom de 20% off no primeiro mês (expira em 48h)"

**Por quê:** ~60% dos usuários que veem o diagnóstico não compram no mesmo dia. Hoje eles somem.

### 6. Trust stack no checkout `[BAIXO ESFORÇO, MÉDIO IMPACTO]`
**Arquivos:** `src/pages/Planos.tsx` + `src/pages/dashboard/Billing.tsx`

Adicionar logo abaixo do botão "Assinar":
- 🔒 "Pagamento seguro via Mercado Pago"
- ♻️ "7 dias de garantia — cancele sem taxa"
- 💬 "Suporte no WhatsApp em < 2h"
- ⭐ "847 lojas ativas · 4.8/5 no Reclame Aqui"

**Por quê:** último clique é onde o medo aparece. Trust badges reduzem abandono de checkout em 15-30%.

---

## Ordem sugerida de implementação

1. **Sprint 1 (maior ROI):** #2 Signup mínimo + #4 Resultado com âncora → impacto direto em CAC e conversão paga
2. **Sprint 2:** #1 Hero interativo + #3 Analisando → melhora topo e meio do funil
3. **Sprint 3:** #5 Exit-intent + e-mails → recupera quem já abandonou
4. **Sprint 4:** #6 Trust stack → polimento final

## Arquivos afetados

- `src/components/landing/Hero.tsx` — mini-calculadora inline
- `src/pages/Signup.tsx` — reduzir para 2 campos
- `src/pages/Onboarding.tsx` — absorver os 3 campos movidos
- `src/pages/Analisando.tsx` — steps visuais + social proof
- `src/pages/Resultado.tsx` — âncora de preço + plano recomendado
- `src/components/ExitIntentModal.tsx` — **novo**
- `src/pages/Planos.tsx` + `src/pages/dashboard/Billing.tsx` — trust stack
- `supabase/functions/send-email/index.ts` — templates de recuperação (e cron/trigger)

## Resultado esperado

Baseado em benchmarks de SaaS B2B com funil semelhante:
- Signup → Diagnóstico: **+25-40%** (com #1 e #2)
- Diagnóstico → Plano pago: **+15-25%** (com #4 e #6)
- Recuperação de abandono: **+8-12%** de receita adicional (com #5)

**Conversão end-to-end estimada:** de ~3% (atual típico) para **5-7%** — roughly 2x sem mudar tráfego.

## Pergunta para você

Quer que eu implemente todos os 6 itens de uma vez, ou prefere começar pelo **Sprint 1** (Signup mínimo + Resultado com âncora de preço) para medir impacto antes?

