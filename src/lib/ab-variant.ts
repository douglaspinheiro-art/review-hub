/**
 * Atribuição estável de variantes A/B baseada em hash do user_id.
 * Mesmo usuário sempre recebe a mesma variante para o mesmo experimento —
 * permite medir conversão por variante via `funnel_telemetry_events`.
 *
 * Não usa armazenamento persistente: o cálculo é puro a partir do user_id +
 * nome do experimento, então não há risco de dessincronização entre sessões
 * ou dispositivos.
 */

export type AbVariant = "A" | "B";

/** Hash determinístico (FNV-1a 32-bit) — leve, sem dependências. */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pickAbVariant(experiment: string, subjectId: string | null | undefined): AbVariant {
  if (!subjectId) return "A";
  const bucket = hashString(`${experiment}:${subjectId}`) % 100;
  return bucket < 50 ? "A" : "B";
}