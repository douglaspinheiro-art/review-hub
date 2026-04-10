

# Análise: Integrações na página /dashboard/integracoes

## Estado Atual

A página de integrações está **bem estruturada em UI** mas tem **limitações significativas no backend**.

### O que funciona (Frontend)

| Categoria | Integrações | Status UI |
|---|---|---|
| E-commerce | Shopify, Nuvemshop, Tray, VTEX, WooCommerce, Dizy Commerce | Formulário de conexão funcional |
| CRM & Marketing | HubSpot, RD Station, Mailchimp | Formulário funcional |
| Reputação | Google Meu Negócio, Reclame Aqui | Formulário funcional |
| Marketplaces | Mercado Livre, Shopee, Amazon | Badge "Me avise" (coming soon) |
| SMS | Zenvia, Twilio | Formulário funcional |
| Parceiros Oficiais | Nuvemshop, Shopify Brasil | Cards com links externos |

**Total: 16 integrações listadas** (13 conectáveis + 3 coming soon)

### O que realmente acontece ao "Conectar"

Quando o usuário clica "Conectar" e preenche os campos:
1. Os dados são salvos na tabela `integrations` no Supabase (type, name, config JSON)
2. Automações padrão são criadas automaticamente (carrinho abandonado, pós-compra, etc.)
3. A integração aparece como "Conectada" na UI

**Porém, não há validação real das credenciais.** O sistema aceita qualquer valor nos campos — não testa se o token Shopify é válido, se a API Key do HubSpot funciona, etc.

### Backend real por integração

| Integração | Backend funcional? | Detalhes |
|---|---|---|
| **Shopify** | Parcial | `integration-gateway` recebe webhooks e normaliza pedidos. `fetch-store-metrics` puxa métricas via API. Mas não há OAuth — requer token manual. |
| **Nuvemshop** | Parcial | Mesmo que Shopify — gateway normaliza, fetch-store-metrics funciona. Sem OAuth. |
| **WooCommerce** | Parcial | Gateway + fetch-store-metrics implementados. |
| **Tray** | Parcial | Gateway normaliza pedidos, mas fetch-store-metrics não suporta Tray (retorna 422). |
| **VTEX** | Parcial | Gateway normaliza, fetch-store-metrics não suporta (retorna 422). |
| **Dizy Commerce** | Nenhum | Apenas salva credenciais. Sem gateway, sem sync. |
| **HubSpot** | Nenhum | Apenas salva credenciais. Nenhuma Edge Function processa dados. |
| **RD Station** | Nenhum | Apenas salva credenciais. |
| **Mailchimp** | Nenhum | Apenas salva credenciais. |
| **Google Meu Negócio** | Nenhum | Apenas salva Place ID. Sem fetch de reviews. |
| **Reclame Aqui** | Nenhum | Apenas salva ID. |
| **Zenvia** | Parcial | Edge Function `send-sms` existe mas não lê config da tabela `integrations` — usa env vars. |
| **Twilio** | Nenhum | Apenas salva credenciais. |

### Problemas identificados

1. **Sem validação de credenciais** — qualquer valor é aceito, o usuário não sabe se conectou corretamente
2. **CRM/Marketing são fachada** — HubSpot, RD Station e Mailchimp não fazem nada após salvar
3. **Sem sincronização real** — não há cron/worker que puxe dados periodicamente das plataformas
4. **Tray e VTEX** — gateway recebe webhooks mas `fetch-store-metrics` não os suporta
5. **SMS desconectado** — Zenvia/Twilio salvos na UI mas Edge Functions usam env vars separadas

### Recomendações prioritárias

Se quiser que as integrações funcionem de verdade, sugiro implementar por ordem de impacto:

1. **Validação de credenciais** — ao conectar, testar a API antes de salvar (ex: Shopify → GET /admin/api/shop.json)
2. **Completar fetch-store-metrics** para Tray e VTEX
3. **Conectar SMS** — fazer `send-sms` ler config da tabela `integrations` em vez de env vars fixas
4. **CRM sync** — pelo menos HubSpot (sincronizar contatos bidirecionalmente)
5. **Revisão de reviews** — Google Meu Negócio puxar avaliações reais

Deseja que eu implemente alguma dessas melhorias?

