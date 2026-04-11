import { describe, expect, it } from "vitest";
import { buildCartRecoveryMessage, normalizePhoneDigitsBr, parseSafeHttpUrl } from "./carrinho-abandonado-helpers";

describe("normalizePhoneDigitsBr", () => {
  it("prefixa 55 quando faltam", () => {
    expect(normalizePhoneDigitsBr("11999998888")).toBe("5511999998888");
  });
  it("mantém 55 existente", () => {
    expect(normalizePhoneDigitsBr("+55 11 99999-8888")).toBe("5511999998888");
  });
});

describe("parseSafeHttpUrl", () => {
  it("aceita https", () => {
    expect(parseSafeHttpUrl("https://loja.com/checkout?x=1")).toBe("https://loja.com/checkout?x=1");
  });
  it("rejeita javascript:", () => {
    expect(parseSafeHttpUrl("javascript:alert(1)")).toBeNull();
  });
  it("rejeita vazio", () => {
    expect(parseSafeHttpUrl(null)).toBeNull();
    expect(parseSafeHttpUrl("   ")).toBeNull();
  });
});

describe("buildCartRecoveryMessage", () => {
  it("inclui link quando há URL segura", () => {
    const msg = buildCartRecoveryMessage({
      customerName: "Ana",
      cartValueFormatted: "R$ 10,00",
      recoveryUrl: "https://loja.com/cart",
    });
    expect(msg).toContain("Ana");
    expect(msg).toContain("R$ 10,00");
    expect(msg).toContain("https://loja.com/cart");
  });
  it("usa fallback sem URL", () => {
    const msg = buildCartRecoveryMessage({
      customerName: "",
      cartValueFormatted: "R$ 5,00",
      recoveryUrl: null,
    });
    expect(msg).toContain("cliente");
    expect(msg).toContain("Acesse a loja");
  });
});
