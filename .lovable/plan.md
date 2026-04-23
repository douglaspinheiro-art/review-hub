

# Plano: Aprovação manual da loja via WhatsApp do cliente (wa.me)

## Mudança em relação ao plano anterior

Em vez de a plataforma enviar a notificação para você via Meta Cloud API (que exige template aprovado e secrets `PLATFORM_META_*`), **o próprio cliente clica num botão que abre o WhatsApp dele já com a mensagem pronta** para o seu número (`5511987062257`). Mais simples, zero custo de API, zero dependência de template aprovado.

O resto do fluxo (estado `pending_activation`, tela de bloqueio, aba Aprovações no admin, configuração da Meta + integrações pelo admin, ativação manual) **continua igual**.

---

## Fluxo novo

```text
Cliente paga ──► MP webhook
                    │
                    └─► profiles.subscription_status = "pending_activation"
                        profiles.activation_requested_at = now()

Cliente faz login ──► DashboardLayout detecta pending_activation
                          │
                          └─► Renderiza <PendingActivationScreen>
                                ├─ "Pagamento confirmado ✅"
                                ├─ "Próximo passo: solicite a ativação no WhatsApp"
                                ├─ Resumo: nome / loja / e-mail / plano
                                └─ Botão grande verde:
                                   "📱 Solicitar ativação no WhatsApp"
                                       │
                                       └─► abre https://wa.me/5511987062257
                                           ?text=<mensagem pronta urlencoded>

Você (admin) recebe no WhatsApp ──► /admin → aba Aprovações
                                          │
                                          ├─ configura Meta WhatsApp + integrações
                                          └─ clica "Ativar loja"
                                                │
                                                └─► subscription_status = "active"
                                                    cliente recebe e-mail
                                                    próximo refresh libera dashboard
```

**Mensagem pré-preenchida** (exemplo):

```
Olá! Acabei de assinar o LTV Boost e gostaria de liberar minha loja.

Nome: João Silva
Loja: Loja do João
E-mail: joao@x.com
Plano: Growth (R$ 497/mês)
Pago em: 23/04/2026 14:32

Aguardo a configuração da API oficial do WhatsApp para começar a usar. Obrigado!
```

Botões secundários na tela:
- **"Já enviei, aguardando ativação"** — só registra um clique em telemetria; visualmente passa para o estado "Aguardando nossa equipe (~24h)".
- **"Copiar mensagem"** — fallback caso o `wa.me` falhe.
- **"Falar por e-mail"** — `mailto:` para o seu e-mail de suporte.

---

## O que vai ser construído

### 1. Banco (migration)

- Aceitar `"pending_activation"` em `subscription_status` (string, sem enum estrito hoje).
- Em `profiles`, novas colunas:
  - `activation_requested_at timestamptz`
  - `activation_message_sent_at timestamptz` (marcado quando o cliente clica em "Já enviei")
  - `activated_at timestamptz`
  - `activated_by uuid`
  - `activation_notes text`
- Índice em `subscription_status` para a listagem do admin.
- RPC `admin_activate_store(target_user_id uuid, notes text)` — `SECURITY DEFINER`, restrita a `has_role(auth.uid(), 'admin')`.
- RPC `mark_activation_message_sent()` — usuário marca o próprio profile como "mensagem enviada".

### 2. Webhook do Mercado Pago

`supabase/functions/mercadopago-webhook/index.ts`:
- No caminho `payment approved`, trocar `subscription_status = "active"` → `"pending_activation"` e setar `activation_requested_at = now()`.
- Manter audit log existente (`subscription_status_changed`).
- **Nada de chamada a Meta API** — a notificação fica do lado do cliente.

### 3. Frontend — tela de bloqueio

- `src/contexts/AuthContext.tsx`: adicionar `"pending_activation"` ao tipo `SubscriptionStatus`. `isPaid` = `false` para esse estado.
- Novo componente `src/components/dashboard/PendingActivationScreen.tsx`:
  - Card centralizado, dark mode, emerald accents.
  - Resumo do pedido (nome, loja, e-mail, plano, data).
  - Botão primário "📱 Solicitar ativação no WhatsApp" → abre `wa.me/5511987062257?text=<encoded>` em nova aba; também dispara RPC `mark_activation_message_sent`.
  - Botões secundários: copiar mensagem, "Já enviei", e-mail de suporte.
  - Estado pós-clique: badge "Mensagem enviada — aguardando ativação", com tempo médio estimado.
- `src/components/dashboard/DashboardLayout.tsx`: quando `subscription_status === "pending_activation"`, renderizar a tela em vez do dashboard, **liberando apenas** `/dashboard/billing` e `/dashboard/configuracoes`.
- `src/lib/next-step.ts` e `src/pages/Analisando.tsx`: tratar `pending_activation` como "não-active" sem reentrar no funil de paywall.

### 4. Admin — nova aba "Aprovações"

`src/pages/admin/Admin.tsx`:
- Adicionar `<TabsTrigger value="aprovacoes">✅ Aprovações</TabsTrigger>`.
- Novo componente `src/components/admin/PendingActivations.tsx`:
  - Lista lojas com `subscription_status = "pending_activation"`, ordenadas por `activation_requested_at` asc.
  - Card por loja: dono, e-mail, telefone, nome da loja, plataforma, plano, data do pagamento, "tempo aguardando", badge "Mensagem enviada" se `activation_message_sent_at` existir.
  - Botão **"Configurar integrações"** → abre drawer com:
    - Form Meta WhatsApp Cloud (App ID, Phone Number ID, WABA ID, Access Token, Verify Token) → grava em `whatsapp_connections` com `provider = "meta_cloud"`.
    - Atalho para `/admin/loja/:storeId/integracoes`.
  - Botão **"Ativar loja"** → RPC `admin_activate_store`, marca `activated_at` + `activated_by`, dispara edge `send-email` com template "loja ativada".
  - Botão "Adiar" → registra nota, não muda status.

### 5. Página `/admin/loja/:storeId/integracoes` (impersonação)

- Rota nova dentro de `AdminStaffRoute`.
- Reusa `<Integracoes />` em modo impersonado via RPC `admin_get_store_integrations(store_id)` (`SECURITY DEFINER`).

### 6. E-mail "loja ativada"

- Edge `send-email` invocada pela RPC/admin com template novo.
- Assunto: "Sua loja já está ativa no LTV Boost ✅"
- Corpo: link de login + checklist do que foi configurado.

### 7. Telemetria / auditoria

- `audit_logs` recebe:
  - `subscription_status_changed` com `to_status = "pending_activation"`.
  - `activation_message_clicked` (cliente abriu o `wa.me`).
  - `activation_message_marked_sent` (cliente clicou "Já enviei").
  - `store_activated_by_admin` com `metadata = { admin_id, target_user_id, notes }`.

---

## Detalhes importantes

- **Nada de secrets novos** — a notificação é client-side via `wa.me`, então não precisa de `PLATFORM_META_*` nem template aprovado.
- **Número fixo no código**: `5511987062257`. Deixo como constante exportada (`ADMIN_WHATSAPP_NUMBER`) para trocar fácil depois.
- **Migração de usuários atuais**: clientes com `subscription_status = "active"` ficam como estão. A regra nova vale só para novos pagamentos a partir do deploy.
- **Reembolso/cancelamento**: pagamento `pending_activation` cancelado/reembolsado segue o caminho normal do webhook (`canceled`).
- **Acesso parcial enquanto pendente**: libera apenas `/dashboard/billing` e `/dashboard/configuracoes`. Demais rotas redirecionam para a tela de "aguardando ativação".

---

## Arquivos novos

- `supabase/migrations/<ts>_pending_activation_flow.sql`
- `src/components/dashboard/PendingActivationScreen.tsx`
- `src/components/admin/PendingActivations.tsx`
- `src/pages/admin/AdminStoreIntegracoes.tsx`
- `src/lib/admin-contact.ts` (constante `ADMIN_WHATSAPP_NUMBER` + helper `buildActivationWhatsAppUrl`)

## Arquivos editados

- `supabase/functions/mercadopago-webhook/index.ts`
- `src/contexts/AuthContext.tsx`
- `src/components/dashboard/DashboardLayout.tsx`
- `src/lib/next-step.ts`
- `src/pages/Analisando.tsx`
- `src/pages/admin/Admin.tsx`
- `src/App.tsx` (rota `/admin/loja/:storeId/integracoes`)
- `src/integrations/supabase/types.ts` (regenerado pela migração)

