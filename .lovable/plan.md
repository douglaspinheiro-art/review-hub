

## Diagnóstico

A função edge `meta-wa-oauth` foi chamada e devolveu **HTTP 400** (confirmado em `function_edge_logs`). Mas:

1. O **cliente** (`meta-embedded-signup.ts` → `supabase.functions.invoke`) só recebe `"Edge Function returned a non-2xx status code"` — o body com o motivo real é descartado pelo SDK.
2. A **edge function** retorna 400 sem nenhum `console.error`, então os logs estão vazios — não dá pra saber qual dos motivos abaixo aconteceu.

Os 400 possíveis em `meta-wa-oauth/index.ts`:
- linha 45: `code` ou `store_id` ausentes no body
- linha 84: troca do `code` por access_token na Graph API falhou (motivo mais provável — `code` inválido/expirado, `redirect_uri` divergente, `META_APP_ID`/`META_APP_SECRET` errados, ou o app Meta sem `whatsapp` adicionado como produto)

## Correção (defesa em profundidade — 2 arquivos)

### 1. `supabase/functions/meta-wa-oauth/index.ts` — instrumentar e devolver 200 com `ok:false`

Seguindo o padrão do Lovable Stack Overflow (que esta knowledge base sinaliza explicitamente): trocar todos os `return jsonResponse({ error }, 400/403/404/500)` por **status 200** com `{ ok: false, error, code, diagnostics }`. Adicionar `console.error` em cada caminho de falha com tag `META_OAUTH_ERR` + payload da Graph API (sanitizado — sem token).

Especificamente no Step 1 (mais provável): logar `tokenRes.status` + `tokenData.error` (que vem da Meta com `type`, `code`, `error_subcode`, `message`) — assim a próxima tentativa diz exatamente o que a Meta reclamou.

### 2. `src/lib/whatsapp/meta-embedded-signup.ts` — ler `ok:false` no novo formato

Adaptar o `.then` do `supabase.functions.invoke` pra:
- se `data.ok === false`, propagar `data.error`/`data.code` em vez de devolver "exchange_failed" genérico
- toast no `WhatsApp.tsx` já mostra `result.error`, então o usuário passa a ver a mensagem real da Meta (ex.: "Invalid OAuth access token", "App not configured for WhatsApp", etc.)

## O que NÃO vou tocar

- Lógica de OAuth, scopes, upsert em `whatsapp_connections` — tudo continua igual
- Não preciso adicionar/rotacionar secrets (eles já existem; o problema é diagnóstico)
- Não muda `supabase/config.toml`

## Próximo passo após o fix

Depois que você clicar de novo em "Conectar com Facebook", o toast vai mostrar a mensagem exata da Meta. As 3 causas mais prováveis e como resolver cada uma:

| Mensagem da Meta | Causa | Fix |
|---|---|---|
| `Invalid verification code format` | `code` expirou (>10min) ou já foi trocado | tentar de novo |
| `Invalid OAuth access token` ou `App not configured` | `META_APP_ID`/`META_APP_SECRET` no Supabase ≠ app real | recolocar secrets corretos |
| `(#100) The parameter app_id is required` | produto WhatsApp não adicionado ao app Meta | adicionar produto "WhatsApp" no Meta dev console |

