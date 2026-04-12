import { describe, expect, it } from "vitest";
import { mapStripePriceIdToPlan, parseStripePriceToPlanMap, planFromStripeMetadata } from "./stripe-price-to-plan";

describe("parseStripePriceToPlanMap", () => {
  it("ignora JSON inválido", () => {
    expect(parseStripePriceToPlanMap("not-json")).toEqual({});
  });

  it("aceita mapeamento válido", () => {
    const m = parseStripePriceToPlanMap('{"price_x":"growth","price_y":"nope"}');
    expect(m.price_x).toBe("growth");
    expect(m.price_y).toBeUndefined();
  });
});

describe("mapStripePriceIdToPlan", () => {
  it("resolve price id", () => {
    expect(mapStripePriceIdToPlan("price_x", '{"price_x":"scale"}')).toBe("scale");
    expect(mapStripePriceIdToPlan("price_unknown", "{}")).toBeNull();
  });
});

describe("planFromStripeMetadata", () => {
  it("lê plan_tier", () => {
    expect(planFromStripeMetadata({ plan_tier: "enterprise" })).toBe("enterprise");
  });
});
