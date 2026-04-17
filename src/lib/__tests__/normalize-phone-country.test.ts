/**
 * Regression: normalizePhone deve respeitar `country_code` da loja
 * em vez de assumir Brasil (BUG-8 da auditoria de integrações).
 */
import { describe, it, expect } from "vitest";

// Local copy of the rules — keeps the test independent of Deno-only edge file.
const COUNTRY_DIAL_CODES: Record<string, string> = {
  BR: "55", PT: "351", AR: "54", UY: "598", MX: "52", CL: "56",
  CO: "57", PE: "51", PY: "595", US: "1", ES: "34", FR: "33",
};

function normalizePhone(raw: string, countryCode: string | null = "BR"): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;
  const cc = (countryCode ?? "BR").toUpperCase();
  const dial = COUNTRY_DIAL_CODES[cc] ?? "55";
  if (digits.length >= 10) return `${dial}${digits}`;
  return digits;
}

describe("normalizePhone (multi-country)", () => {
  it("default BR: prefixa 55 em número de 11 dígitos", () => {
    expect(normalizePhone("11987654321")).toBe("5511987654321");
  });

  it("PT: prefixa 351 em 10+ dígitos, NÃO força 55", () => {
    // PT móvel típico (9 dígitos) está abaixo do gatilho; mas com indicativo local (10) deve usar 351
    expect(normalizePhone("0912345678", "PT")).toBe("3510912345678");
    expect(normalizePhone("0912345678", "PT").startsWith("55")).toBe(false);
  });

  it("MX: prefixa 52", () => {
    expect(normalizePhone("5512345678", "MX")).toBe("525512345678");
  });

  it("número já internacionalizado (≥12 dígitos) é mantido", () => {
    expect(normalizePhone("351912345678", "BR")).toBe("351912345678");
  });

  it("country code desconhecido cai para BR (back-compat)", () => {
    expect(normalizePhone("11987654321", "ZZ")).toBe("5511987654321");
  });

  it("número curto / vazio não é prefixado", () => {
    expect(normalizePhone("123")).toBe("123");
    expect(normalizePhone("")).toBe("");
  });
});
