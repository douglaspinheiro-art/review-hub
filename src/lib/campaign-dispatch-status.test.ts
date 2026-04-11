import { describe, it, expect } from "vitest";
import { campaignDispatchFinalStatus } from "./campaign-dispatch-status";

describe("campaignDispatchFinalStatus", () => {
  it("marca running quando há lote parcial pendente", () => {
    expect(campaignDispatchFinalStatus({
      partial: true,
      batchAttempted: 35,
      sentInBatch: 35,
      failedInBatch: 0,
    })).toBe("running");
  });

  it("marca completed quando não há tentativa (público vazio)", () => {
    expect(campaignDispatchFinalStatus({
      partial: false,
      batchAttempted: 0,
      sentInBatch: 0,
      failedInBatch: 0,
    })).toBe("completed");
  });

  it("marca failed quando todo o lote falhou", () => {
    expect(campaignDispatchFinalStatus({
      partial: false,
      batchAttempted: 10,
      sentInBatch: 0,
      failedInBatch: 10,
    })).toBe("failed");
  });

  it("marca completed quando houve envios com sucesso no lote", () => {
    expect(campaignDispatchFinalStatus({
      partial: false,
      batchAttempted: 10,
      sentInBatch: 7,
      failedInBatch: 3,
    })).toBe("completed");
  });
});
