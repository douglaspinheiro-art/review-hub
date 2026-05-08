## Problema

O passo 3 do onboarding está quebrado:

- `TOTAL_STEPS = 3`, mas o bloco de dados do funil (faturamento, ticket médio, clientes, visitantes/checkout/pedidos, importação automática da loja) está renderizado em `{step === 4 && ...}` — uma etapa que nunca aparece.
- O passo 3 atual mostra apenas o `GA4ConnectCard` dentro do passo de integração e o "Score de confiabilidade + Gerar diagnóstico", **sem** o campo de faturamento nem a revisão dos dados importados.
- Resultado: o usuário clica em "Gerar diagnóstico com IA" e cai na validação `"Informe seu faturamento mensal aproximado."` sem nunca ter visto o campo.

A intenção original (descrita pelo usuário) é: passo 3 = revisar dados da loja já importados + faturamento + confirmar e gerar o diagnóstico. GA4 continua como conexão opcional dentro desse passo (depois da loja).

## Mudanças

Apenas em `src/pages/Onboarding.tsx`:

1. **Unificar passo 3** — trocar o gate `{step === 4 && (...)}` (linhas ~1402–1624) para `{step === 3 && (...)}`, fazendo o bloco "Métricas do seu negócio" voltar a aparecer no passo 3 logo acima do score + CTA "Gerar diagnóstico".
2. **Mover o `GA4ConnectCard`** de dentro do bloco de integração (passo 2, dentro do `integrationValid` em ~1339–1378) para o topo do passo 3, como card opcional acima do formulário de métricas. Mantém: ao conectar GA4, chama `buscar-ga4` e preenche visitantes/carrinho/checkout (mesma lógica atual). Mantém regra prévia "GA4 só depois de integrar a loja" porque o passo 3 só é alcançado após integração validada.
3. **Ajustar header do passo 2** — remover o texto "Agora conecte o Google Analytics para enriquecer o diagnóstico" do card de sucesso da integração; trocar para "Loja conectada. No próximo passo você revisa as métricas e (opcionalmente) conecta o GA4."
4. **Auto-fetch das métricas** (`useEffect` em ~529–531 que dispara `fetchStoreMetrics` quando `step === 3 && integrationValid`) já está correto — confirmar que continua disparando ao entrar no passo 3 unificado.
5. **Garantir a ordem visual no passo 3**, de cima para baixo:
   - Cabeçalho "Passo 3 — Revise e gere o diagnóstico"
   - Banner "Dados importados de {plataforma}" (já existe)
   - `GA4ConnectCard` (opcional, com badge "opcional — enriquece visitantes/checkout")
   - Grid de campos (faturamento, ticket médio, clientes, conversão, abandono)
   - Sub-grid do funil (visitantes, add to cart, checkout, pedidos)
   - Card "Score de confiabilidade"
   - Botão "Gerar diagnóstico com IA"
6. **Sem mudanças** em: validações de `handleFinish`, edge functions, schema, `TOTAL_STEPS`, lógica de persistência de draft.

## Fora de escopo

- Backend/edge functions
- Lógica de cálculo de conversão/score
- Visual do `GA4ConnectCard` em si