## Diagnóstico

O Shopify retornou:

> Oauth error invalid_request: The redirect_uri and application url must have matching hosts

Isso acontece porque o Shopify exige que o **host** do `redirect_uri` enviado no início do OAuth seja **exatamente o mesmo host** configurado nos campos **App URL** e **Allowed redirection URL(s)** do app no Shopify Partners.

No nosso código (`supabase/functions/oauth-shopify/index.ts`), a `redirect_uri` é construída assim:

```ts
const callbackUrl = `${SUPABASE_URL}/functions/v1/oauth-shopify?action=callback`;
```

Ou seja, o host enviado é:

```
https://ydkglitowqlpizpnnofy.supabase.co
```

(o domínio do projeto Supabase: `ydkglitowqlpizpnnofy.supabase.co`).

Mas no Shopify Partners, a **App URL** provavelmente está apontando para outro host (por exemplo `https://ltvboost.com.br` ou `https://ltvboost.lovable.app`). Por isso o Shopify rejeita com "matching hosts".

> Importante: o problema **não é de código** — o código está correto. O problema é de **configuração no painel do Shopify Partners**. Eu não consigo alterar isso por você; precisa ser feito manualmente no painel do Shopify.

---

## Plano de correção

### 1. Ajustar configuração no Shopify Partners (você faz)

No painel do app em [partners.shopify.com](https://partners.shopify.com) → seu app → **Configuration**:

- **App URL**:
  ```
  https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-shopify
  ```
- **Allowed redirection URL(s)** (adicione esta linha):
  ```
  https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-shopify?action=callback
  ```

O **host** dos dois campos precisa ser idêntico: `ydkglitowqlpizpnnofy.supabase.co`.

Salve e tente conectar de novo.

### 2. (Opcional) Verificar secrets no Supabase

Confirmar que estão setados nas Secrets das Edge Functions:
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `APP_URL` (usada só no redirect final pós-callback — não afeta o erro atual)

### 3. (Opcional, melhoria futura) Logar a `redirect_uri`

Para facilitar debug em casos similares, eu posso adicionar um `console.log` da `callbackUrl` na fase `start` da função `oauth-shopify` — assim, em qualquer erro futuro você consegue conferir nos logs da Edge Function exatamente qual host foi enviado ao Shopify.

Se quiser que eu aplique essa melhoria de logging quando você aprovar o plano, eu faço junto. A correção principal (passo 1) é manual no painel da Shopify.