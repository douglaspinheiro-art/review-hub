

## Por que esses campos do funil estão "vazios" no Step 3

Você tem razão na intuição, mas o estado atual é assim:

- **Step 3 (Métricas)** — pede 4 números do funil (Visitantes, Add to cart, Checkout, Pedidos) e hoje eles **não vêm da integração de e-commerce**. Vêm de:
  1. **GA4 (Step 4)** — se você conectar GA4, aí sim os 4 campos são auto-preenchidos via `buscar-ga4` (eventos `view_item`, `add_to_cart`, `begin_checkout`, `purchase`).
  2. **Estimativa matemática** — se nada for preenchido, o sistema chuta com base em `faturamento / ticket_medio / 0.014` (taxa média).
  3. **Manual** — você digita.

- **Integrações de e-commerce (Shopify/Nuvemshop/etc.)** — hoje retornam apenas `faturamento`, `ticketMedio`, `totalClientes`, `taxaAbandono` via `fetch-store-metrics`. **Não retornam visitantes / add-to-cart / begin-checkout** porque essas métricas são de comportamento de navegação (GA4/Pixel), não de pedidos. As APIs nativas do e-commerce só conhecem pedidos finalizados.

Ou seja: **a ordem correta é Step 4 (GA4) primeiro → Step 3 auto-preenchido**, mas o wizard está invertido.

## Proposta

Inverter a ordem para entregar a expectativa "métricas vêm da integração":

**Plano**
1. **Reordenar:** Step 3 vira "Conectar GA4" (atual Step 4), Step 4 vira "Métricas" (atual Step 3).
2. **Auto-preencher** os 4 campos do funil assim que GA4 conectar com sucesso (lógica já existe em `fetchGa4Properties`/`testarGa4`, só precisa rodar antes do step de métricas).
3. **Mostrar badge "✨ importado do GA4"** em cada um dos 4 inputs quando o valor vier de lá (igual já fazemos para `taxaAbandono`).
4. **Pedidos/mês** ganha um fallback adicional: se a integração de e-commerce estiver ativa, calcular `pedidos = faturamento / ticketMedio` (essa parte sim a integração sabe).
5. **Visitantes / Add to cart / Checkout** continuam dependendo de GA4 — adicionar uma nota explicativa: *"Visitantes e eventos de carrinho vêm do GA4. Pedidos vêm da sua loja."*
6. Se o usuário **pular GA4**, manter os campos editáveis com placeholders estimados (comportamento atual).

**Arquivos afetados**
- `src/pages/Onboarding.tsx` — trocar ordem dos steps 3↔4, adicionar badges `importedFields.visitantes/carrinho/checkout/pedidos`, calcular `pedidos` via integração quando disponível, adicionar nota explicativa.

**Fora de escopo**
- Trazer visitantes/eventos via Shopify/Nuvemshop (não existe na API deles).
- Integrar Meta Pixel como fonte alternativa ao GA4 (futuro).

