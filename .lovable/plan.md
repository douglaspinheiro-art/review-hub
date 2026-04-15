

## Plan: Fix Portuguese Accent Issues Across All Landing Components

### Problem
Multiple components have Portuguese text missing proper diacritical marks (acentos). Words like "medio", "operacao", "retenção" etc. are written without accents.

### Files to Edit and Specific Fixes

**1. `src/components/landing/Hero.tsx`**
- Line 33: "payback medio" → "payback médio"
- Line 34: "reativacao" → "reativação"

**2. `src/components/landing/Cases.tsx`**
- Line 11: "operacao diaria, triplicamos recorrencia" → "operação diária, triplicamos recorrência"
- Line 24: "canal previsivel de receita" → "canal previsível de receita"
- Line 37: "segmentacao RFM acionavel" → "segmentação RFM acionável"

**3. `src/components/landing/Pricing.tsx`**
- Line 41: "retencao com previsibilidade" → "retenção com previsibilidade"
- Line 44: "R$30k a R$3M/mes. Voce paga" → "R$30k a R$3M/mês. Você paga"
- Line 140: "Add-ons disponiveis ... benchmark preditivo, autopilot de retencao e governanca multi-loja" → "Add-ons disponíveis ... benchmark preditivo, autopilot de retenção e governança multi-loja"

**4. `src/components/landing/CategoryPositioning.tsx`**
- Line 8: "Operacoes de R$80k a R$500k/mes" → "Operações de R$80k a R$500k/mês"
- Line 9: "Ticket medio acima de R$120" → "Ticket médio acima de R$120"
- Line 9: "Reposicao e recorrencia guiada" → "Reposição e recorrência guiada"
- Line 10: "Catalogo amplo" → "Catálogo amplo"
- Line 10: "pos-venda" → "pós-venda"
- Line 29: "Retencao" → "Retenção"
- Line 32: "Voce nao compra automacao isolada. Voce liga um ritmo diario de receita ... IA de decisao e atribuicao" → "Você não compra automação isolada. Você liga um ritmo diário de receita ... IA de decisão e atribuição"
- Line 63: "agencias" → "agências"
- Line 70: "clinica de otimizacao" → "clínica de otimização"
- Line 75: "Distribuicao orientada" → "Distribuição orientada"
- Line 77: "aquisicao" → "aquisição"

**5. `src/components/landing/HowItWorks.tsx`**
- Line 27: "voce entra em producao" → "você entra em produção"
- Line 32: "acao diario" → "ação diário"
- Line 42: "recomendacao de proxima melhor acao" → "recomendação de próxima melhor ação"

**6. `src/components/landing/FooterCTA.tsx`**
- Line 41: "modo dominancia" → "modo dominância"
- Line 44: "proximos 90 dias com metas de retencao, distribuicao e expansao" → "próximos 90 dias com metas de retenção, distribuição e expansão"

**7. `src/components/landing/Metrics.tsx`**
- Line 11: "últimos" is correct, no changes needed in this file.

**8. `src/components/landing/TickerBar.tsx`** — All text correct, no changes.

**9. `src/components/landing/ScarcityBanner.tsx`** — All text correct, no changes.

**10. `src/components/landing/Footer.tsx`** — All text correct, no changes.

### Summary
- **7 files** to edit
- ~25 individual accent corrections
- No logic or structural changes — text-only fixes

