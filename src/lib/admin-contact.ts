/**
 * Contato de suporte/ativação da plataforma.
 * Usado pela tela de "Aguardando ativação" (PendingActivationScreen)
 * para abrir o WhatsApp do cliente já com a mensagem pronta.
 */

/** Número (formato internacional, só dígitos) usado no link wa.me. */
export const ADMIN_WHATSAPP_NUMBER = "5511987062257";

/** E-mail de fallback caso o WhatsApp não funcione. */
export const ADMIN_SUPPORT_EMAIL = "suporte@ltvboost.com.br";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  enterprise: "Enterprise",
};

const PLAN_PRICES_MONTHLY: Record<string, string> = {
  starter: "R$ 197/mês",
  growth: "R$ 497/mês",
  scale: "R$ 997/mês",
  enterprise: "Sob consulta",
};

export interface ActivationMessageInput {
  fullName?: string | null;
  storeName?: string | null;
  email?: string | null;
  plan?: string | null;
  paidAt?: string | Date | null;
}

/** Monta a mensagem em texto plano que o cliente envia pelo WhatsApp. */
export function buildActivationMessage(input: ActivationMessageInput): string {
  const name = (input.fullName ?? "").trim() || "—";
  const store = (input.storeName ?? "").trim() || "—";
  const email = (input.email ?? "").trim() || "—";
  const planKey = (input.plan ?? "").toLowerCase();
  const planLabel = PLAN_LABELS[planKey] ?? (input.plan ?? "—");
  const planPrice = PLAN_PRICES_MONTHLY[planKey];
  const planLine = planPrice ? `${planLabel} (${planPrice})` : planLabel;

  const paid =
    input.paidAt instanceof Date
      ? input.paidAt
      : input.paidAt
      ? new Date(input.paidAt)
      : null;
  const paidLine =
    paid && !Number.isNaN(paid.getTime())
      ? paid.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
      : "—";

  return [
    "Olá! Acabei de assinar o LTV Boost e gostaria de liberar minha loja.",
    "",
    `Nome: ${name}`,
    `Loja: ${store}`,
    `E-mail: ${email}`,
    `Plano: ${planLine}`,
    `Pago em: ${paidLine}`,
    "",
    "Aguardo a configuração da API oficial do WhatsApp para começar a usar. Obrigado!",
  ].join("\n");
}

/** URL completa do wa.me com a mensagem já encodada. */
export function buildActivationWhatsAppUrl(input: ActivationMessageInput): string {
  const text = encodeURIComponent(buildActivationMessage(input));
  return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${text}`;
}

/** mailto: de fallback. */
export function buildActivationMailtoUrl(input: ActivationMessageInput): string {
  const subject = encodeURIComponent("Liberar minha loja no LTV Boost");
  const body = encodeURIComponent(buildActivationMessage(input));
  return `mailto:${ADMIN_SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}