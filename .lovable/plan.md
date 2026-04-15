

# Integração E-commerce Obrigatória no Onboarding (Passo 2)

## Resumo
Inserir um passo obrigatório de integração com a plataforma de e-commerce entre "Info da loja" e "Dados do funil". Sem o botão "Pular" — o lojista precisa conectar para avançar. Com a integração real, os dados do funil (Passo 3) podem ser pré-preenchidos via API da plataforma, e o GA4 (Passo 4) continua opcional.

## Novo Fluxo (4 passos)

```text
Passo 1: Info da loja (nome, vertical, URL, plataforma)
Passo 2: Integração e-commerce (OBRIGATÓRIA — credenciais da plataforma selecionada)
Passo 3: Dados do funil (pré-preenchido se possível, ou manual)
Passo 4: GA4 opcional (com "Pular — usar estimativas")
→ Analisando → Resultado → Setup → Dashboard
```

## Alterações

### `src/pages/Onboarding.tsx`
- Adicionar **Passo 2** com formulário dinâmico baseado na plataforma do Passo 1
- Reutilizar o catálogo de campos de `Integracoes.tsx` (Shopify: `shop_url` + `access_token`; Nuvemshop: `user_id` + `access_token`; VTEX: `account_name` + `app_key` + `app_token`; WooCommerce: `site_url` + `consumer_key` + `consumer_secret`; Tray: `api_address` + `access_token`; Dizy: `api_key` + `store_id`)
- Botão "Conectar e validar" chama `validate-integration` Edge Function
- **Sem botão "Pular"** — validação bem-sucedida é requisito para avançar
- Após validação OK: salva na tabela `integrations` (upsert com `store_id`), exibe toast de sucesso, avança automaticamente
- Se a plataforma selecionada no Passo 1 não tiver integração suportada (ex: "Outra", "Yampi", "Loja Integrada"), mostrar formulário de contato/interesse e permitir avançar sem integração (caso excepcional)
- Progress bar atualizada de 3 para 4 passos
- Renumerar passos: antigo 2 (funil) → 3, antigo 3 (GA4) → 4

### Visual do Passo 2
- Card centralizado com ícone/nome da plataforma selecionada
- Campos de credenciais específicos com labels e placeholders
- Link "Como obter as credenciais?" com instruções por plataforma
- Estado de validação: loading spinner → sucesso (check verde) ou erro (mensagem da Edge Function + retry)
- Mensagem de erro clara vinda da Edge Function (ex: "Shopify retornou 401. Verifique o token.")

### Dados Reais
- Com a integração conectada, é possível buscar dados reais da loja (pedidos, produtos, faturamento) via `fetch-store-metrics` ou `integration-gateway`
- No Passo 3 (funil), pré-preencher campos com dados reais se a integração estiver ativa

### Mapeamento plataforma → tipo de integração
| Plataforma (Passo 1) | Tipo integração | Suportada |
|---|---|---|
| Shopify | shopify | Sim |
| Nuvemshop | nuvemshop | Sim |
| VTEX | vtex | Sim |
| WooCommerce | woocommerce | Sim |
| Tray | tray | Sim |
| Dizy Commerce | dizy | Sim |
| Magento | magento | Sim |
| Yampi, Loja Integrada, Outra | — | Não (registra interesse) |

### Arquivos alterados
| Arquivo | Mudança |
|---------|---------|
| `src/pages/Onboarding.tsx` | Refatorar para 4 passos, adicionar Passo 2 de integração obrigatória |

### O que NÃO muda
- Edge Function `validate-integration` — já suporta todas as plataformas
- Tabela `integrations` — já existe com campos necessários
- Passos 3 e 4 — mesma lógica, apenas renumerados

