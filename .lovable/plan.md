# Reativar conexão GA4 no /onboarding

## Contexto
A conexão Google Analytics 4 foi removida do onboarding (comentários explícitos nas linhas 189-191 e 223 de `src/pages/Onboarding.tsx`) durante o processo de verificação Google. Atualmente, o usuário só consegue conectar o GA4 em `/dashboard/configuracoes` via `GoogleConnectionsCard`. O Step 4 (Dados do Funil) ainda exibe textos como "✨ GA4" mas não há fluxo para autorizar.

## O que será feito

### 1. Card opcional "Conectar Google Analytics 4" no Step 4
Adicionar acima dos inputs do funil (linha ~1383, dentro do bloco `{step === 4 && (...)}`) um card colapsável/opcional com:
- Estado **não conectado**: ícone GA4, copy explicando que importar do GA4 substitui os dados estimados de visitantes/carrinho/checkout, botão "Conectar Google Analytics".
- Estado **conectado**: badge verde com email da conta + property ID + botão "Desconectar / trocar conta".
- Botão secundário "Pular — preencher manualmente" (mantém comportamento atual; GA4 segue opcional).

### 2. Reaproveitar o fluxo OAuth existente
- Usar a edge function `google-oauth-callback` com `scope_set=ga4` (mesmo padrão do `GoogleConnectionsCard.tsx`).
- Abrir popup OAuth, escutar `postMessage` com `type: "ga4_oauth_result"`, recarregar dados da `stores` (`ga4_account_email`, `ga4_property_id`).
- Após sucesso, disparar automaticamente a função `sync-funil-ga4` (ou `buscar-ga4`) para popular `visitantes`, `carrinho`, `checkout` no formulário e marcar `importedFields.visitantes/carrinho/checkout = true`.

### 3. Ajustar telemetria/payload
- Atualizar `data_source_summary.ga4` (linha 909) e `ga4_connected` (linha 935) para refletir o estado real (`!!store.ga4_account_email`) em vez de hardcoded `false`.
- Atualizar `field_provenance` para marcar `visitantes/produto_visto/carrinho/checkout` como `"real"` quando vierem do GA4.

### 4. Remover/atualizar comentários obsoletos
Remover os comentários "GA4 removido do onboarding…" (linhas 189-191, 223) já que o fluxo volta a estar disponível.

## Arquivos afetados
- `src/pages/Onboarding.tsx` — adicionar card GA4 no Step 4, hook de OAuth + sync, ajustar payload/telemetria.
- (Opcional) extrair lógica reutilizável para `src/components/onboarding/GA4ConnectCard.tsx` para manter `Onboarding.tsx` limpo, reaproveitando padrão do `GoogleConnectionsCard`.

## Pré-requisitos (já existentes)
- Edge `google-oauth-callback` com suporte a `scope_set=ga4` ✅
- Secrets `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ✅
- Colunas `stores.ga4_account_email` / `ga4_property_id` ✅

Nada novo a configurar do lado de infra — basta a UI voltar a oferecer o botão.

## Fora de escopo
- Mexer em GA4 nas demais áreas (`/dashboard/configuracoes` continua igual).
- Alterar lógica de cálculo do `conversoComputedPct`.
