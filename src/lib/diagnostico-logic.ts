import { PLANS } from "./pricing-constants";

export const MIN_TICKET_MEDIO = 1;
/** Evita divisão por (1 - taxaAbandono) quando abandono → 100%. */
export const MAX_TAXA_ABANDONO = 0.999;

export const TAXA_RECUPERACAO_WA: Record<string, number> = {
  "Moda": 0.20,
  "Calçados": 0.18,
  "Beleza & Cosméticos": 0.24,
  "Eletrônicos": 0.14,
  "Casa & Decoração": 0.17,
  "Alimentos & Bebidas": 0.12,
  "Suplementos": 0.22,
  "Esportes": 0.16,
  "Pets": 0.19,
  "Outros": 0.16,
};

export const TAXA_RECUPERACAO_EMAIL: Record<string, number> = {
  "Moda": 0.07,
  "Calçados": 0.06,
  "Beleza & Cosméticos": 0.09,
  "Eletrônicos": 0.05,
  "Casa & Decoração": 0.07,
  "Alimentos & Bebidas": 0.04,
  "Suplementos": 0.08,
  "Esportes": 0.06,
  "Pets": 0.07,
  "Outros": 0.06,
};

interface DiagnosticoInput {
  faturamento: number;
  clientes: number;
  ticketMedio: number;
  taxaAbandono: number;
  segmento: string;
}

/** Percentual 0–100 para barra "recuperado vs perdido" (sem NaN/Infinity). */
export function recoveryProgressPercent(receitaPerdida: number, receitaRecuperadaTotal: number): number {
  if (!Number.isFinite(receitaPerdida) || !Number.isFinite(receitaRecuperadaTotal) || receitaPerdida <= 0) {
    return 0;
  }
  const pct = (receitaRecuperadaTotal / receitaPerdida) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** Percentual arredondado para texto "+X% vs perdido". */
export function recoveryPercentLabel(receitaPerdida: number, receitaRecuperadaTotal: number): number {
  return Math.round(recoveryProgressPercent(receitaPerdida, receitaRecuperadaTotal));
}

export function calcDiagnostico({ faturamento, clientes, ticketMedio, taxaAbandono, segmento }: DiagnosticoInput) {
  const fat = Math.max(0, Number(faturamento) || 0);
  const cli = Math.max(0, Math.round(Number(clientes) || 0));
  const ticket = Math.max(MIN_TICKET_MEDIO, Number(ticketMedio) || MIN_TICKET_MEDIO);
  const abandono = Math.min(MAX_TAXA_ABANDONO, Math.max(0, Number(taxaAbandono) || 0));
  const oneMinus = Math.max(1e-9, 1 - abandono);

  const pedidosMes = fat / ticket;
  const carrinhosPerdidos = (pedidosMes / oneMinus) * abandono;
  const receitaPerdida = Math.max(0, carrinhosPerdidos * ticket);

  const taxaWA = TAXA_RECUPERACAO_WA[segmento] || 0.16;
  const taxaEmail = TAXA_RECUPERACAO_EMAIL[segmento] || 0.06;

  const receitaRecuperadaWA = receitaPerdida * taxaWA * 0.75;
  const receitaRecuperadaEmail = receitaPerdida * taxaEmail * 0.75;
  const receitaRecuperadaTotal = receitaRecuperadaWA + receitaRecuperadaEmail;

  const msgWAmes = Math.round(carrinhosPerdidos * 2.5);
  const msgEmailMes = Math.round(carrinhosPerdidos * 3);

  let planoSugerido: keyof typeof PLANS = "scale";
  if (cli <= 1000 && fat <= 80000) planoSugerido = "starter";
  else if (cli <= 5000 && fat <= 500000) planoSugerido = "growth";

  return {
    pedidosMes: Math.round(pedidosMes),
    carrinhosPerdidos: Math.round(carrinhosPerdidos),
    receitaPerdida,
    receitaRecuperadaWA,
    receitaRecuperadaEmail,
    receitaRecuperadaTotal,
    msgWAmes,
    msgEmailMes,
    planoSugerido,
  };
}
