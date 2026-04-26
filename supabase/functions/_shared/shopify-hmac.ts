/**
 * Shared Shopify HMAC helpers — used by oauth-shopify (install flow) and
 * shopify-compliance-webhooks (GDPR endpoints).
 *
 * Two flavors:
 *   - verifyShopifyQueryHmac: validates `?...&hmac=...` on the install request
 *     (signed over the sorted, URL-encoded query string with the app secret).
 *   - verifyShopifyBodyHmac: validates `X-Shopify-Hmac-Sha256` header on a
 *     webhook POST (signed over the raw request body with the app secret).
 *
 * Both use timing-safe comparison and return false (never throw) on any
 * malformed input — fail-closed by design.
 */

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Base64(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, body as BufferSource);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Validates the `hmac` query parameter that Shopify appends on install /
 * authorize requests. Per Shopify spec:
 *   - take all query params except `hmac` and `signature`
 *   - sort them alphabetically by key
 *   - join them as `key=value&key=value` (NOT URL-encoded)
 *   - HMAC-SHA256 with the app's client secret
 *   - compare hex digest, lowercase, timing-safe with the `hmac` param
 */
export async function verifyShopifyQueryHmac(url: URL, secret: string): Promise<boolean> {
  if (!secret) return false;
  const provided = url.searchParams.get("hmac");
  if (!provided) return false;

  const entries: Array<[string, string]> = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "hmac" || k === "signature") continue;
    entries.push([k, v]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = entries.map(([k, v]) => `${k}=${v}`).join("&");

  const expected = await hmacSha256Hex(secret, message);
  return timingSafeEqualStr(expected.toLowerCase(), provided.toLowerCase());
}

/**
 * Validates the `X-Shopify-Hmac-Sha256` header on a webhook POST.
 * The signature is base64(HMAC-SHA256(rawBody, app_secret)).
 */
export async function verifyShopifyBodyHmac(
  req: Request,
  rawBody: Uint8Array,
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  const provided = req.headers.get("x-shopify-hmac-sha256");
  if (!provided) return false;
  const expected = await hmacSha256Base64(secret, rawBody);
  return timingSafeEqualStr(expected, provided);
}

/**
 * Validates that the `shop` query parameter is a real myshopify.com domain.
 * Shopify recommends rejecting any other shape to avoid open-redirect abuse.
 */
export function isValidShopDomain(shop: string | null): shop is string {
  if (!shop) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}