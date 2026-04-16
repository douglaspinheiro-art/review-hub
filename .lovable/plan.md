
## Sim — podemos buscar os dados da plataforma automaticamente neste passo

A loja já está conectada e validada no Passo 2. A edge function `fetch-store-metrics` já retorna exatamente os campos do topo do formulário (`faturamento`, `ticketMedio`, `totalClientes`) para todas as plataformas suportadas (Shopify, Nuvemshop, WooCommerce, Tray, VTEX, Yampi, Magento, Shopee, **Dizy**).

### O que pode ser auto-preenchido
| Campo | Fonte | Auto? |
|---|---|---|
| Faturamento mensal (R$) | API da plataforma (`fetch-store-metrics`) | ✅ |
| Ticket médio (R$) | API da plataforma | ✅ |
| Nº clientes ativos | API da plataforma | ✅ |
| Meta de conversão (%) | Input do usuário | ❌ (objetivo, não dado real) |
| Visitantes / Add to cart / Checkout / Pedidos | Apenas GA4 (não vem de APIs de e-commerce) | ⚠️ só via GA4 |

### Implementação proposta

1. **Auto-fetch ao entrar no Passo 3**
   - Em `src/pages/Onboarding.tsx`, adicionar `useEffect` que dispara quando `step === 3 && integrationValid === true`.
   - Chama `supabase.functions.invoke("fetch-store-metrics", { body: { user_id, type: platformInfo.type } })`.
   - Pré-preenche `faturamento`, `ticketMedio` e `totalClientes` (novo state) com os valores retornados.

2. **Estados visuais**
   - Banner verde no topo do card: *"✨ Dados importados de [Shopify/Dizy/etc] — últimos 30 dias"* com botão "Atualizar".
   - Loading skeleton nos 3 inputs enquanto busca (`metricsLoading`).
   - Em caso de erro, fallback silencioso para inputs vazios + toast informativo: *"Não foi possível importar automaticamente. Preencha manualmente."*
   - Inputs continuam editáveis (usuário pode ajustar se discordar).
   - Badge ⓘ ao lado de cada campo auto-preenchido: *"Importado da [plataforma]"*.

3. **Funil (visitantes/cart/checkout/pedidos)**
   - Esses 4 campos **não** vêm das APIs de e-commerce — apenas GA4 tem esses eventos.
   - Manter como opcionais (já estão), mas adicionar CTA discreto: *"Conectar GA4 para importar dados do funil"* → abre o modal já existente de GA4.

4. **Fallback para Dizy / plataformas novas**
   - Se a chamada falhar por API ainda não madura, manter inputs manuais — sem bloquear o fluxo.

### Detalhes técnicos
- **Arquivo**: `src/pages/Onboarding.tsx` (Passo 3, ~linhas 712-810).
- **Hook reutiliza**: a edge function `fetch-store-metrics` já existe — sem precisar de novas migrações nem novos secrets.
- **Backend**: nenhuma alteração necessária (Dizy já mapeado via Magento engine).
- **Race condition**: adicionar guard para evitar fetch duplo se usuário voltar e avançar.
