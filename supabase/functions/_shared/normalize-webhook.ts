/**
 * Shared webhook normalization for all e-commerce platforms.
 * Used by: webhook-cart, integration-gateway, webhook-orders.
 *
 * Platforms with full normalization:
 *   shopify | woocommerce | nuvemshop | vtex | tray | yampi | magento | custom
 *
 * HMAC/token verification now requires a per-store secret from integrations.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NormalizedItem {
  id?: string | number;
  variant_id?: string | number;
  name?: string;
  quantity?: number;
  price: number;
  sku?: string;
  inventory_quantity?: number | null;
  category?: string | null;
  tags?: unknown[];
}

export interface NormalizedCartPayload {
  external_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  cart_value: number;
  cart_items: NormalizedItem[];
  recovery_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  shipping_value?: number;
  shipping_zip_code?: string | null;
  payment_failure_reason?: string | null;
  inventory_status?: Array<{ sku?: string; qty: number | null }>;
  abandon_step: string | null;
}

type SignatureSource = "shopify" | "woocommerce" | "nuvemshop" | "vtex" | "tray" | "yampi";

interface IntegrationRow {
  id: string;
  type: string | null;
  name: string | null;
  config: Record<string, unknown> | null;
  config_json: Record<string, unknown> | null;
  webhook_secret: string | null;
  webhook_token: string | null;
}

interface IntegrationsQueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

interface IntegrationsClient {
  from: (table: "integrations") => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => Promise<IntegrationsQueryResult>;
      };
    };
  };
}

type SecretResult =
  | { ok: true; secret: string }
  | { ok: false; error: string };

const SOURCE_ALIASES: Record<SignatureSource, string[]> = {
  shopify: ["shopify"],
  woocommerce: ["woocommerce", "woo_commerce", "woo"],
  nuvemshop: ["nuvemshop", "tiendanube", "linkedstore"],
  vtex: ["vtex"],
  tray: ["tray"],
  yampi: ["yampi"],
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function pickFromConfig(config: Record<string, unknown> | null, keys: string[]): string | null {
  if (!config) return null;
  for (const key of keys) {
    const value = readString(config[key]);
    if (value) return value;
  }
  return null;
}

function rowMatchesSource(row: IntegrationRow, source: SignatureSource): boolean {
  const aliases = SOURCE_ALIASES[source];
  const type = (row.type ?? "").toLowerCase();
  const name = (row.name ?? "").toLowerCase();
  return aliases.some((alias) => type.includes(alias) || name.includes(alias));
}

function extractSecretFromRow(row: IntegrationRow, source: SignatureSource): string | null {
  const mergedConfig = {
    ...(row.config_json ?? {}),
    ...(row.config ?? {}),
  };

  if (source === "nuvemshop") {
    return (
      readString(row.webhook_token) ??
      readString(row.webhook_secret) ??
      pickFromConfig(mergedConfig, ["webhook_token", "notification_token", "webhook_secret", "token"])
    );
  }

  if (source === "vtex") {
    return (
      readString(row.webhook_secret) ??
      pickFromConfig(mergedConfig, ["app_key", "webhook_secret", "api_key"])
    );
  }

  if (source === "tray") {
    return (
      readString(row.webhook_secret) ??
      pickFromConfig(mergedConfig, ["webhook_secret", "access_token", "store_token"])
    );
  }

  if (source === "yampi") {
    return (
      readString(row.webhook_secret) ??
      pickFromConfig(mergedConfig, ["webhook_secret", "secret_key", "token"])
    );
  }

  return (
    readString(row.webhook_secret) ??
    pickFromConfig(mergedConfig, ["webhook_secret", "client_secret", "secret", "webhookSigningSecret"])
  );
}

async function queryIntegrationsForStore(
  supabase: IntegrationsClient,
  storeId: string,
): Promise<{ data: IntegrationRow[]; error: string | null }> {
  const withDedicatedColumns = await supabase
    .from("integrations")
    .select("id,type,name,config,config_json,webhook_secret,webhook_token,is_active")
    .eq("store_id", storeId)
    .eq("is_active", true);

  if (!withDedicatedColumns.error) {
    return { data: (withDedicatedColumns.data ?? []) as IntegrationRow[], error: null };
  }

  // Backward compatibility for environments where webhook columns are not yet present.
  const fallback = await supabase
    .from("integrations")
    .select("id,type,name,config,config_json,is_active")
    .eq("store_id", storeId)
    .eq("is_active", true);

  if (fallback.error) {
    return { data: [], error: fallback.error.message };
  }

  const normalized = ((fallback.data ?? []) as Array<Omit<IntegrationRow, "webhook_secret" | "webhook_token">>)
    .map((row) => ({ ...row, webhook_secret: null, webhook_token: null }));
  return { data: normalized, error: null };
}

export async function getVerifierSecretForStore(
  supabase: IntegrationsClient,
  storeId: string,
  source: SignatureSource,
): Promise<SecretResult> {
  const { data, error } = await queryIntegrationsForStore(supabase, storeId);
  if (error) {
    return { ok: false, error: `Failed to load integrations: ${error}` };
  }

  const match = data.find((row) => rowMatchesSource(row, source));
  if (!match) {
    return {
      ok: false,
      error: `No active integration for source=${source} and store_id=${storeId}`,
    };
  }

  const secret = extractSecretFromRow(match, source);
  if (!secret) {
    return {
      ok: false,
      error: `Missing webhook credential for source=${source} and store_id=${storeId}`,
    };
  }

  return { ok: true, secret };
}

// ── Phone normalization ────────────────────────────────────────────────────────

/**
 * Normalizes a phone number toward E.164 format.
 *
 * Rules (in order):
 *   1. 13+ digits → already has country code, return as-is
 *   2. Starts with "55" + 10-11 digits (12-13 total) → Brazilian with code, return as-is
 *   3. 10-11 digits → assume Brazil (DDD + number), prepend "55"
 *   4. < 10 digits → return digits only (may be an extension / invalid; caller decides)
 *
 * International stores: numbers that already include the country code (12+ digits)
 * are returned untouched. This covers AR (+54), UY (+598), MX (+52), PT (+351), etc.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;           // already has country code
  if (digits.length >= 10) return `55${digits}`;    // Brazilian without prefix
  return digits;                                     // short / unknown
}

// ── HMAC verification ──────────────────────────────────────────────────────────

/**
 * Shopify: X-Shopify-Hmac-SHA256 = base64(HMAC-SHA256(rawBody, SHOPIFY_WEBHOOK_SECRET))
 * Returns true only when the signature matches the provided per-store secret.
 */
export async function verifyShopifyHmac(
  req: Request,
  rawBody: Uint8Array,
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  const header = req.headers.get("x-shopify-hmac-sha256");
  if (!header) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, rawBody as BufferSource);
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return expected === header;
}

/**
 * WooCommerce: X-WC-Webhook-Signature = base64(HMAC-SHA256(rawBody, WOOCOMMERCE_WEBHOOK_SECRET))
 * Returns true only when the signature matches the provided per-store secret.
 */
export async function verifyWooCommerceHmac(
  req: Request,
  rawBody: Uint8Array,
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  const header = req.headers.get("x-wc-webhook-signature");
  if (!header) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, rawBody as BufferSource);
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return expected === header;
}

/**
 * Nuvemshop/Tiendanube: fixed notification token in X-Linkedstore-Token header.
 * Returns true only when the token matches the provided per-store secret.
 */
export function verifyNuvemshopToken(req: Request, secret: string): boolean {
  if (!secret) return false;
  const header = req.headers.get("x-linkedstore-token") ??
    req.headers.get("x-notification-token") ?? "";
  if (!header) return false;

  const enc = new TextEncoder();
  const a = enc.encode(header);
  const b = enc.encode(secret);
  if (a.length !== b.length) return false;
  // @ts-expect-error Deno runtime expõe timingSafeEqual em crypto.subtle.
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * VTEX: X-VTEX-API-AppKey header must match the stored app_key for this store.
 * VTEX doesn't support standard HMAC — we verify the caller knows the app_key.
 */
export function verifyVtexAppKey(req: Request, secret: string): boolean {
  if (!secret) return false;
  const header = req.headers.get("x-vtex-api-appkey") ?? "";
  if (!header) return false;
  const enc = new TextEncoder();
  const a = enc.encode(header);
  const b = enc.encode(secret);
  if (a.length !== b.length) return false;
  // @ts-expect-error Deno runtime expõe timingSafeEqual em crypto.subtle.
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Tray: X-Tray-HMAC-SHA256 = base64(HMAC-SHA256(rawBody, TRAY_WEBHOOK_SECRET))
 * Tray Commerce supports HMAC signatures on webhook payloads.
 */
export async function verifyTrayHmac(
  req: Request,
  rawBody: Uint8Array,
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  const header = req.headers.get("x-tray-hmac-sha256") ?? req.headers.get("x-store-token") ?? "";
  if (!header) {
    // Tray fallback: if no HMAC header, verify via token in query string or body
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, rawBody as BufferSource);
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return expected === header;
}

/**
 * Yampi: X-Yampi-Hmac-SHA256 = base64(HMAC-SHA256(rawBody, YAMPI_WEBHOOK_SECRET))
 * Yampi supports HMAC webhook verification.
 */
export async function verifyYampiHmac(
  req: Request,
  rawBody: Uint8Array,
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  const header = req.headers.get("x-yampi-hmac-sha256") ?? req.headers.get("x-webhook-signature") ?? "";
  if (!header) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, rawBody as BufferSource);
  const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return expected === header;
}

// ── Source detection ───────────────────────────────────────────────────────────

/**
 * Detects the e-commerce platform from request headers and payload structure.
 * Priority: explicit `platform` field > header heuristics > payload field heuristics.
 */
export function detectSource(req: Request, payload: unknown): string {
  const p = payload as Record<string, unknown>;
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();

  // Explicit platform field (some integrators send this)
  if (typeof p?.platform === "string" && p.platform) {
    const pl = p.platform.toLowerCase();
    if (["shopify", "nuvemshop", "vtex", "woocommerce", "tray", "yampi", "shopee"].includes(pl)) {
      return pl;
    }
  }

  // Shopify: User-Agent or topic header
  if (ua.includes("shopify") || req.headers.get("x-shopify-topic")) return "shopify";

  // WooCommerce: header or payload field
  if (
    ua.includes("woocommerce") ||
    req.headers.get("x-wc-webhook-topic") ||
    (p as { cart_hash?: unknown })?.cart_hash != null
  ) return "woocommerce";

  // Nuvemshop/Tiendanube: their webhook token header or payload shape
  if (req.headers.get("x-linkedstore-token") || req.headers.get("x-notification-token")) return "nuvemshop";
  if ((p as { checkout?: unknown; store_id?: unknown })?.checkout != null &&
      (p as { store_id?: unknown })?.store_id != null) return "nuvemshop";

  // VTEX: OrderFormId (checkout hook) or Domain+orderId (order hook)
  if (
    (p as { OrderFormId?: unknown })?.OrderFormId != null ||
    ((p as { Domain?: unknown })?.Domain != null && (p as { orderId?: unknown })?.orderId != null)
  ) return "vtex";

  // Tray: `products` array + `url` at top level (their cart webhook shape)
  if (Array.isArray((p as { products?: unknown })?.products) &&
      typeof (p as { url?: unknown })?.url === "string") return "tray";

  // Yampi: customer with cellphone field
  if ((p as { customer?: { cellphone?: unknown } })?.customer?.cellphone != null) return "yampi";

  // Magento 2: customer_firstname / customer_lastname (Magento naming convention)
  if (
    (p as { customer_firstname?: unknown })?.customer_firstname != null ||
    (p as { billing_address?: { telephone?: unknown } })?.billing_address?.telephone != null
  ) return "magento";

  return "custom";
}

// ── Abandon step inference ─────────────────────────────────────────────────────

interface CheckoutLike {
  abandon_step?: string;
  step?: string;
  checkout_step?: string;
  last_payment_error_message?: string;
  payment_error_message?: string;
  email?: string;
  customer_email?: string;
  shipping_address?: { zip?: string; zip_code?: string };
  shipping_zip_code?: string;
  shipping_lines?: unknown[];
  customer?: { email?: string };
  contact?: { email?: string };
  [key: string]: unknown;
}

function inferAbandonStep(ch: CheckoutLike, source: string): string | null {
  const explicit = ch.abandon_step ?? ch.step ?? ch.checkout_step;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;

  if (source === "shopify") {
    if (ch.last_payment_error_message) return "payment";
    if (ch.shipping_address?.zip || (ch.shipping_lines ?? []).length > 0) return "shipping_or_delivery";
    if (ch.email || ch.customer?.email) return "contact_information";
    return "unknown";
  }
  if (ch.payment_error_message) return "payment";
  if (ch.shipping_address || ch.shipping_zip_code) return "shipping_or_delivery";
  if (ch.customer_email || ch.contact?.email) return "contact_information";
  return "unknown";
}

// ── Normalization ──────────────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

function toFloat(v: unknown): number {
  return parseFloat(String(v ?? 0)) || 0;
}

function toStr(v: unknown): string {
  return v != null ? String(v) : "";
}

function toInt(v: unknown): number {
  return parseInt(String(v ?? 0), 10) || 0;
}

function normalizeShopify(p: AnyRecord): NormalizedCartPayload {
  const ch = ((p.checkout ?? p) as AnyRecord) as CheckoutLike & AnyRecord;
  const items: NormalizedItem[] = ((ch.line_items || []) as AnyRecord[]).map((item) => ({
    id: toStr(item.product_id),
    variant_id: toStr(item.variant_id),
    name: toStr(item.title),
    quantity: toInt(item.quantity),
    price: toFloat(item.price),
    sku: toStr(item.sku),
    inventory_quantity: item.variant_inventory_management
      ? toInt(item.variant_inventory_policy)
      : null,
    category: toStr(item.product_type) || null,
    tags: (item.properties || []) as unknown[],
  }));

  const shipping = ch as {
    total_shipping_price_set?: { shop_money?: { amount?: unknown } };
    shipping_address?: { zip?: string };
    last_payment_error_message?: string;
    abandoned_checkout_url?: string;
    utm_source?: string; utm_medium?: string; utm_campaign?: string;
  };

  return {
    external_id: toStr((ch as { id?: unknown }).id),
    customer_name: `${(ch.customer as AnyRecord | undefined)?.first_name ?? ""} ${(ch.customer as AnyRecord | undefined)?.last_name ?? ""}`.trim(),
    customer_phone: normalizePhone(
      toStr((ch as { phone?: unknown }).phone || (ch.customer as AnyRecord | undefined)?.phone),
    ),
    customer_email: toStr((ch as { email?: unknown }).email || (ch.customer as AnyRecord | undefined)?.email) || undefined,
    cart_value: toFloat((ch as { total_price?: unknown }).total_price),
    cart_items: items,
    recovery_url: toStr(shipping.abandoned_checkout_url) || null,
    utm_source: toStr(shipping.utm_source) || null,
    utm_medium: toStr(shipping.utm_medium) || null,
    utm_campaign: toStr(shipping.utm_campaign) || null,
    shipping_value: toFloat(shipping.total_shipping_price_set?.shop_money?.amount),
    shipping_zip_code: shipping.shipping_address?.zip || null,
    payment_failure_reason: toStr(shipping.last_payment_error_message) || null,
    inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
    abandon_step: inferAbandonStep(ch, "shopify"),
  };
}

function normalizeWooCommerce(p: AnyRecord): NormalizedCartPayload {
  const ch = ((p.checkout ?? p) as AnyRecord) as CheckoutLike & AnyRecord;
  const billing = (ch.billing ?? {}) as AnyRecord;
  const items: NormalizedItem[] = ((ch.line_items || []) as AnyRecord[]).map((item) => ({
    id: toStr(item.product_id),
    name: toStr(item.name || item.product_name),
    quantity: toInt(item.quantity),
    price: toFloat(item.price || item.subtotal),
    sku: toStr(item.sku),
    inventory_quantity: null,
    category: null,
  }));

  return {
    external_id: toStr((ch as { id?: unknown; checkout_id?: unknown }).id || (ch as { checkout_id?: unknown }).checkout_id),
    customer_name: `${toStr(billing.first_name)} ${toStr(billing.last_name)}`.trim() || toStr(ch.customer_name),
    customer_phone: normalizePhone(toStr(billing.phone || (ch as { phone?: unknown }).phone)),
    customer_email: toStr(billing.email || ch.customer_email) || undefined,
    cart_value: toFloat((ch as { total?: unknown; cart_total?: unknown }).total || (ch as { cart_total?: unknown }).cart_total),
    cart_items: items,
    recovery_url: toStr((ch as { checkout_url?: unknown; payment_url?: unknown }).checkout_url || (ch as { payment_url?: unknown }).payment_url) || null,
    utm_source: toStr((ch as { utm_source?: unknown }).utm_source) || null,
    utm_medium: toStr((ch as { utm_medium?: unknown }).utm_medium) || null,
    utm_campaign: toStr((ch as { utm_campaign?: unknown }).utm_campaign) || null,
    shipping_value: toFloat((ch as { shipping_total?: unknown }).shipping_total),
    shipping_zip_code: toStr((ch.shipping as AnyRecord | undefined)?.postcode) || null,
    payment_failure_reason: toStr(ch.payment_error_message) || null,
    inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
    abandon_step: inferAbandonStep(ch, "woocommerce"),
  };
}

function normalizeNuvemshop(p: AnyRecord): NormalizedCartPayload {
  const ch = ((p.checkout ?? p) as AnyRecord) as CheckoutLike & AnyRecord;
  const contact = (ch.contact ?? {}) as AnyRecord;
  const items: NormalizedItem[] = (((ch.items || ch.products || []) as AnyRecord[])).map((item) => ({
    id: toStr(item.id || item.product_id),
    name: toStr(item.name || item.title),
    quantity: toInt(item.quantity),
    price: toFloat(item.price),
    sku: toStr(item.sku),
    inventory_quantity: toInt(item.stock) || null,
    category: toStr(item.category) || null,
  }));

  return {
    external_id: toStr((ch as { id?: unknown }).id),
    customer_name: toStr(ch.customer_name || contact.name),
    customer_phone: normalizePhone(toStr(ch.customer_phone || contact.phone)),
    customer_email: toStr(ch.customer_email || contact.email) || undefined,
    cart_value: toFloat((ch as { cart_value?: unknown; total?: unknown }).cart_value || (ch as { total?: unknown }).total),
    cart_items: items,
    recovery_url: toStr((ch as { recovery_url?: unknown; checkout_url?: unknown }).recovery_url || (ch as { checkout_url?: unknown }).checkout_url) || null,
    utm_source: toStr((ch as { utm_source?: unknown }).utm_source) || null,
    utm_medium: toStr((ch as { utm_medium?: unknown }).utm_medium) || null,
    utm_campaign: toStr((ch as { utm_campaign?: unknown }).utm_campaign) || null,
    shipping_value: toFloat((ch as { shipping_cost?: unknown }).shipping_cost),
    shipping_zip_code: toStr((ch as { shipping_zip_code?: unknown }).shipping_zip_code || (ch.shipping_address as AnyRecord | undefined)?.zip_code) || null,
    payment_failure_reason: toStr(ch.payment_error_message) || null,
    inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
    abandon_step: inferAbandonStep(ch, "nuvemshop"),
  };
}

function normalizeVTEX(p: AnyRecord): NormalizedCartPayload {
  // VTEX Checkout Hook: { OrderFormId, clientProfileData, items, totalizers, value, shippingData, ... }
  const orderFormId = toStr(p.OrderFormId || p.orderFormId || p.id);
  const profile = (p.clientProfileData ?? p.customer ?? {}) as AnyRecord;
  const shippingData = (p.shippingData ?? {}) as AnyRecord;
  const address = (shippingData.address ?? {}) as AnyRecord;

  // VTEX prices are in cents
  const toVTEXFloat = (v: unknown): number => toFloat(v) / 100;

  const rawItems: AnyRecord[] = (p.items || []) as AnyRecord[];
  const items: NormalizedItem[] = rawItems.map((item) => ({
    id: toStr(item.productId || item.id),
    variant_id: toStr(item.id),
    name: toStr(item.name || item.skuName),
    quantity: toInt(item.quantity),
    price: toVTEXFloat(item.price || item.sellingPrice),
    sku: toStr(item.refId || item.sku),
    inventory_quantity: null,
    category: toStr(item.category || item.productCategoryIds) || null,
  }));

  const totalizers: AnyRecord[] = (p.totalizers || []) as AnyRecord[];
  const shippingTotalizer = totalizers.find((t) => String(t.id).toLowerCase() === "shipping");
  const shippingValue = shippingTotalizer ? toVTEXFloat(shippingTotalizer.value) : 0;

  const phone = toStr(
    (p as { phone?: unknown }).phone ||
    profile.phone ||
    (profile.homePhone as string | undefined) ||
    (profile.businessPhone as string | undefined),
  );

  const paymentErr = toStr(
    (p as { lastPaymentError?: unknown }).lastPaymentError ||
    (p as { paymentError?: unknown }).paymentError,
  );

  return {
    external_id: orderFormId,
    customer_name: `${toStr(profile.firstName)} ${toStr(profile.lastName)}`.trim() || toStr(profile.name),
    customer_phone: normalizePhone(phone),
    customer_email: toStr(profile.email || (p as { email?: unknown }).email) || undefined,
    cart_value: toVTEXFloat((p as { value?: unknown; total?: unknown }).value || (p as { total?: unknown }).total),
    cart_items: items,
    recovery_url: toStr((p as { checkoutUrl?: unknown; cartUrl?: unknown }).checkoutUrl || (p as { cartUrl?: unknown }).cartUrl) || null,
    utm_source: toStr((p as { utm_source?: unknown }).utm_source) || null,
    utm_medium: toStr((p as { utm_medium?: unknown }).utm_medium) || null,
    utm_campaign: toStr((p as { utm_campaign?: unknown }).utm_campaign) || null,
    shipping_value: shippingValue,
    shipping_zip_code: toStr(address.postalCode || address.zipCode) || null,
    payment_failure_reason: paymentErr || null,
    inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
    abandon_step: paymentErr ? "payment" : null,
  };
}

function normalizeTray(p: AnyRecord): NormalizedCartPayload {
  // Tray checkout recovery webhook shape
  const customer = (p.customer ?? {}) as AnyRecord;
  const rawItems: AnyRecord[] = (p.products || p.items || []) as AnyRecord[];
  const items: NormalizedItem[] = rawItems.map((item) => ({
    id: toStr(item.id || item.product_id),
    name: toStr(item.name || item.title),
    quantity: toInt(item.quantity || item.qty),
    price: toFloat(item.price || item.unit_price),
    sku: toStr(item.reference || item.sku),
    inventory_quantity: toInt(item.stock) || null,
    category: toStr(item.category) || null,
  }));

  return {
    external_id: toStr((p as { id?: unknown }).id),
    customer_name: toStr(customer.name),
    customer_phone: normalizePhone(toStr(customer.phone || customer.telephone || customer.mobile_phone)),
    customer_email: toStr(customer.email) || undefined,
    cart_value: toFloat((p as { total?: unknown; cart_total?: unknown }).total || (p as { cart_total?: unknown }).cart_total),
    cart_items: items,
    recovery_url: toStr((p as { url?: unknown; recovery_url?: unknown }).url || (p as { recovery_url?: unknown }).recovery_url) || null,
    utm_source: toStr((p as { utm_source?: unknown }).utm_source) || null,
    utm_medium: toStr((p as { utm_medium?: unknown }).utm_medium) || null,
    utm_campaign: toStr((p as { utm_campaign?: unknown }).utm_campaign) || null,
    shipping_value: toFloat((p as { shipping_cost?: unknown; frete?: unknown }).shipping_cost || (p as { frete?: unknown }).frete),
    shipping_zip_code: toStr((p as { zipcode?: unknown; zip_code?: unknown }).zipcode || (p as { zip_code?: unknown }).zip_code) || null,
    payment_failure_reason: null,
    inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
    abandon_step: null,
  };
}

function normalizeYampi(p: AnyRecord): NormalizedCartPayload {
  // Yampi checkout recovery webhook shape
  const outer = ((p.checkout ?? p) as AnyRecord);
  const customer = (outer.customer ?? (p.customer ?? {})) as AnyRecord;
  const rawItems: AnyRecord[] = (outer.items || p.items || []) as AnyRecord[];
  const items: NormalizedItem[] = rawItems.map((item) => ({
    id: toStr(item.sku_id || item.id || item.product_id),
    name: toStr(item.name || item.title),
    quantity: toInt(item.quantity || item.qty),
    price: toFloat(item.price || item.unit_price),
    sku: toStr(item.sku || item.reference),
    inventory_quantity: null,
    category: null,
  }));

  // Yampi uses 'cellphone' instead of 'phone'
  const phone = toStr(customer.cellphone || customer.phone || customer.mobile);

  return {
    external_id: toStr((outer as { id?: unknown }).id || (p as { id?: unknown }).id),
    customer_name: toStr(customer.name),
    customer_phone: normalizePhone(phone),
    customer_email: toStr(customer.email) || undefined,
    cart_value: toFloat((outer as { total?: unknown }).total || (p as { total?: unknown }).total),
    cart_items: items,
    recovery_url: toStr((outer as { recovery_url?: unknown }).recovery_url || (p as { recovery_url?: unknown }).recovery_url) || null,
    utm_source: toStr((outer as { utm_source?: unknown }).utm_source || (p as { utm_source?: unknown }).utm_source) || null,
    utm_medium: toStr((outer as { utm_medium?: unknown }).utm_medium || (p as { utm_medium?: unknown }).utm_medium) || null,
    utm_campaign: toStr((outer as { utm_campaign?: unknown }).utm_campaign || (p as { utm_campaign?: unknown }).utm_campaign) || null,
    shipping_value: toFloat((outer as { shipping_cost?: unknown }).shipping_cost || (p as { shipping_cost?: unknown }).shipping_cost),
    shipping_zip_code: toStr((customer as { zip_code?: unknown; cep?: unknown }).zip_code || (customer as { cep?: unknown }).cep) || null,
    payment_failure_reason: null,
    inventory_status: items.map((i) => ({ sku: i.sku, qty: null })),
    abandon_step: null,
  };
}

function normalizeCustom(p: AnyRecord): NormalizedCartPayload {
  const ch = ((p.checkout ?? p) as AnyRecord) as CheckoutLike & AnyRecord;
  const contact = (ch.contact ?? {}) as AnyRecord;
  const items: NormalizedItem[] = (((ch.items || ch.products || []) as AnyRecord[])).map((item) => ({
    id: toStr(item.id || item.product_id),
    name: toStr(item.name || item.title),
    quantity: toInt(item.quantity),
    price: toFloat(item.price),
    sku: toStr(item.sku),
    inventory_quantity: toInt(item.stock) || null,
    category: toStr(item.category) || null,
  }));

  return {
    external_id: toStr((ch as { id?: unknown }).id),
    customer_name: toStr(ch.customer_name || contact.name),
    customer_phone: normalizePhone(toStr(ch.customer_phone || contact.phone)),
    customer_email: toStr(ch.customer_email || contact.email) || undefined,
    cart_value: toFloat((ch as { cart_value?: unknown; total?: unknown }).cart_value || (ch as { total?: unknown }).total),
    cart_items: items,
    recovery_url: toStr((ch as { recovery_url?: unknown; checkout_url?: unknown }).recovery_url || (ch as { checkout_url?: unknown }).checkout_url) || null,
    utm_source: toStr((ch as { utm_source?: unknown }).utm_source) || null,
    utm_medium: toStr((ch as { utm_medium?: unknown }).utm_medium) || null,
    utm_campaign: toStr((ch as { utm_campaign?: unknown }).utm_campaign) || null,
    shipping_value: toFloat((ch as { shipping_cost?: unknown }).shipping_cost),
    shipping_zip_code: toStr((ch as { shipping_zip_code?: unknown }).shipping_zip_code || (ch.shipping_address as AnyRecord | undefined)?.zip_code) || null,
    payment_failure_reason: toStr(ch.payment_error_message) || null,
    inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
    abandon_step: inferAbandonStep(ch, "custom"),
  };
}

function normalizeMagento(p: AnyRecord): NormalizedCartPayload {
  // Magento 2 abandoned cart webhook (via custom observer or third-party module).
  // Key fields: entity_id (quote_id), customer_firstname/lastname, billing_address.telephone,
  // items[].{item_id, sku, name, qty, price}, grand_total, discount_amount, shipping_amount.
  const billing = (p.billing_address ?? {}) as AnyRecord;
  const items: NormalizedItem[] = ((p.items || []) as AnyRecord[]).map((item) => ({
    id: toStr(item.item_id || item.product_id),
    name: toStr(item.name),
    quantity: toInt(item.qty || item.quantity),
    price: toFloat(item.price || item.row_total),
    sku: toStr(item.sku),
    inventory_quantity: null,
    category: toStr(item.product_type) || null,
  }));

  const phone = toStr(billing.telephone || (p as { phone?: unknown }).phone || "");

  return {
    external_id: toStr((p as { entity_id?: unknown; quote_id?: unknown }).entity_id || (p as { quote_id?: unknown }).quote_id),
    customer_name: `${toStr(p.customer_firstname)} ${toStr(p.customer_lastname)}`.trim() ||
      toStr(p.customer_name),
    customer_phone: normalizePhone(phone),
    customer_email: toStr(p.customer_email || (p as { email?: unknown }).email) || undefined,
    cart_value: toFloat(p.grand_total || p.subtotal),
    cart_items: items,
    recovery_url: toStr((p as { recovery_url?: unknown; checkout_url?: unknown }).recovery_url || (p as { checkout_url?: unknown }).checkout_url) || null,
    utm_source: toStr((p as { utm_source?: unknown }).utm_source) || null,
    utm_medium: toStr((p as { utm_medium?: unknown }).utm_medium) || null,
    utm_campaign: toStr((p as { utm_campaign?: unknown }).utm_campaign) || null,
    shipping_value: toFloat(p.shipping_amount || p.shipping_incl_tax),
    shipping_zip_code: toStr(billing.postcode || billing.zip_code) || null,
    payment_failure_reason: null,
    inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
    abandon_step: null,
  };
}

export function normalizePayload(source: string, p: unknown): NormalizedCartPayload {
  const payload = (p ?? {}) as AnyRecord;
  switch (source) {
    case "shopify":     return normalizeShopify(payload);
    case "woocommerce": return normalizeWooCommerce(payload);
    case "nuvemshop":   return normalizeNuvemshop(payload);
    case "vtex":        return normalizeVTEX(payload);
    case "tray":        return normalizeTray(payload);
    case "yampi":       return normalizeYampi(payload);
    case "magento":     return normalizeMagento(payload);
    default:            return normalizeCustom(payload);
  }
}
