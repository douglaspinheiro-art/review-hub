/**
 * Validador puro de consistência de funil + ticket médio.
 * Sem dependência de React. Usado pelo Onboarding antes de finalizar.
 */

export interface FunnelValidationInput {
  visitantes: number;
  produto_visto: number;
  carrinho: number;
  checkout: number;
  pedido: number;
  ticket_medio: number;
}

export interface FunnelValidationIssue {
  field: string;
  message: string;
}

export interface FunnelValidationResult {
  ok: boolean;
  errors: FunnelValidationIssue[];
  warnings: FunnelValidationIssue[];
}

const TICKET_MIN = 5;
const TICKET_MAX = 50_000;

export function validateFunnelConsistency(input: FunnelValidationInput): FunnelValidationResult {
  const errors: FunnelValidationIssue[] = [];
  const warnings: FunnelValidationIssue[] = [];
  const { visitantes, produto_visto, carrinho, checkout, pedido, ticket_medio } = input;

  if (!Number.isFinite(visitantes) || visitantes < 0) {
    errors.push({ field: "visitantes", message: "Visitantes inválido." });
  }

  if (produto_visto > visitantes) {
    errors.push({ field: "produto_visto", message: "Produto visto não pode ser maior que visitantes." });
  }
  if (carrinho > Math.max(produto_visto, visitantes)) {
    errors.push({ field: "carrinho", message: "Carrinho não pode ser maior que produto visto." });
  }
  if (checkout > Math.max(carrinho, visitantes)) {
    errors.push({ field: "checkout", message: "Checkout não pode ser maior que carrinho." });
  }
  if (pedido > Math.max(checkout, visitantes)) {
    errors.push({ field: "pedido", message: "Pedidos não pode ser maior que checkout." });
  }

  if (!Number.isFinite(ticket_medio) || ticket_medio < TICKET_MIN || ticket_medio > TICKET_MAX) {
    errors.push({
      field: "ticket_medio",
      message: `Ticket médio deve estar entre R$ ${TICKET_MIN} e R$ ${TICKET_MAX.toLocaleString("pt-BR")}.`,
    });
  }

  // Warnings (não bloqueiam, mas alertam o usuário)
  if (visitantes > 0 && pedido > visitantes * 0.5) {
    warnings.push({
      field: "pedido",
      message: "Conversão acima de 50% é incomum — confira se os dados estão corretos.",
    });
  }
  if (visitantes > 0 && pedido === 0) {
    warnings.push({ field: "pedido", message: "Nenhum pedido informado — diagnóstico ficará limitado." });
  }
  if (ticket_medio < 30) {
    warnings.push({ field: "ticket_medio", message: "Ticket médio muito baixo. Confira o valor." });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Marca a proveniência de cada campo como `real` (declarado/integrado) ou `estimated` (heurística).
 * Usado para exibir score de confiabilidade no último passo do onboarding.
 */
export type FieldProvenance = Record<string, "real" | "estimated">;

export function computeRealSignalsPct(provenance: FieldProvenance): number {
  const entries = Object.values(provenance);
  if (entries.length === 0) return 0;
  const real = entries.filter((v) => v === "real").length;
  return Math.round((real / entries.length) * 100);
}

export function provenanceSource(pct: number): "real" | "derived" | "estimated" {
  if (pct >= 70) return "real";
  if (pct >= 30) return "derived";
  return "estimated";
}

export const ONBOARDING_DRAFT_VERSION = 2;

export interface OnboardingDraftEnvelope<T> {
  version: number;
  savedAt: string;
  data: T;
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraftEnvelope<T>> | T;
    // Legacy raw payload (sem envelope)
    if (!parsed || typeof parsed !== "object") return null;
    if ("version" in parsed && "data" in parsed) {
      if (parsed.version !== ONBOARDING_DRAFT_VERSION) {
        console.info(`[onboarding] Discarding draft v${parsed.version}, expected v${ONBOARDING_DRAFT_VERSION}`);
        return null;
      }
      return (parsed as OnboardingDraftEnvelope<T>).data;
    }
    // Legado (sem envelope) — aceita uma vez para retrocompat, mas será reescrito com envelope.
    return parsed as T;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, data: T): void {
  try {
    if (typeof localStorage === "undefined") return;
    const envelope: OnboardingDraftEnvelope<T> = {
      version: ONBOARDING_DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      data,
    };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* quota */
  }
}