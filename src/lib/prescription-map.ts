import type { CampaignPrefill } from "@/components/dashboard/CampaignModal";
import type { PrescriptionProps } from "@/components/dashboard/PrescriptionCard";

/** Prescrição aprovada ou em disparo (aba "Em execução" / página Recovery). */
export function isPrescriptionInExecution(status: string | null | undefined): boolean {
  const s = status ?? "";
  return s === "em_execucao" || s === "aprovada";
}

/** Row shape from `prescriptions` + optional joined `opportunities` */
export type PrescriptionRow = {
  id: string;
  title: string;
  description?: string | null;
  execution_channel?: string | null;
  segment_target?: string | null;
  num_clients_target?: number | null;
  discount_value?: number | null;
  discount_type?: string | null;
  estimated_potential?: number | null;
  estimated_roi?: number | null;
  template_json?: Record<string, unknown> | null;
  status?: string | null;
  opportunities?: { estimated_impact?: number | null } | null;
};

const CANAIS: PrescriptionProps["canal"][] = ["whatsapp", "email", "sms", "multicanal"];

function normalizeCanal(raw: string | null | undefined): PrescriptionProps["canal"] {
  const c = (raw ?? "whatsapp").toLowerCase();
  return (CANAIS.includes(c as PrescriptionProps["canal"]) ? c : "whatsapp") as PrescriptionProps["canal"];
}

function normalizeDiscountTipo(raw: string | null | undefined): PrescriptionProps["desconto_tipo"] {
  if (raw === "percentual" || raw === "frete_gratis" || raw === "fixo") return raw;
  return "percentual";
}

function normalizeStatus(raw: string | null | undefined): PrescriptionProps["status"] {
  const s = raw ?? "aguardando_aprovacao";
  if (
    s === "aguardando_aprovacao" ||
    s === "aprovada" ||
    s === "em_execucao" ||
    s === "concluida" ||
    s === "rejeitada"
  ) {
    return s;
  }
  return "aguardando_aprovacao";
}

function templateMessage(tj: Record<string, unknown> | null | undefined): string | undefined {
  if (!tj) return undefined;
  const m =
    (typeof tj.mensagem === "string" && tj.mensagem) ||
    (typeof tj.mensagem_base === "string" && tj.mensagem_base) ||
    (typeof tj.message === "string" && tj.message);
  return m || undefined;
}

function abTestFromTemplate(tj: Record<string, unknown> | null | undefined): boolean {
  if (!tj) return false;
  return Boolean(tj.ab_test ?? tj.ab_teste_ativo);
}

/**
 * Map `segment_target` from DB / IA to campaign prefill.
 */
export function segmentTargetToCampaignPrefill(
  segmentTarget: string | null | undefined,
): Pick<CampaignPrefill, "segment" | "rfmSegment" | "objective"> {
  const raw = (segmentTarget ?? "").toLowerCase().trim().replace(/\s+/g, "_");

  const toRfm = (en: "champions" | "loyal" | "at_risk" | "lost" | "new") =>
    ({ rfmSegment: en, objective: "rebuy" as const });

  const direct: Record<string, Pick<CampaignPrefill, "segment" | "rfmSegment" | "objective">> = {
    all: { segment: "all", objective: "rebuy" },
    todos: { segment: "all", objective: "rebuy" },
    active: { segment: "active", objective: "rebuy" },
    ativos: { segment: "active", objective: "rebuy" },
    inactive: { segment: "inactive", objective: "recovery" },
    inativos: { segment: "inactive", objective: "recovery" },
    em_risco: { segment: "inactive", objective: "recovery" },
    hibernando: { segment: "inactive", objective: "recovery" },
    perdido: { segment: "inactive", objective: "recovery" },
    perdidos: { segment: "inactive", objective: "recovery" },
    vip: { segment: "vip", objective: "loyalty" },
    campiao: { segment: "vip", objective: "loyalty" },
    campeao: { segment: "vip", objective: "loyalty" },
    campeoes: { segment: "vip", objective: "loyalty" },
    fiel: { segment: "vip", objective: "loyalty" },
    fieis: { segment: "vip", objective: "loyalty" },
    carrinho: { segment: "cart_abandoned", objective: "recovery" },
    carrinho_abandonado: { segment: "cart_abandoned", objective: "recovery" },
    cart_abandoned: { segment: "cart_abandoned", objective: "recovery" },
    rfm_champions: { ...toRfm("champions") },
    rfm_loyal: { ...toRfm("loyal") },
    rfm_at_risk: { ...toRfm("at_risk") },
    rfm_lost: { ...toRfm("lost") },
    rfm_new: { ...toRfm("new") },
    champions: { ...toRfm("champions") },
    loyal: { ...toRfm("loyal") },
    at_risk: { ...toRfm("at_risk") },
    lost: { ...toRfm("lost") },
    new: { ...toRfm("new") },
  };

  if (direct[raw]) return direct[raw];

  return { segment: "all", objective: "rebuy" };
}

export function prescriptionRowToCardProps(
  row: PrescriptionRow,
  handlers?: { onAprovar?: () => void; onRejeitar?: () => void },
): PrescriptionProps {
  const tj = (row.template_json ?? null) as Record<string, unknown> | null;
  const oppImpact = row.opportunities?.estimated_impact;
  const justificativa =
    (typeof tj?.desconto_justificativa === "string" && tj.desconto_justificativa) ||
    (typeof tj?.justificativa === "string" && tj.justificativa) ||
    row.description ||
    undefined;
  const melhor_horario =
    (typeof tj?.melhor_horario === "string" && tj.melhor_horario) ||
    (typeof tj?.prazo === "string" && tj.prazo) ||
    undefined;

  return {
    id: row.id,
    titulo: row.title,
    canal: normalizeCanal(row.execution_channel),
    segmento: row.segment_target ?? "all",
    num_clientes: Math.max(0, Number(row.num_clients_target ?? 0)),
    desconto_valor: Number(row.discount_value ?? 0),
    desconto_tipo: normalizeDiscountTipo(row.discount_type),
    desconto_justificativa: justificativa,
    custo_estimado: Number((tj?.custo_estimado as number) ?? 0),
    potencial_estimado: Number(row.estimated_potential ?? oppImpact ?? 0),
    roi_estimado: Number(row.estimated_roi ?? 0),
    melhor_horario,
    ab_teste_ativo: abTestFromTemplate(tj),
    status: normalizeStatus(row.status),
    preview_msg: templateMessage(tj),
    onAprovar: handlers?.onAprovar,
    onRejeitar: handlers?.onRejeitar,
  };
}

export function prescriptionToCampaignPrefill(row: PrescriptionRow): CampaignPrefill {
  const canal = normalizeCanal(row.execution_channel);
  const channel = canal === "multicanal" ? "whatsapp" : canal;
  const seg = segmentTargetToCampaignPrefill(row.segment_target);
  const tj = (row.template_json ?? null) as Record<string, unknown> | null;
  const msg =
    templateMessage(tj)?.replace(/\[Nome\]/gi, "{{nome}}") ??
    row.description ??
    "";

  const prefill: CampaignPrefill = {
    prescriptionId: row.id,
    name: row.title,
    message: msg,
    channel,
    skipObjective: true,
    source: "ConvertIQ",
  };

  if (seg.rfmSegment) {
    prefill.rfmSegment = seg.rfmSegment;
    prefill.objective = seg.objective;
  } else {
    prefill.segment = seg.segment;
    prefill.objective = seg.objective;
  }

  return prefill;
}
