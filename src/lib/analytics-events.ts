/**
 * Eventos sem PII para o wizard /diagnostico.
 * Ative com VITE_ENABLE_DIAGNOSTICO_ANALYTICS=true e, se usar GTM, publique no dataLayer.
 * Ao adicionar GA/Pixel ou outros trackers neste fluxo, alinhar política de cookies/LGPD e opt-out.
 */
export function trackDiagnosticoEvent(
  name: "diagnostico_step_view" | "diagnostico_plan_selected",
  props?: Record<string, string | number | boolean>
): void {
  if (import.meta.env.VITE_ENABLE_DIAGNOSTICO_ANALYTICS !== "true") return;
  const w = typeof window !== "undefined" ? window : null;
  if (!w) return;
  const dl = (w as Window & { dataLayer?: unknown[] }).dataLayer;
  if (Array.isArray(dl)) {
    dl.push({ event: name, ...props });
  }
}
