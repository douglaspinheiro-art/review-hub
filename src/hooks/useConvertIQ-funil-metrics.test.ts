import { describe, it, expect } from "vitest";
import { calcFunil, recoveryPctOfRevenue, MOCK_METRICAS, type MetricasFunil } from "./useConvertIQ";

describe("calcFunil", () => {
  it("calcula taxa de conversão e perda mensal", () => {
    const m: MetricasFunil = {
      visitantes: 1000,
      visualizacoes_produto: 800,
      adicionou_carrinho: 400,
      iniciou_checkout: 200,
      compras: 20,
      receita: 5000,
    };
    const { taxaConversao, perdaMensal, maiorGargalo } = calcFunil(m, 2.5, 250);
    expect(taxaConversao).toBe(2);
    expect(perdaMensal).toBeGreaterThanOrEqual(0);
    expect(maiorGargalo.label.length).toBeGreaterThan(0);
  });

  it("lida com visitantes zero sem NaN", () => {
    const m: MetricasFunil = {
      visitantes: 0,
      visualizacoes_produto: 0,
      adicionou_carrinho: 0,
      iniciou_checkout: 0,
      compras: 0,
      receita: 0,
    };
    const { taxaConversao, etapas } = calcFunil(m, 2.5, 250);
    expect(taxaConversao).toBe(0);
    expect(etapas.every((e) => Number.isFinite(e.barPct))).toBe(true);
  });

  it("usa mock base com meta padrão", () => {
    const r = calcFunil(MOCK_METRICAS, 2.5, 250);
    expect(r.taxaConversao).toBeGreaterThan(0);
    expect(r.etapas).toHaveLength(5);
  });
});

describe("recoveryPctOfRevenue", () => {
  it("retorna null quando receita <= 0", () => {
    expect(recoveryPctOfRevenue(100, 50, 0)).toBeNull();
    expect(recoveryPctOfRevenue(100, 50, -10)).toBeNull();
  });

  it("calcula percentagem quando receita > 0", () => {
    expect(recoveryPctOfRevenue(250, 250, 1000)).toBe(50);
    expect(recoveryPctOfRevenue(0, 0, 200)).toBe(0);
  });
});
