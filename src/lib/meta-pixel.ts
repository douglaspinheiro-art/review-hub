/**
 * Meta Pixel helpers.
 *
 * The base pixel + initial PageView are loaded inline in `index.html`
 * (pixel id 938383425713544). These helpers fire additional standard
 * and custom events from the SPA. All calls are no-ops when `fbq`
 * isn't on the window (SSR, ad-blockers, dev without network).
 */

type FbqArgs =
  | ["track", string, Record<string, unknown>?]
  | ["trackCustom", string, Record<string, unknown>?]
  | ["init", string]
  | [string, ...unknown[]];

declare global {
  interface Window {
    fbq?: (...args: FbqArgs) => void;
  }
}

function callFbq(...args: FbqArgs) {
  if (typeof window === "undefined") return;
  const fbq = window.fbq;
  if (typeof fbq !== "function") return;
  try {
    fbq(...args);
  } catch {
    // never throw from analytics
  }
}

/** Fire a standard Meta event (PageView, Lead, Purchase, etc.). */
export function trackPixel(
  event: string,
  params?: Record<string, unknown>,
): void {
  callFbq("track", event, params);
}

/** Fire a custom (non-standard) Meta event. */
export function trackPixelCustom(
  event: string,
  params?: Record<string, unknown>,
): void {
  callFbq("trackCustom", event, params);
}

/**
 * Map of pathname (or pathname prefix) → standard event + params.
 * The first matching entry (most specific first) is fired. PageView
 * is always fired separately on every navigation.
 */
type RouteEvent = {
  match: (path: string) => boolean;
  event: string;
  params?: Record<string, unknown>;
};

const ROUTE_EVENTS: RouteEvent[] = [
  // Funil de aquisição
  {
    match: (p) => p === "/signup",
    event: "Lead",
    params: { content_name: "Signup Page", content_category: "acquisition" },
  },
  {
    match: (p) => p === "/onboarding",
    event: "StartTrial",
    params: { content_name: "Onboarding", currency: "BRL" },
  },
  {
    match: (p) => p === "/resultado",
    event: "Lead",
    params: { content_name: "Diagnóstico Pronto", content_category: "qualified_lead" },
  },
  {
    match: (p) => p === "/diagnostico" || p === "/dashboard/diagnostico",
    event: "ViewContent",
    params: { content_name: "Diagnóstico de Receita", content_category: "diagnostic" },
  },
  {
    match: (p) => p === "/calculadora-abandono-carrinho",
    event: "Lead",
    params: { content_name: "Calculadora Abandono", content_category: "tool" },
  },
  {
    match: (p) => p === "/contato",
    event: "Contact",
    params: { content_name: "Contato" },
  },
  // Pricing / upgrade
  {
    match: (p) => p === "/planos" || p.startsWith("/planos/") || p === "/dashboard/planos" || p.startsWith("/dashboard/planos/"),
    event: "ViewContent",
    params: { content_name: "Pricing", content_category: "pricing" },
  },
  {
    match: (p) => p === "/upgrade",
    event: "ViewContent",
    params: { content_name: "Upgrade", content_category: "pricing" },
  },
  // Conteúdo público
  {
    match: (p) => p === "/benchmark" || p === "/relatorio-anual",
    event: "ViewContent",
    params: { content_name: "Benchmark / Relatório", content_category: "content" },
  },
  // Dashboard ativo (cliente pago) — segmentação para lookalike
  {
    match: (p) => p === "/dashboard",
    event: "ViewContent",
    params: { content_name: "Dashboard Home", content_category: "app" },
  },
];

/** Resolve and fire the standard event mapped to a given pathname. */
export function trackRoutePixelEvent(pathname: string): void {
  const hit = ROUTE_EVENTS.find((r) => r.match(pathname));
  if (!hit) return;
  trackPixel(hit.event, hit.params);
}

/** Fire PageView (used on every SPA navigation after initial load). */
export function trackPixelPageView(pathname?: string): void {
  trackPixel("PageView", pathname ? { page_path: pathname } : undefined);
}
