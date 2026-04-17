/**
 * Regression: attribution events de outras lojas não devem vazar
 * para o dashboard da loja ativa (BUG-9 da auditoria).
 */
import { describe, it, expect } from "vitest";
import { scopeAttributionEventsForStore } from "@/lib/attribution-scope";

describe("scopeAttributionEventsForStore", () => {
  const evtA = { attributed_campaign_id: "camp-A", order_value: 100 };
  const evtB = { attributed_campaign_id: "camp-B", order_value: 200 };
  const evtAuto = { attributed_campaign_id: null, order_value: 50 };
  const events = [evtA, evtB, evtAuto];

  it("filtra eventos atribuídos a campanhas de outras lojas", () => {
    const result = scopeAttributionEventsForStore(events, "store-1", ["camp-A"]);
    expect(result).toContain(evtA);
    expect(result).not.toContain(evtB);
    // Eventos sem campanha (automação/UTM puro) são preservados
    expect(result).toContain(evtAuto);
  });

  it("sem storeId: retorna todos os eventos (modo legado)", () => {
    const result = scopeAttributionEventsForStore(events, null, ["camp-A"]);
    expect(result).toHaveLength(3);
  });

  it("sem campanhas da loja: retorna todos (não dá pra filtrar)", () => {
    const result = scopeAttributionEventsForStore(events, "store-1", []);
    expect(result).toHaveLength(3);
  });

  it("isolamento total quando todas as campanhas pertencem a outra loja", () => {
    const result = scopeAttributionEventsForStore([evtA, evtB], "store-1", ["camp-X"]);
    // Apenas eventos sem campanha sobreviveriam — aqui não há nenhum
    expect(result).toHaveLength(0);
  });
});
