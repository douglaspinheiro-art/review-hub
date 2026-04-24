
# Plano: Incluir plataforma de e-commerce no loop fechado

## Decisões aprovadas
1. **5 nós separados** no diagrama do Hero (E-commerce, GA4, IA, WhatsApp/Email, Mensuração).
2. Nova **headline mestre**: "Sua loja + GA4 → IA → WhatsApp → resultado de volta".
3. Aplicar em **todos os 7 arquivos** (Hero, HowItWorks, ClosedLoopProof, CompetitorComparison, CategoryPositioning, Resultado, Planos).

---

## Mudanças por arquivo

### 1. `src/components/landing/Hero.tsx`
- **Headline**: "Sua loja + GA4 → IA → WhatsApp → resultado de volta no seu Analytics."
- **Subheadline**: ajustar para mencionar que sincronizamos pedidos/contatos/catálogo da plataforma.
- **Diagrama (coluna direita)**: passar de 4 para 5 `LoopNode`:
  - **00 — Conecta sua loja** (`ShoppingBag`): "Shopify · Nuvemshop · VTEX · WooCommerce · Yampi · Tray" — meta: "OAuth oficial · pedidos, contatos e catálogo sincronizados"
  - **01 — Lê do GA4** (`BarChart3`)
  - **02 — IA decide** (`Bot`) — ajustar meta para "RFM da plataforma + comportamento do GA4"
  - **03 — Executa** (`MessageCircle`)
  - **04 — Mensura** (`RefreshCw`, highlight) — "no GA4 + pedido `paid` confirmado na plataforma"
- Compactar `LoopNode` (padding `p-2.5`, ícone `w-8 h-8`) para caber 5 nós sem alongar muito.
- Atualizar chips de prova: incluir "Conecta Shopify/Nuvemshop/VTEX em 1 clique".

### 2. `src/components/landing/HowItWorks.tsx`
- Passar de 4 para 5 etapas (mesma sequência do Hero).
- Mudar grid de `md:grid-cols-4` para `md:grid-cols-5`.
- Atualizar a linha de loop circular para abranger 5 nós (ajustar `left/right` do gradient).
- Ajustar parágrafo do header para "loop fechado em 5 etapas".
- Texto novo do passo 00:
  > "Conectamos sua plataforma (Shopify, Nuvemshop, VTEX, WooCommerce, Yampi, Tray) por OAuth em 1 clique. Sincronizamos contatos, pedidos, catálogo e eventos de carrinho via webhook oficial."

### 3. `src/components/landing/ClosedLoopProof.tsx`
- Adicionar bullet de dupla validação: "Conversão validada em **dois lugares**: evento `purchase` no GA4 + pedido `paid` na sua plataforma. Sem dupla contagem, sem dado órfão."
- Mencionar plataformas no mock/copy quando relevante.

### 4. `src/components/landing/CompetitorComparison.tsx`
- Adicionar nova linha à tabela `ROWS`:
  - "Conecta plataforma e-commerce nativamente": dashboards `false`, consultorias `partial`, chatbots `partial`, ltv `true`.
- Atualizar parágrafo de fechamento para citar "três sistemas: e-commerce, GA4 e canal".

### 5. `src/components/landing/CategoryPositioning.tsx`
- Reescrever descrição da categoria "Closed-Loop Revenue Recovery" para deixar claro que o loop atravessa **3 sistemas do lojista** (e-commerce + GA4 + canal).
- Manter blocos de ICP/parceiros existentes.

### 6. `src/pages/Resultado.tsx`
- No `ClosedLoopTimeline`, adicionar passo zero de setup:
  > "Hoje (setup): conectamos sua [plataforma do diagnóstico] em 2 cliques e puxamos seus últimos 90 dias de pedidos."
- Passar a usar `formData.plataforma` (já capturado no diagnóstico) — fallback "sua plataforma".

### 7. `src/pages/Planos.tsx`
- No bloco "🔗 Conexão (entrada do loop)" de cada plano: listar explicitamente plataformas suportadas — "Shopify, Nuvemshop, VTEX, WooCommerce, Yampi, Tray, Shopee".
- Atualizar hero/subhead se ainda mencionar só "GA4 + WhatsApp".
- Atualizar FAQ: trocar/adicionar pergunta "E se minha loja é Shopify/Nuvemshop/VTEX?" → resposta sobre OAuth + sincronização.

---

## Verificações pós-implementação
- `tsc --noEmit` para garantir zero erros de tipo.
- Conferir responsivo do Hero em 1280px (5 nós empilhados verticalmente já — ok) e do HowItWorks em md (`grid-cols-5` pode ficar apertado; usar `gap-4` em vez de `gap-6` se necessário).
- Smoke visual rápido em `/`, `/resultado`, `/planos`.

## Arquivos editados
- `src/components/landing/Hero.tsx`
- `src/components/landing/HowItWorks.tsx`
- `src/components/landing/ClosedLoopProof.tsx`
- `src/components/landing/CompetitorComparison.tsx`
- `src/components/landing/CategoryPositioning.tsx`
- `src/pages/Resultado.tsx`
- `src/pages/Planos.tsx`

Nenhum arquivo novo. Sem mudanças de schema, env vars ou edge functions.
