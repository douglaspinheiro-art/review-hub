/**
 * Normalize a Magento/Dizy-style store base URL.
 * Accepts: "xxx.dize.com.br", "https://xxx.dize.com.br", "https://xxx.dize.com.br/rest/V1"
 * Returns canonical: "https://xxx.dize.com.br" (no trailing slash, no /rest/V1).
 * Returns null when input is clearly invalid (empty, malformed host).
 */
export function normalizeStoreBaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Strip surrounding quotes/spaces
  s = s.replace(/^["']|["']$/g, "");

  // Add protocol for parsing if missing
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;

  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  // Basic host sanity: must contain a dot and only valid chars
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;

  // Strip known API suffixes from path
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/rest\/V\d+$/i, "");
  path = path.replace(/\/admin$/i, "");
  if (path === "/") path = "";

  return `https://${host}${path}`;
}
