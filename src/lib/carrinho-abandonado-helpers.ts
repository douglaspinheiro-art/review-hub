/** Normaliza telefone BR (55…) alinhado ao webhook-cart / integration-gateway. */
export function normalizePhoneDigitsBr(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

/** Aceita apenas http(s) com URL válida (evita javascript: e similares). */
export function parseSafeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function buildCartRecoveryMessage(params: {
  customerName: string;
  cartValueFormatted: string;
  recoveryUrl: string | null;
}): string {
  const name = params.customerName.trim() || "cliente";
  const linkLine = params.recoveryUrl
    ? `\n\nFinalize em um clique: ${params.recoveryUrl}`
    : "\n\nAcesse a loja e retome seu pedido pelo carrinho.";
  return `Olá ${name}! Você deixou ${params.cartValueFormatted} em itens no carrinho.\n\nSua seleção ainda pode estar disponível.${linkLine}`;
}
