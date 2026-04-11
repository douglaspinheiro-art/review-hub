import { describe, it, expect } from "vitest";
import { scopeAttributionEventsForStore } from "@/lib/attribution-scope";

describe("scopeAttributionEventsForStore", () => {
  const events = [
    { attributed_campaign_id: "c1", order_value: 10 },
    { attributed_campaign_id: "c2", order_value: 20 },
    { attributed_campaign_id: null, order_value: 5 },
  ];

  it("retorna todos os eventos quando não há loja", () => {
    expect(scopeAttributionEventsForStore(events, null, ["c1"])).toEqual(events);
  });

  it("retorna todos quando a lista de campanhas da loja está vazia", () => {
    expect(scopeAttributionEventsForStore(events, "store-1", [])).toEqual(events);
  });

  it("remove eventos de campanhas de outra loja", () => {
    const scoped = scopeAttributionEventsForStore(events, "store-1", ["c1"]);
    expect(scoped).toEqual([
      { attributed_campaign_id: "c1", order_value: 10 },
      { attributed_campaign_id: null, order_value: 5 },
    ]);
  });
});
