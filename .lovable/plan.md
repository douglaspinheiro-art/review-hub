Plano para corrigir o GA4 no passo 3 do onboarding:

1. Ajustar o contrato entre frontend e Edge Function
- A função `buscar-ga4` retorna `metrics` com chaves em inglês (`visitors`, `add_to_cart`, `begin_checkout`, `purchases`, `revenue`).
- O onboarding hoje lê `metricas` com chaves em português (`visitantes`, `carrinho`, `checkout`, `pedido`), por isso a conexão aparece correta, mas os campos continuam vazios/estimados.
- Atualizar `src/pages/Onboarding.tsx` para aceitar o formato atual da função e preencher:
  - Visitantes/mês <- `metrics.visitors`
  - Add to cart <- `metrics.add_to_cart`
  - Checkout <- `metrics.begin_checkout`
  - Pedidos/mês <- `metrics.purchases`
  - Faturamento <- `metrics.revenue`, apenas se a loja não tiver trazido faturamento real da plataforma

2. Importar GA4 também quando já estiver conectado
- Hoje o callback `onConnected` só dispara ao clicar/conectar pelo card.
- Como a conta e property já aparecem salvas (`ga4_account_email` e `ga4_property_id`), o passo 3 deve buscar automaticamente os dados do GA4 ao carregar quando a propriedade já existe.
- Adicionar no `GA4ConnectCard` um callback opcional de “pronto/conectado” ao carregar o estado salvo, sem exigir novo clique.

3. Melhorar feedback visual sem mudar o fluxo
- Marcar os campos de visitantes, add-to-cart, checkout e pedidos como importados do GA4.
- Exibir toast de sucesso com visitantes encontrados quando a importação funcionar.
- Manter fallback amigável se a API do Google falhar: GA4 conectado, mas campos editáveis manualmente.

Arquivos previstos:
- `src/pages/Onboarding.tsx`
- `src/components/onboarding/GA4ConnectCard.tsx`