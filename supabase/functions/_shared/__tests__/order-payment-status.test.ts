import { isOrderPaid, isOrderRefunded } from "../order-payment-status.ts";

Deno.test("Shopify: paid e partially_paid contam como pago", () => {
  if (!isOrderPaid("shopify", { financial_status: "paid" })) throw new Error("shopify paid");
  if (!isOrderPaid("shopify", { financial_status: "partially_paid" })) throw new Error("shopify partially_paid");
  if (isOrderPaid("shopify", { financial_status: "pending" })) throw new Error("shopify pending NÃO é pago");
});

Deno.test("WooCommerce: só 'completed' é pago — 'processing' não", () => {
  if (!isOrderPaid("woocommerce", { status: "completed" })) throw new Error("woo completed");
  if (isOrderPaid("woocommerce", { status: "processing" })) throw new Error("woo processing NÃO é pago");
  if (isOrderPaid("woocommerce", { status: "on-hold" })) throw new Error("woo on-hold NÃO é pago");
});

Deno.test("VTEX: payment-approved + invoiced são pagos; payment-pending não", () => {
  if (!isOrderPaid("vtex", { status: "payment-approved" })) throw new Error("vtex payment-approved");
  if (!isOrderPaid("vtex", { status: "invoiced" })) throw new Error("vtex invoiced");
  if (isOrderPaid("vtex", { status: "payment-pending" })) throw new Error("vtex payment-pending NÃO é pago");
});

Deno.test("Tray: aceita PT/EN", () => {
  if (!isOrderPaid("tray", { status: "aprovado" })) throw new Error("tray aprovado");
  if (!isOrderPaid("tray", { status: "PAID" })) throw new Error("tray PAID (case-insensitive)");
  if (isOrderPaid("tray", { status: "pendente" })) throw new Error("tray pendente NÃO é pago");
});

Deno.test("Refunds são detectados corretamente", () => {
  if (!isOrderRefunded("shopify", { financial_status: "refunded" })) throw new Error("shopify refunded");
  if (!isOrderRefunded("woocommerce", { status: "cancelled" })) throw new Error("woo cancelled");
  if (!isOrderRefunded("tray", { status: "estornado" })) throw new Error("tray estornado");
  if (isOrderRefunded("vtex", { status: "payment-approved" })) throw new Error("vtex paid não é refund");
});

Deno.test("Status desconhecido retorna false (estrito)", () => {
  if (isOrderPaid("yampi", { status: "weird_state" })) throw new Error("yampi unknown NÃO é pago");
  if (isOrderRefunded("magento", { status: "weird_state" })) throw new Error("magento unknown NÃO é refund");
});
