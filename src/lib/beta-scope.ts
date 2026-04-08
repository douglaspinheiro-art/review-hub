function readBoolEnv(v: string | undefined): boolean {
  if (v == null || v === "") return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * When true, channel-heavy dashboard areas (WA, e-mail sends, inbox, automations
 * tied to recovery, abandoned cart monitor) are hidden and blocked for real users.
 * Demo routes (/demo/*) bypass this via pathname checks in the guard component.
 */
export const isBetaLimitedScope = readBoolEnv(import.meta.env.VITE_BETA_LIMITED_SCOPE);

const BLOCKED_DASHBOARD_PREFIXES = [
  "/dashboard/whatsapp",
  "/dashboard/newsletter",
  "/dashboard/campanhas",
  "/dashboard/inbox",
  "/dashboard/automacoes",
  "/dashboard/carrinho-abandonado",
] as const;

function normalizePath(pathname: string): string {
  const base = pathname.split("?")[0] ?? pathname;
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}

export function isDashboardPathBlockedInBetaScope(pathname: string): boolean {
  if (!isBetaLimitedScope) return false;
  const p = normalizePath(pathname);
  return BLOCKED_DASHBOARD_PREFIXES.some((b) => p === b || p.startsWith(`${b}/`));
}

export function shouldHideNavItemHref(href: string): boolean {
  if (!isBetaLimitedScope) return false;
  const path = normalizePath(href.split("#")[0].split("?")[0]);
  return BLOCKED_DASHBOARD_PREFIXES.some((b) => path === b || path.startsWith(`${b}/`));
}

export const BETA_LIMITED_BANNER_PT =
  "Beta: disparos por WhatsApp, e-mail marketing e SMS não estão disponíveis nesta fase. Análise, clientes e Convert seguem disponíveis.";
