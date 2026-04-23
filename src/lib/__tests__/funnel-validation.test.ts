import { describe, it, expect } from "vitest";
import {
  validateFunnelConsistency,
  computeRealSignalsPct,
  provenanceSource,
} from "@/lib/funnel-validation";

describe("validateFunnelConsistency", () => {
  const base = { visitantes: 1000, produto_visto: 500, carrinho: 200, checkout: 100, pedido: 30, ticket_medio: 250 };

  it("aceita funil consistente", () => {
    const r = validateFunnelConsistency(base);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("bloqueia produto > visitantes", () => {
    const r = validateFunnelConsistency({ ...base, produto_visto: 2000 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.field === "produto_visto")).toBe(true);
  });

  it("bloqueia checkout > carrinho", () => {
    const r = validateFunnelConsistency({ ...base, checkout: 500 });
    expect(r.ok).toBe(false);
  });

  it("bloqueia ticket fora da faixa", () => {
    expect(validateFunnelConsistency({ ...base, ticket_medio: 1 }).ok).toBe(false);
    expect(validateFunnelConsistency({ ...base, ticket_medio: 100_000 }).ok).toBe(false);
  });

  it("emite warning quando conversão > 50%", () => {
    const r = validateFunnelConsistency({ ...base, visitantes: 100, pedido: 80, checkout: 90, carrinho: 95, produto_visto: 100 });
    expect(r.warnings.some((w) => w.field === "pedido")).toBe(true);
  });
});

describe("computeRealSignalsPct + provenanceSource", () => {
  it("calcula percentual e classifica banda", () => {
    expect(computeRealSignalsPct({ a: "real", b: "real", c: "estimated" })).toBe(67);
    expect(provenanceSource(80)).toBe("real");
    expect(provenanceSource(40)).toBe("derived");
    expect(provenanceSource(10)).toBe("estimated");
  });
});