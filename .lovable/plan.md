

# Próximas melhorias no fluxo Onboarding → Analisando → Resultado

Depois das ondas anteriores (proveniência, idempotência, telemetria, reconciliação GA4), o fluxo está **robusto e transparente**. As melhorias agora são de **conversão, ativação e profundidade do diagnóstico** — não mais de infraestrutura.

---

## 1. Onboarding — reduzir abandono e aumentar qualidade do input

### 1.1 Auto-preenchimento via plataforma conectada
Hoje o lojista digita visitantes/carrinho/checkout mesmo após conectar Shopify/Nuvemshop. Se a integração já existe:
- Pré-popular `pedido`, `ticket_medio`, `receita` direto de `orders_v3` (últimos 30d).
- Marcar como `real` no `field_provenance`.
- Mostrar campo desabilitado com label "Vindo da sua loja · editar".

**Impacto:** menos digitação, `real_signals_pct` mais alto desde o início.

### 1.2 Progresso salvo entre sessões com retomada explícita
Draft já existe (com versionamento), mas não há UI para retomar. Adicionar:
- Banner no topo do `/onboarding`: "Continuar de onde parou? (salvo há 2h)" + botão descartar.
- Evita usuário recomeçar do zero ao fechar a aba.

### 1.3 Smart defaults por segmento
Quando o usuário escolhe segmento (moda, beleza, suplementos…), pré-popular `meta_conversao` e `ticket_medio` com benchmark do `industry-benchmarks.ts` (já existe).
- Hoje: default fixo 2.5% / R$ 250 para todos.
- Depois: moda 1.8% / R$ 180, beleza 2.4% / R$ 220, etc.

### 1.4 Validação cruzada GA4 ↔ plataforma no momento do input
Se ambos conectados e divergência > 30%, **bloquear avanço** com modal:
- "GA4 reporta 14k sessões mas sua loja tem 142 pedidos = 1% conversão. GA4 pode estar configurado errado (sem filtro de bot, ou propriedade errada)."
- Botões: "Reconfigurar GA4" / "Ignorar e continuar (uso só dados da loja)".

---

## 2. Analisando — aproveitar 100% da capacidade da edge

### 2.1 Streaming de progresso real (não fake)
Hoje o progresso é simulado (`elapsedMs / 20000`). A edge já tem etapas internas (parse, enrichment, IA, persist). Emitir eventos de progresso reais via:
- `supabase.channel("diagnostico-progress-${userId}")` na edge a cada etapa.
- Cliente escuta e atualiza `currentStep` real, não temporizado.

**Impacto:** UX mais honesta + mostra "IA pensando..." quando realmente está chamando Anthropic.

### 2.2 Pré-aquecimento da edge (warm-up)
Cold start da função Deno custa 800ms-2s. No final do Onboarding (antes do navigate), disparar `supabase.functions.invoke("gerar-diagnostico", { body: { _warmup: true } })` em fire-and-forget.
- Edge retorna 200 imediato em modo warmup.
- Quando `/analisando` chama de verdade, função já está quente.

### 2.3 Retry inteligente em vez de fallback genérico
Hoje, se a IA falha → usa `buildFallbackDiagnostic` (regras locais). Melhor:
- 1ª tentativa: Claude Sonnet.
- Se falhar parse → 2ª tentativa com `temperature=0` e prompt mais estrito.
- Se falhar de novo → fallback local (atual).
- Telemetria distingue `retry_success` vs `fallback_local`.

---

## 3. Resultado — converter melhor + acionar mais

### 3.1 Comparação contra peers (não só benchmark genérico)
Hoje mostra "sua conversão: 1.4% · benchmark setor: 2.5%". Adicionar:
- "Top 25% do seu segmento: 3.2%" · "Mediana: 1.9%".
- Posicionamento percentil: "Você está no percentil 22 entre lojas de moda no Brasil."
- Vem de `industry-benchmarks.ts` agregado.

**Impacto:** dor mais concreta → maior conversão para checkout.

### 3.2 Simulador interativo "se eu corrigir X, ganho Y"
Cada `recomendacao` já tem `impacto_pp` e `prazo_semanas`. Adicionar checkboxes:
- ☑ Aplicar #1 (+0.82pp em 1 semana)
- ☑ Aplicar #2 (+0.65pp em 3 semanas)
- ☐ Aplicar #3 (+0.40pp em 6 semanas)

Card lateral atualiza em real-time: "Receita extra projetada em 90 dias: R$ 142k".

### 3.3 Personalizar CTA por `chs` e `recommended_plan`
- `chs < 40` (em risco) → CTA: "Resgatar receita perdida agora" · plano Growth pré-selecionado.
- `chs 40-70` (regular) → CTA: "Acelerar resultados" · plano sugerido pela IA.
- `chs > 70` (bom) → CTA: "Manter liderança" · plano Scale (foco em retenção/LTV).

### 3.4 Captura de e-mail antes do paywall (se ainda não logado)
Cenário atual assume usuário logado. Para tráfego frio que cai direto via link compartilhado, mostrar diagnóstico parcial (resumo + 1 problema) e bloquear o resto com:
- "Receba o diagnóstico completo no seu e-mail" → captura lead → desbloqueio.

### 3.5 Compartilhamento social do diagnóstico
Botão "Compartilhar com meu sócio" gera link público (rota `/diagnostico-compartilhado/:token`) com diagnóstico read-only e CTA pra criar conta. Viralidade orgânica B2B.

---

## 4. Telemetria & otimização contínua

### 4.1 Funnel completo no dashboard de admin
Já existe `/admin/diagnostico-telemetria` para a etapa de geração. Estender com 3 eventos:
- `onboarding_started` / `onboarding_completed` / `onboarding_abandoned_at_step_N`
- `analisando_entered` / `analisando_completed`
- `resultado_viewed` / `resultado_cta_clicked` / `resultado_checkout_started`

Visualização tipo funnel chart: Onboarding → Analisando → Resultado → Checkout. Identifica onde mais perde.

### 4.2 A/B test de copy do CTA na `/resultado`
Variantes simples (50/50 via hash do `user_id`):
- A: "Ativar plano Growth" (atual)
- B: "Recuperar R$ 58k/mês" (uses `perda_estimada` do diagnóstico)

Mede `resultado_cta_clicked` por variante.

### 4.3 Heurística de "diagnóstico ruim"
Após 7 dias, se usuário não converteu, marcar diagnóstico como `low_conversion` e re-analisar prompt. Loop de melhoria do prompt da Anthropic baseado em conversão real.

---

## Priorização sugerida (impacto vs esforço)

```text
ALTA prioridade (faz no curto prazo):
  1.1 Auto-preenchimento via plataforma         [alto impacto, médio esforço]
  3.1 Comparação peers (percentil)              [alto impacto, baixo esforço]
  3.3 CTA personalizado por chs                 [alto impacto, baixo esforço]
  4.1 Funnel completo na telemetria             [alto impacto, médio esforço]

MÉDIA prioridade (próxima onda):
  1.3 Smart defaults por segmento               [médio impacto, baixo esforço]
  2.2 Pré-aquecimento da edge                   [médio impacto, baixo esforço]
  3.2 Simulador interativo                      [alto impacto, alto esforço]

BAIXA prioridade (validar antes):
  1.4 Validação cruzada bloqueante              [risco de bloquear demais]
  2.1 Streaming de progresso real               [requer mexer na edge]
  3.4 Captura email pré-paywall                 [só se houver tráfego frio]
  3.5 Compartilhamento social                   [validar demanda primeiro]
```

---

## Recomendação de próxima rodada concreta

Implementar **1.1 + 3.1 + 3.3 + 4.1** juntos — são todas melhorias de alto impacto, baixo a médio esforço, e se reforçam mutuamente:
- Auto-preenchimento → diagnóstico mais preciso
- Percentil peer → dor mais concreta
- CTA personalizado → conversão maior
- Telemetria do funil → mede o ganho real das três acima

Quer que eu detalhe qualquer um desses como plano de implementação?

