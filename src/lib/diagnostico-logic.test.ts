import { describe, it, expect } from "vitest";
import {
  calcDiagnostico,
  recoveryProgressPercent,
  recoveryPercentLabel,
  MAX_TAXA_ABANDONO,
  MIN_TICKET_MEDIO,
} from "./diagnostico-logic";

const base = {
  faturamento: 100_000,
  clientes: 2000,
  ticketMedio: 200,
  taxaAbandono: 0.7,
  segmento: "Moda",
};

describe("calcDiagnostico", () => {
  it("retorna números finitos para entrada típica", () => {
    const d = calcDiagnostico(base);
    expect(Number.isFinite(d.receitaPerdida)).toBe(true);
    expect(Number.isFinite(d.receitaRecuperadaTotal)).toBe(true);
    expect(d.pedidosMes).toBeGreaterThanOrEqual(0);
    expect(d.receitaPerdida).toBeGreaterThanOrEqual(0);
  });

  it("taxaAbandono 0 não gera Infinity", () => {
    const d = calcDiagnostico({ ...base, taxaAbandono: 0 });
    expect(Number.isFinite(d.carrinhosPerdidos)).toBe(true);
    expect(Number.isFinite(d.receitaPerdida)).toBe(true);
  });

  it("taxaAbandono 1 é limitada (não divide por zero)", () => {
    const d = calcDiagnostico({ ...base, taxaAbandono: 1 });
    expect(Number.isFinite(d.carrinhosPerdidos)).toBe(true);
    expect(Number.isFinite(d.receitaPerdida)).toBe(true);
  });

  it("ticketMedio 0 ou negativo usa piso", () => {
    const d = calcDiagnostico({ ...base, ticketMedio: 0 });
    expect(d.pedidosMes).toBe(Math.round(base.faturamento / MIN_TICKET_MEDIO));
  });

  it("faturamento negativo trata como 0", () => {
    const d = calcDiagnostico({ ...base, faturamento: -5000 });
    expect(d.pedidosMes).toBe(0);
    expect(d.receitaPerdida).toBe(0);
  });

  it("usa taxas do segmento Eletrônicos", () => {
    const moda = calcDiagnostico({ ...base, segmento: "Moda" });
    const elec = calcDiagnostico({ ...base, segmento: "Eletrônicos" });
    expect(elec.receitaRecuperadaTotal).toBeLessThan(moda.receitaRecuperadaTotal);
  });

  it("segmento desconhecido usa fallback de taxas", () => {
    const d = calcDiagnostico({ ...base, segmento: "SegmentoInexistente" });
    expect(Number.isFinite(d.receitaRecuperadaTotal)).toBe(true);
  });

  it("plano starter para base pequena", () => {
    expect(
      calcDiagnostico({ ...base, clientes: 500, faturamento: 50000 }).planoSugerido
    ).toBe("starter");
  });
});

describe("recoveryProgressPercent", () => {
  it("0 quando receitaPerdida <= 0", () => {
    expect(recoveryProgressPercent(0, 100)).toBe(0);
    expect(recoveryProgressPercent(-1, 100)).toBe(0);
  });

  it("clamp 0–100", () => {
    expect(recoveryProgressPercent(100, 50)).toBe(50);
    expect(recoveryProgressPercent(100, 200)).toBe(100);
  });

  it("NaN nos argumentos retorna 0", () => {
    expect(recoveryProgressPercent(NaN, 10)).toBe(0);
  });
});

describe("recoveryPercentLabel", () => {
  it("arredonda como inteiro", () => {
    expect(recoveryPercentLabel(100, 33)).toBe(33);
  });
});

describe("MAX_TAXA_ABANDONO", () => {
  it("calc com abandono extremo permanece finito", () => {
    const d = calcDiagnostico({ ...base, taxaAbandono: 0.9999 });
    expect(Number.isFinite(d.receitaPerdida)).toBe(true);
    expect(MAX_TAXA_ABANDONO).toBeLessThan(1);
  });
});
