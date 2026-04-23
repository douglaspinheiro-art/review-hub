/**
 * UTM injection helper — adiciona parâmetros UTM **apenas** em URLs do domínio da loja.
 *
 * Regras (R1 do plano aprovado):
 *  - Allowlist: somente o host (e subdomínios) de `storeUrl` recebe UTMs.
 *  - Denylist explícita: wa.me, api.whatsapp.com, *.meta.com, *.facebook.com,
 *    URLs de unsubscribe internas e de tracking (`/track-email-*`, `/track-whatsapp-click`).
 *  - Nunca sobrescreve um parâmetro UTM já existente (a campanha pode tê-lo definido manualmente).
 *  - Sem `storeUrl` válido → retorna a string original (fail-safe).
 *
 * Uso típico (worker no envio):
 *   const safe = injectUtmInUrls(content, {
 *     storeUrl: store.url,
 *     utm: { source: "ltvboost", medium: "whatsapp", campaign: campaignId, content: contactId },
 *   });
 */

export interface UtmParams {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
}

export interface InjectUtmOptions {
  /** URL canônica da loja (ex.: stores.url). Define o domínio permitido. */
  storeUrl: string | null | undefined;
  utm: UtmParams;
  /** Hosts adicionais permitidos (ex.: domínio de checkout/whitelabel). */
  extraAllowedHosts?: string[];
}

const DENY_HOST_SUFFIXES = [
  "wa.me",
  "api.whatsapp.com",
  "whatsapp.com",
  "meta.com",
  "facebook.com",
  "fbcdn.net",
  "instagram.com",
] as const;

const DENY_PATH_PATTERNS = [
  /\/unsubscribe(\b|\/)/i,
  /\/track-email-(open|click)/i,
  /\/track-whatsapp-click/i,
  /\/functions\/v1\/(unsubscribe|track-)/i,
] as const;

function safeHost(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatches(target: string, allowed: string): boolean {
  if (target === allowed) return true;
  return target.endsWith(`.${allowed}`);
}

function isDenied(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  for (const suffix of DENY_HOST_SUFFIXES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return true;
  }
  for (const re of DENY_PATH_PATTERNS) {
    if (re.test(url.pathname)) return true;
  }
  return false;
}

function applyUtm(url: URL, utm: UtmParams): void {
  const map: Record<string, string | null | undefined> = {
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    utm_content: utm.content,
    utm_term: utm.term,
  };
  for (const [key, raw] of Object.entries(map)) {
    if (raw == null || raw === "") continue;
    if (url.searchParams.has(key)) continue; // never override existing
    url.searchParams.set(key, String(raw));
  }
}

/** Decide se uma URL absoluta pode receber UTM (allowlist + denylist). */
export function shouldInjectUtm(
  rawUrl: string,
  storeHost: string | null,
  extraAllowedHosts: string[] = [],
): boolean {
  if (!storeHost) return false;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (isDenied(url)) return false;
  const host = url.hostname.toLowerCase();
  if (hostMatches(host, storeHost)) return true;
  for (const extra of extraAllowedHosts) {
    const h = safeHost(extra);
    if (h && hostMatches(host, h)) return true;
  }
  return false;
}

/**
 * Encontra URLs absolutas (http/https) num texto livre e injeta UTMs nas que passam pelo filtro.
 * Preserva trailing punctuation comum (`.`, `,`, `;`, `)`, `]`, `>`) que não faz parte da URL.
 */
export function injectUtmInUrls(
  text: string,
  options: InjectUtmOptions,
): string {
  if (!text) return text;
  const storeHost = safeHost(options.storeUrl);
  if (!storeHost) return text;

  // Captura URLs http(s) — para de comer caracteres em whitespace ou aspas/colchetes/parênteses comuns.
  const URL_RE = /https?:\/\/[^\s<>"']+/gi;
  return text.replace(URL_RE, (match) => {
    // Strip trailing punctuation that is rarely part of the URL.
    const trailingMatch = match.match(/[).,;:!?\]]+$/);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const core = trailing ? match.slice(0, -trailing.length) : match;

    if (!shouldInjectUtm(core, storeHost, options.extraAllowedHosts)) return match;
    try {
      const url = new URL(core);
      applyUtm(url, options.utm);
      return url.toString() + trailing;
    } catch {
      return match;
    }
  });
}