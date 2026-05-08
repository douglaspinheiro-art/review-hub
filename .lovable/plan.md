## Problema

Após o popup do Google fechar com "✓ Conectado!", o onboarding não importa os dados. Causas:

1. **Falta seleção de propriedade GA4.** O OAuth grava `ga4_account_email` + tokens, mas `ga4_property_id` permanece `NULL`. A `buscar-ga4` então retorna `400 "ga4_property_id missing for this store"` e nenhum dado entra no funil.
2. **`postMessage` pode não chegar ao opener** quando o popup é cross-origin (Supabase ↔ Lovable) por COOP — sem fallback, o card fica em "conectando".
3. **`google-oauth-callback` sem entrada em `supabase/config.toml`** (default = `verify_jwt=true`). Defensivo: declarar `verify_jwt=false`.

## Plano

### 1. Selecionar propriedade GA4 após OAuth (essencial)
Em `src/components/onboarding/GA4ConnectCard.tsx`:
- Após receber `ga4_oauth_result.success`, chamar `supabase.functions.invoke("list-ga4-properties", { body: { store_id } })`.
- Se vier **1 propriedade**: salvar automaticamente em `stores.ga4_property_id` e disparar `onConnected`.
- Se vier **2+**: renderizar um `<Select>` inline ("Escolha a propriedade GA4") → ao confirmar, `update stores set ga4_property_id` e dispara `onConnected`.
- Se vier **0**: toast de erro orientando criar/compartilhar acesso à property no GA4.
- Estado conectado passa a exigir `ga4_property_id` (não só `email`), para refletir que está realmente pronto.

### 2. Fallback de comunicação do popup
- No `htmlResponse` do `google-oauth-callback/index.ts`: além de `window.opener.postMessage`, também emitir via `BroadcastChannel('ga4_oauth')` antes do `window.close()`.
- No `GA4ConnectCard`: além do listener `message`, abrir um `BroadcastChannel('ga4_oauth')` e tratar o mesmo payload. Adicionar polling leve (a cada 2s, máx 60s) em `stores` checando `ga4_account_email` como último recurso.

### 3. Hardening do callback
- Adicionar bloco `[functions.google-oauth-callback]` com `verify_jwt = false` em `supabase/config.toml`.
- Garantir `Content-Type: text/html; charset=utf-8` (já está) e adicionar `Cross-Origin-Opener-Policy: unsafe-none` para permitir `window.opener` em browsers estritos.

### 4. Importação automática
- Após `ga4_property_id` salvo, o `onConnected` do `Onboarding.tsx` continua chamando `buscar-ga4` (já existente) — agora vai funcionar e popular `visitantes/carrinho/checkout` com `importedFields = true`.

## Arquivos afetados
- `src/components/onboarding/GA4ConnectCard.tsx` — UI de seleção de propriedade, BroadcastChannel, polling, estado.
- `supabase/functions/google-oauth-callback/index.ts` — BroadcastChannel + header COOP.
- `supabase/config.toml` — entrada `[functions.google-oauth-callback]`.

Sem alterações em business logic do funil; apenas plumbing OAuth → property → import.
