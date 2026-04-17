
O plano OAuth (Fases 0→4.5) está implementado. O que falta é **operacionalizar** + **fechar pontas soltas**.

## Status do que foi entregue

```
✅ Fase 0  Hardening (assert_store_access + draft key per-store)
✅ Fase 1  Nuvemshop 1-clique
✅ Fase 2  WooCommerce assistido
⏸  Tray   código pronto, oculto da UI (problemas técnicos)
✅ Fase 4  Cache invalidation (integration-health, dashboard-snapshot)
✅ Fase 4.5 oauth-disconnect (revoke webhooks + scrub secrets)
✅ Fase 4.5 oauth-token-refresh (cron edge function criada)
```

## Próximos passos sugeridos (em ordem de prioridade)

### 1. Ativar o cron de token refresh — manual, 2 min
A edge function `oauth-token-refresh` está deployada mas **não está agendada**. Você precisa rodar este SQL no Supabase SQL Editor:

```sql
select cron.schedule(
  'oauth-token-refresh-daily',
  '0 4 * * *',
  $$
  select net.http_post(
    url:='https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-token-refresh',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body:='{}'::jsonb
  );
  $$
);
```

Sem isso, integrações WooCommerce com credenciais quebradas vão continuar marcadas como `connected` indefinidamente.

### 2. UI de "Desconectar" usando `oauth-disconnect` — 1 arquivo
A edge `oauth-disconnect` existe mas **nenhum botão no frontend a chama**. Hoje o usuário não tem como revogar uma integração pela UI. Precisa:
- Adicionar botão "Desconectar" no card de integração conectada em `Integracoes.tsx`
- Modal de confirmação ("Isso vai parar webhooks e sync")
- Chamar `supabase.functions.invoke('oauth-disconnect', { body: { store_id, type } })`
- Invalidar mesmas query keys de Fase 4

### 3. Smoke test E2E dos fluxos OAuth — verificação
Antes de declarar concluído, vale rodar manualmente:
- Conectar Nuvemshop → ver webhooks criados → desconectar → ver webhooks removidos
- Conectar WooCommerce → forçar credencial inválida → rodar `oauth-token-refresh` → ver `connection_status = degraded`

### 4. Pontas soltas opcionais
- **Hygiene pass** nos TS errors pré-existentes (`bulk-import-contacts`, `dispatch-campaign`, etc.) — ortogonal ao OAuth, mas suja o build
- **Reativar Tray** quando o problema técnico for resolvido (basta re-adicionar nas listas em `ecommerce-platforms.ts` + `Integracoes.tsx` + secrets `TRAY_CONSUMER_KEY/SECRET`)

## Recomendação

Atacar **#1 (você) + #2 (eu)** nesta sessão fecha o ciclo OAuth de ponta a ponta. #3 e #4 podem vir depois.
