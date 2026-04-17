# E-commerce integration status matrix

Source-of-truth mapping between each platform's native order status and our internal `is_paid` semantics. Used by `webhook-orders` and `normalize-webhook.ts` to decide when to fire `post_purchase` automations and to credit attribution.

> **Rule:** `is_paid = true` only when payment has been **confirmed** by the platform. Faturado / processing / fulfilled are NOT enough.

| Platform | Native field | Confirmed-paid values | Pending values | Refunded values |
|---|---|---|---|---|
| **Shopify** | `financial_status` | `paid`, `partially_paid` | `pending`, `authorized` | `refunded`, `partially_refunded`, `voided` |
| **WooCommerce** | `status` | `completed` | `processing`, `on-hold`, `pending` | `refunded`, `cancelled`, `failed` |
| **VTEX** | `status` | `payment-approved`, `invoiced`, `handling`, `ready-for-handling` | `payment-pending`, `waiting-for-seller-confirmation` | `cancel`, `canceled` |
| **Magento 2 / Dizy** | `status` | `complete`, `processing` (after invoice), `shipped` | `pending`, `pending_payment`, `holded` | `closed`, `canceled` |
| **Tray** | `status` (PT/EN mixed) | `aprovado`, `pago`, `approved`, `paid` | `pendente`, `aguardando_pagamento`, `pending` | `cancelado`, `estornado`, `cancelled`, `refunded` |
| **Yampi** | `status.alias` | `paid`, `authorized` | `waiting_payment`, `pending` | `refunded`, `canceled` |
| **Nuvemshop** | `payment_status` (combined with `status`) | `paid` | `pending`, `authorized` | `refunded`, `voided`, `cancelled` |

## Decision rules

- `post_purchase` flow → fired **once** when `is_paid` flips from `false` → `true`.
- `cart_recovered` flow → fired when an `abandoned_carts` row matches a paid order within the attribution window.
- Refunds → handled by `webhook-refunds`, which sets `orders_v3.status = 'refunded'` and rolls back LTV/RFM aggregates.

## Known caveats

- **VTEX `invoiced`** does not always mean the customer was charged — for boleto/PIX flows, `payment-approved` is the safer signal. We accept both because most stores collect upfront, but document this for ops.
- **Tray** mixes Portuguese and English. The matcher is case-insensitive and accepts both.
- **Magento `processing`** status only counts as paid when an invoice was generated. Webhook payloads include `state = "processing"` even before payment for some configurations — when in doubt, defer to the `invoice_status` payload field.

## Phone normalization

`normalizePhone(raw, countryCode)` accepts the store's `country_code` (ISO 3166-1 alpha-2). When omitted it defaults to `BR` for backward compatibility. International stores must set `stores.country_code` (e.g. `PT`, `AR`, `MX`) so 10–11 digit national numbers are not forced into a Brazilian format.
