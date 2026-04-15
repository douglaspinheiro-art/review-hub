# WhatsApp Cloud API (Meta) — setup com LTV Boost

Checklist para usar **Meta Cloud API**: inbox, envio pelo app e campanhas com templates.

## 1. Supabase

### Migrations

Garanta a migração com `whatsapp_connections.provider` e campos `meta_*` aplicada: `supabase/migrations/20260410120000_whatsapp_provider_meta.sql`. Confira se o remoto já recebeu essa versão: `npm run supabase:migration-list` (ver `docs/supabase-migrations-sync.md`).

### Secrets (Edge Functions)

No projeto Supabase → **Edge Functions → Secrets**:

| Secret | Obrigatório se usar Meta | Uso |
|--------|--------------------------|-----|
| `META_WHATSAPP_VERIFY_TOKEN` | Sim | Mesmo valor que você cola no campo **Verify token** do webhook no Meta Developer (GET challenge). |
| `META_APP_SECRET` | Sim | **App Secret** do app Meta; valida `X-Hub-Signature-256` nos POST do webhook. |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem para todas as funções.

### Deploy das funções

```bash
supabase functions deploy meta-whatsapp-webhook --no-verify-jwt
supabase functions deploy meta-whatsapp-send
```

A Meta chama o webhook **sem** JWT do Supabase; use **`--no-verify-jwt`** no `meta-whatsapp-webhook` (ou desative “Verify JWT” no painel da função). O `meta-whatsapp-send` permanece com verificação JWT — o app envia o `Authorization` do usuário logado.

`dispatch-campaign` também precisa estar atualizado se usar campanhas WhatsApp com `provider = meta_cloud`.

### URL do webhook (callback)

Monte com o mesmo host de `VITE_SUPABASE_URL`:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/meta-whatsapp-webhook
```

Sem barra no final. Esta URL aparece no dashboard **WhatsApp → Configurar API** quando o provedor é Meta (campo copiável).

## 2. Meta for Developers

1. App → produto **WhatsApp** → **Configuration** (ou API Setup).
2. **Webhook**: cole a URL acima; **Verify token** = valor de `META_WHATSAPP_VERIFY_TOKEN`.
3. Assine os campos de **messages** (e **message_status** se quiser entregas lidas).
4. **Phone number ID** e token de longa duração: guarde para o dashboard.

## 3. LTV Boost (dashboard)

1. **WhatsApp → Nova instância** → provedor **Meta Cloud API** (ou **Configurar API** em todas as conexões).
2. Preencha **Phone number ID** e **Access token**.
3. **Template padrão**: nome exato de um template **aprovado** (carrinho abandonado e contatos frios precisam de template).
4. **Campanhas**: campo **Template Meta** no modal quando for disparo fora da janela de 24h.

## 4. Meta Ads (Click-to-WhatsApp)

Use anúncios **Click to WhatsApp** apontando para o número da mesma WABA. Consulte o [pricing oficial](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) para janelas de free entry point e cobrança por template.

## 5. Validação local de secrets

Com as variáveis exportadas no shell:

```bash
npm run validate:env:edge
```

`META_*` entram como **recomendadas** (avisam se faltar, sem falhar o pipeline inteiro).

## 6. Teste rápido

1. Salvar conexão Meta no dashboard (status **connected** se ID + token ok).
2. No Meta Developer, **Test** do webhook deve retornar sucesso na verificação.
3. Envie mensagem de teste para o número; deve aparecer no **Inbox** após o webhook processar.
4. Resposta pelo inbox usa `meta-whatsapp-send` (JWT do usuário).
