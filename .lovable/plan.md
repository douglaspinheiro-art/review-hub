## Reativar todas as integrações Google

A plataforma tem **3 superfícies Google** que foram desligadas durante a verificação do app no Google. Vou reativar cada uma:

### 1. Login com Google (OAuth Supabase Auth)
- Adicionar botão **"Continuar com Google"** em `src/pages/Login.tsx` e `src/pages/Signup.tsx` usando `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: <origin>/login } })`.
- Tratar callback de `?code=` no `Login.tsx` (Supabase já troca automaticamente; garantir que `getPostLoginRoute` é chamado após `onAuthStateChange`).
- **Pré-requisito (manual no Supabase):** o usuário precisa habilitar o provider Google em **Authentication → Providers → Google** com Client ID/Secret. Vou abrir o link no final.

### 2. Google Analytics 4 (funil ConvertIQ)
- Já existem as edge functions `google-oauth-callback`, `list-ga4-properties`, `sync-funil-ga4`, `buscar-ga4`. Apenas a UI foi removida do onboarding.
- Reativar em `src/pages/Onboarding.tsx` (Step 4) e em `src/pages/dashboard/Configuracoes.tsx`:
  - Botão **"Conectar GA4"** que dispara OAuth via `google-oauth-callback`.
  - Após conectar, chamar `list-ga4-properties` para o usuário escolher a property.
  - Salvar `ga4_property_id`, `ga4_account_email`, `ga4_refresh_token` em `stores`.
  - Mostrar status conectado + botão **"Desconectar"** (chama `oauth-disconnect`).
- Remover comentário `// GA4 removido do onboarding durante a verificação Google.`

### 3. Google Business Profile (Reviews)
- Em `src/pages/dashboard/Reviews.tsx` o badge atual é **"Google · Offline"** com tooltip "Em breve".
- Trocar para **"Sincronizar Google"** ativo. Como ainda não há edge function de sync de reviews, vou:
  - Criar edge function nova `sync-google-reviews` (stub funcional que chama Google My Business API v4 `accounts.locations.reviews.list`).
  - Adicionar coluna `google_business_account_id` em `stores`.
  - Reaproveitar o mesmo fluxo OAuth do GA4 ampliando os scopes (`https://www.googleapis.com/auth/business.manage`).

### Mudanças de banco
- `ALTER TABLE stores ADD COLUMN google_business_account_id TEXT, google_business_location_id TEXT;`

### Configuração manual necessária (instruções no chat após implementar)
1. **Google Cloud Console** → habilitar APIs: Google Analytics Data API, Google My Business API.
2. **Supabase Auth** → habilitar provider Google com Client ID/Secret e adicionar `https://ydkglitowqlpizpnnofy.supabase.co/auth/v1/callback` em redirect URIs.
3. Confirmar/atualizar secrets `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` no Supabase (já devem existir das functions GA4).

### Resumo dos arquivos
- `src/pages/Login.tsx`, `src/pages/Signup.tsx` — botão "Continuar com Google"
- `src/pages/Onboarding.tsx` — reativa Step de conectar GA4
- `src/pages/dashboard/Configuracoes.tsx` — card Conexões Google (GA4 + Business)
- `src/pages/dashboard/Reviews.tsx` — habilita "Sincronizar Google"
- `supabase/functions/sync-google-reviews/index.ts` (novo)
- Migração SQL adicionando colunas `google_business_*` em `stores`