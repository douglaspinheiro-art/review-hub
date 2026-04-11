/**
 * Espelha a lógica de status final do disparo em lote (Edge dispatch-campaign).
 * Útil para testes e documentação do comportamento esperado.
 */
export function campaignDispatchFinalStatus(params: {
  partial: boolean;
  batchAttempted: number;
  sentInBatch: number;
  failedInBatch: number;
}): "running" | "failed" | "completed" {
  const { partial, batchAttempted, sentInBatch, failedInBatch } = params;
  if (partial) return "running";
  const allFailedInBatch = batchAttempted > 0 && sentInBatch === 0 && failedInBatch === batchAttempted;
  return allFailedInBatch ? "failed" : "completed";
}
