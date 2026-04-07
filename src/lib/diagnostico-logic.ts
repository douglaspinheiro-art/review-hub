import { PLANS } from "./pricing-constants";

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

export function calcDiagnostico({ faturamento, clientes, ticketMedio, taxaAbandono, segmento }: DiagnosticoInput) {
  const pedidosMes = faturamento / ticketMedio;
  const carrinhosPerdidos = (pedidosMes / (1 - taxaAbandono)) * taxaAbandono;
  const receitaPerdida = carrinhosPerdidos * ticketMedio;

  // Percentil 25 do benchmark (conservador)
  const taxaWA = TAXA_RECUPERACAO_WA[segmento] || 0.16;
  const taxaEmail = TAXA_RECUPERACAO_EMAIL[segmento] || 0.06;

  const receitaRecuperadaWA = receitaPerdida * taxaWA * 0.75;
  const receitaRecuperadaEmail = receitaPerdida * taxaEmail * 0.75;
  const receitaRecuperadaTotal = receitaRecuperadaWA + receitaRecuperadaEmail;

  const msgWAmes = Math.round(carrinhosPerdidos * 2.5);
  const msgEmailMes = Math.round(carrinhosPerdidos * 3);

  // Sugestão de plano baseada em clientes e faturamento
  let planoSugerido: keyof typeof PLANS = "scale";
  if (clientes <= 1000 && faturamento <= 80000) planoSugerido = "starter";
  else if (clientes <= 5000 && faturamento <= 500000) planoSugerido = "growth";

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
