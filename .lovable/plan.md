

## Checkout transparente Mercado Pago — Brick embutido

Substituir o redirect atual (`window.location.href = init_point`) por um **modal com Payment Brick** do Mercado Pago em todos os 3 pontos de venda. O cliente paga cartão/PIX/boleto sem sair do site.

## Arquitetura

```text
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                        │
│  ┌───────────────┐    ┌──────────────────────────────┐  │
│  │ Botão "Assinar│───▶│ <CheckoutModal>              │  │
│  │   plano X"    │    │   Payment Brick (MP SDK)     │  │
│  └───────────────┘    │   ├ Cartão (tokeniza local)  │  │
│                       │   ├ PIX (gera QR + copia)    │  │
│                       │   └ Boleto (gera linha)      │  │
│                       └──────────────┬───────────────┘  │
│                                      │ token + dados    │
└──────────────────────────────────────┼───────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────┐
│  Edge Function: mercadopago-process-payment (NOVA)       │
│  1. Valida JWT do usuário                                │
│  2. POST /v1/payments na API do MP com token             │
│  3. Retorna status (approved/pending/rejected)           │
│  4. Webhook existente confirma e ativa subscription      │
└─────────────────────────────────────────────────────────┘
```

## Mudanças

### Backend
**Nova edge function** `supabase/functions/mercadopago-process-payment/index.ts`
- Recebe `{ plan_key, billing_cycle, payment_data }` do Brick (token de cartão OU dados PIX/boleto).
- Cria pagamento via `POST https://api.mercadopago.com/v1/payments` com `MERCADOPAGO_ACCESS_TOKEN`.
- `external_reference` igual ao da preference atual (`{user_id, plan_key, billing_cycle}`) para o webhook existente já reconhecer e ativar a assinatura.
- Retorna `{ status, status_detail, payment_id, qr_code?, qr_code_base64?, ticket_url? }`.

**Webhook existente** (`mercadopago-webhook`) — sem mudanças. Já ativa `subscription_status = active` via `external_reference`.

**Secrets** — usa `MERCADOPAGO_ACCESS_TOKEN` já configurado. Adicionar **public key** do MP como `VITE_MERCADOPAGO_PUBLIC_KEY` no `.env` (chave pública, segura no client).

### Frontend
**Novo componente** `src/components/checkout/MercadoPagoCheckoutModal.tsx`
- Carrega SDK MP via `@mercadopago/sdk-react` (Payment Brick).
- Renderiza modal com Brick configurado para cartão + PIX + boleto.
- `onSubmit` do Brick → chama edge function `mercadopago-process-payment`.
- Estados: idle → processando → approved (toast + redirect `/dashboard?welcome=1`) / pending (mostra QR PIX ou boleto inline) / rejected (mensagem clara, permite retry).

**Hook** `src/hooks/useMercadoPagoCheckout.ts`
- Centraliza abertura do modal + tracking (`trackFunnelEvent("checkout_started")`).
- API: `const { open } = useCheckout(); open({ planKey, billingCycle, source });`

**3 pontos de integração** — substituir o redirect por `open(...)`:
1. `src/pages/Planos.tsx` — botões dos 3 cards de plano
2. `src/pages/Resultado.tsx` (linha 196) — substituir `handleSubscribe`
3. `src/pages/dashboard/Billing.tsx` (linha 144) — substituir `openMercadoPagoCheckout`

### Dependência
- `npm i @mercadopago/sdk-react` (~50kB, oficial MP)

## UX dos 3 métodos

- **Cartão** → tokeniza no browser, processa, mostra "Aprovado!" em ~3s. Redirect imediato.
- **PIX** → mostra QR code + botão "Copiar código" inline no modal. Banner "Aguardando pagamento..." que faz polling no `payment_id` a cada 3s por até 5min. Webhook confirma em paralelo.
- **Boleto** → mostra linha digitável + botão "Baixar PDF" (link `ticket_url` do MP). Modal informa "Boleto compensa em 1-3 dias úteis. Você receberá email quando aprovado."

## Compliance / segurança

- Token de cartão **nunca** chega ao seu backend — Brick tokeniza no browser via SDK do MP, você só recebe o token (válido por 7 dias, single-use). PCI SAQ-A coberto.
- `VITE_MERCADOPAGO_PUBLIC_KEY` é pública por design (igual `VITE_SUPABASE_ANON_KEY`).
- Edge function valida JWT antes de processar (mesmo padrão da `create-preference` atual).

## Migração

A edge function `mercadopago-create-preference` **fica como fallback** — se o SDK falhar ao carregar (ad blocker, rede), o modal mostra botão "Pagar via página segura do Mercado Pago" que aciona o fluxo antigo de redirect. Zero risco de quebrar conversão.

## Detalhes técnicos

- **SDK init**: `initMercadoPago(publicKey, { locale: 'pt-BR' })` no `main.tsx`.
- **Brick config**: `{ amount, payer: { email }, paymentMethods: { creditCard: 'all', bankTransfer: ['pix'], ticket: ['bolbradesco'], maxInstallments: 12 } }`.
- **Polling PIX**: edge function auxiliar `mercadopago-payment-status?id=X` que retorna status atual (cache 2s).
- **Telemetria**: eventos `checkout_brick_loaded`, `checkout_payment_submitted`, `checkout_approved`, `checkout_rejected` (extensão do `funnel-telemetry` existente).

## Resultado esperado

- 3 pontos de venda com checkout que **não sai do site**
- Conversão tende a subir (menos friction de redirect, especialmente em mobile)
- PIX com QR inline = método mais rápido para fechar venda no Brasil
- Webhook + ativação de assinatura permanecem inalterados (sem risco de quebrar billing)

