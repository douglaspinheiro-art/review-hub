/**
 * Automatic Webhook Registration Helper
 *
 * Registers webhook URLs on the e-commerce platform via their API.
 * Called from the dashboard after integration setup.
 *
 * POST /functions/v1/register-webhooks
 * Auth: JWT (user must be authenticated)
 *
 * Body: { store_id: UUID, platform: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkDistributedRateLimit,
  errorResponse,
  getClientIp,
  rateLimitedResponseWithRetry,
  z,
} from "../_shared/edge-utils.ts";
import { uuidSchema } from "../_shared/validation.ts";
import { decryptIntegrationConfig } from "../_shared/decrypt-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BodySchema = z.object({
  store_id: uuidSchema,
  platform: z.enum(["shopify", "woocommerce", "nuvemshop", "vtex", "yampi", "tray"]),
});

const InternalBodySchema = BodySchema.extend({
  user_id: uuidSchema,
});

interface WebhookResult {
  topic: string;
  status: "created" | "already_exists" | "failed";
  detail?: string;
  webhook_id?: string;
}

function getBaseUrl(): string {
  const ref = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
  return `https://${ref}.supabase.co/functions/v1`;
}

async function registerShopify(config: Record<string, unknown>, storeId: string): Promise<WebhookResult[]> {
  const shop = String(config.shop_url ?? "").replace(/\/$/, "");
  const token = String(config.access_token ?? "");
  if (!shop || !token) throw new Error("Shopify credentials missing");

  const base = `https://${shop}/admin/api/2024-01`;
  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
  const callbackBase = getBaseUrl();

  const topics = [
    { topic: "checkouts/create", target: `${callbackBase}/webhook-cart?store_id=${storeId}` },
    { topic: "orders/paid", target: `${callbackBase}/webhook-orders?store_id=${storeId}` },
    { topic: "orders/fulfilled", target: `${callbackBase}/webhook-orders?store_id=${storeId}` },
    { topic: "refunds/create", target: `${callbackBase}/webhook-refunds?store_id=${storeId}` },
  ];

  // Get existing webhooks
  const existingRes = await fetch(`${base}/webhooks.json`, { headers });
  const existing = existingRes.ok ? ((await existingRes.json()).webhooks ?? []) : [];
  const existingTopics = new Set(existing.map((w: { topic: string }) => w.topic));

  const results: WebhookResult[] = [];
  for (const { topic, target } of topics) {
    if (existingTopics.has(topic)) {
      results.push({ topic, status: "already_exists" });
      continue;
    }
    try {
      const res = await fetch(`${base}/webhooks.json`, {
        method: "POST",
        headers,
        body: JSON.stringify({ webhook: { topic, address: target, format: "json" } }),
      });
      if (res.ok) {
        const data = await res.json();
        results.push({ topic, status: "created", webhook_id: String(data.webhook?.id) });
      } else {
        results.push({ topic, status: "failed", detail: `${res.status}: ${await res.text()}` });
      }
    } catch (e) {
      results.push({ topic, status: "failed", detail: (e as Error).message });
    }
  }
  return results;
}

async function registerWooCommerce(config: Record<string, unknown>, storeId: string): Promise<WebhookResult[]> {
  const siteUrl = String(config.site_url ?? "").replace(/\/$/, "");
  const ck = String(config.consumer_key ?? "");
  const cs = String(config.consumer_secret ?? "");
  if (!siteUrl || !ck || !cs) throw new Error("WooCommerce credentials missing");

  const auth = btoa(`${ck}:${cs}`);
  const base = `${siteUrl}/wp-json/wc/v3`;
  const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
  const callbackBase = getBaseUrl();

  const topics = [
    { topic: "order.created", name: "LTV Boost - Order Created" },
    { topic: "order.updated", name: "LTV Boost - Order Updated" },
  ];

  const results: WebhookResult[] = [];
  for (const { topic, name } of topics) {
    try {
      const res = await fetch(`${base}/webhooks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          topic,
          delivery_url: `${callbackBase}/webhook-orders?store_id=${storeId}`,
          status: "active",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        results.push({ topic, status: "created", webhook_id: String(data.id) });
      } else {
        const text = await res.text();
        results.push({ topic, status: text.includes("already exists") ? "already_exists" : "failed", detail: text });
      }
    } catch (e) {
      results.push({ topic, status: "failed", detail: (e as Error).message });
    }
  }
  return results;
}

async function registerNuvemshop(config: Record<string, unknown>, storeId: string): Promise<WebhookResult[]> {
  const userId = String(config.user_id ?? "");
  const token = String(config.access_token ?? "");
  if (!userId || !token) throw new Error("Nuvemshop credentials missing");

  const base = `https://api.tiendanube.com/v1/${userId}`;
  const headers = {
    "Authentication": `bearer ${token}`,
    "User-Agent": "LTV Boost (suporte@ltvboost.com.br)",
    "Content-Type": "application/json",
  };
  const callbackBase = getBaseUrl();

  const events = [
    { event: "order/paid", url: `${callbackBase}/webhook-orders?store_id=${storeId}` },
    { event: "order/fulfilled", url: `${callbackBase}/webhook-orders?store_id=${storeId}` },
    { event: "cart/created", url: `${callbackBase}/webhook-cart?store_id=${storeId}` },
  ];

  const results: WebhookResult[] = [];
  for (const { event, url } of events) {
    try {
      const res = await fetch(`${base}/webhooks`, {
        method: "POST",
        headers,
        body: JSON.stringify({ event, url }),
      });
      if (res.ok) {
        const data = await res.json();
        results.push({ topic: event, status: "created", webhook_id: String(data.id) });
      } else {
        results.push({ topic: event, status: "failed", detail: `${res.status}` });
      }
    } catch (e) {
      results.push({ topic: event, status: "failed", detail: (e as Error).message });
    }
  }
  return results;
}

async function registerVTEX(_config: Record<string, unknown>, _storeId: string): Promise<WebhookResult[]> {
  // VTEX uses Master Data triggers and OMS hooks configured via admin panel.
  // Automatic webhook registration is limited — provide instructions.
  return [
    { topic: "orders/status-change", status: "failed", detail: "VTEX requires manual OMS hook setup in admin panel. See docs/meta-whatsapp-cloud-setup.md for instructions." },
  ];
}

async function registerYampi(config: Record<string, unknown>, storeId: string): Promise<WebhookResult[]> {
  const alias = String(config.alias ?? config.store_alias ?? "");
  const token = String(config.token ?? config.secret_key ?? config.access_token ?? "");
  if (!alias || !token) throw new Error("Yampi credentials missing");

  const base = `https://api.dooki.com.br/v2/${alias}`;
  const headers = { "User-Token": token, "Content-Type": "application/json" };
  const callbackBase = getBaseUrl();

  const events = [
    { event: "order.paid", url: `${callbackBase}/webhook-orders?store_id=${storeId}` },
    { event: "order.shipped", url: `${callbackBase}/webhook-orders?store_id=${storeId}` },
  ];

  const results: WebhookResult[] = [];
  for (const { event, url } of events) {
    try {
      const res = await fetch(`${base}/webhooks`, {
        method: "POST",
        headers,
        body: JSON.stringify({ event, url, active: true }),
      });
      if (res.ok) {
        const data = await res.json();
        results.push({ topic: event, status: "created", webhook_id: String(data.data?.id) });
      } else {
        results.push({ topic: event, status: "failed", detail: `${res.status}` });
      }
    } catch (e) {
      results.push({ topic: event, status: "failed", detail: (e as Error).message });
    }
  }
  return results;
}

async function registerTray(config: Record<string, unknown>, storeId: string): Promise<WebhookResult[]> {
  const apiAddress = String(config.api_address ?? "").replace(/\/$/, "");
  const token = String(config.access_token ?? "");
  if (!apiAddress || !token) throw new Error("Tray credentials missing");

  const callbackBase = getBaseUrl();

  const events = [
    { scope: "order_status_change", url: `${callbackBase}/webhook-orders?store_id=${storeId}` },
  ];

  const results: WebhookResult[] = [];
  for (const { scope, url } of events) {
    try {
      const res = await fetch(
        `https://${apiAddress}/web_api/hooks?access_token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, url }),
        },
      );
      if (res.ok) {
        results.push({ topic: scope, status: "created" });
      } else {
        results.push({ topic: scope, status: "failed", detail: `${res.status}` });
      }
    } catch (e) {
      results.push({ topic: scope, status: "failed", detail: (e as Error).message });
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseSvc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const supabaseAuth = createClient(supabaseUrl, supabaseAnon);

  let body: unknown;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }

  const internalSecret = Deno.env.get("EDGE_INTERNAL_CALLBACK_SECRET");
  const incomingSecret = req.headers.get("x-internal-secret") ?? "";

  if (internalSecret && incomingSecret === internalSecret) {
    const parsedInternal = InternalBodySchema.safeParse(body);
    if (!parsedInternal.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: parsedInternal.error.flatten().fieldErrors }),
        { status: 400, headers: corsHeaders },
      );
    }
    const { store_id, platform, user_id } = parsedInternal.data;
    const { data: store } = await supabaseSvc.from("stores").select("user_id").eq("id", store_id).single();
    if (!store || store.user_id !== user_id) return errorResponse("Store not found", 403);

    const rl = await checkDistributedRateLimit(
      supabaseSvc,
      `register-webhooks-internal:${store_id}`,
      8,
      60_000,
    );
    if (!rl.allowed) return rateLimitedResponseWithRetry(rl.retryAfterSeconds);

    // Inline continue: platform + store_id set; jump to integration fetch
    const { data: integration } = await supabaseSvc
      .from("integrations")
      .select("id, type, config, config_encrypted")
      .eq("store_id", store_id)
      .eq("is_active", true)
      .ilike("type", `%${platform}%`)
      .limit(1)
      .single();

    if (!integration) return errorResponse(`No active ${platform} integration found`, 404);

    let config: Record<string, unknown>;
    try {
      config = await decryptIntegrationConfig(supabaseSvc as any, integration.id);
    } catch (e) {
      return errorResponse(`Config error: ${(e as Error).message}`, 500);
    }

    let results: WebhookResult[];
    try {
      switch (platform) {
        case "shopify": results = await registerShopify(config, store_id); break;
        case "woocommerce": results = await registerWooCommerce(config, store_id); break;
        case "nuvemshop": results = await registerNuvemshop(config, store_id); break;
        case "vtex": results = await registerVTEX(config, store_id); break;
        case "yampi": results = await registerYampi(config, store_id); break;
        case "tray": results = await registerTray(config, store_id); break;
        default: return errorResponse(`Platform ${platform} not supported`, 422);
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 500, headers: corsHeaders,
      });
    }

    const registeredWebhooks = results
      .filter((r) => r.status === "created")
      .map((r) => ({ topic: r.topic, webhook_id: r.webhook_id }));

    if (registeredWebhooks.length > 0) {
      const existingJson = (integration as any).config_json ?? {};
      await supabaseSvc
        .from("integrations")
        .update({
          config_json: {
            ...existingJson,
            registered_webhooks: [
              ...(existingJson.registered_webhooks ?? []),
              ...registeredWebhooks,
            ],
          },
        })
        .eq("id", integration.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        platform,
        results,
        summary: {
          created: results.filter((r) => r.status === "created").length,
          already_exists: results.filter((r) => r.status === "already_exists").length,
          failed: results.filter((r) => r.status === "failed").length,
        },
      }),
      { status: 200, headers: corsHeaders },
    );
  }

  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!jwt) return errorResponse("Unauthorized", 401);

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(jwt);
  if (authErr || !user) return errorResponse("Unauthorized", 401);

  const ip = getClientIp(req);
  const rl = await checkDistributedRateLimit(supabaseSvc, `register-webhooks:${user.id}:${ip}`, 5, 60_000);
  if (!rl.allowed) return rateLimitedResponseWithRetry(rl.retryAfterSeconds);

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: corsHeaders,
    });
  }

  const { store_id, platform } = parsed.data;

  // Verify store ownership
  const { data: store } = await supabaseSvc.from("stores").select("user_id").eq("id", store_id).single();
  if (!store || store.user_id !== user.id) return errorResponse("Store not found", 403);

  // Get integration
  const { data: integration } = await supabaseSvc
    .from("integrations")
    .select("id, type, config, config_encrypted")
    .eq("store_id", store_id)
    .eq("is_active", true)
    .ilike("type", `%${platform}%`)
    .limit(1)
    .single();

  if (!integration) return errorResponse(`No active ${platform} integration found`, 404);

  // Decrypt config
  let config: Record<string, unknown>;
  try {
    config = await decryptIntegrationConfig(supabaseSvc as any, integration.id);
  } catch (e) {
    return errorResponse(`Config error: ${(e as Error).message}`, 500);
  }

  // Register webhooks
  let results: WebhookResult[];
  try {
    switch (platform) {
      case "shopify": results = await registerShopify(config, store_id); break;
      case "woocommerce": results = await registerWooCommerce(config, store_id); break;
      case "nuvemshop": results = await registerNuvemshop(config, store_id); break;
      case "vtex": results = await registerVTEX(config, store_id); break;
      case "yampi": results = await registerYampi(config, store_id); break;
      case "tray": results = await registerTray(config, store_id); break;
      default: return errorResponse(`Platform ${platform} not supported`, 422);
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: corsHeaders,
    });
  }

  // Store registered webhook IDs in integration config
  const registeredWebhooks = results
    .filter((r) => r.status === "created")
    .map((r) => ({ topic: r.topic, webhook_id: r.webhook_id }));

  if (registeredWebhooks.length > 0) {
    const existingJson = (integration as any).config_json ?? {};
    await supabaseSvc
      .from("integrations")
      .update({
        config_json: {
          ...existingJson,
          registered_webhooks: [
            ...(existingJson.registered_webhooks ?? []),
            ...registeredWebhooks,
          ],
        },
      })
      .eq("id", integration.id);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      platform,
      results,
      summary: {
        created: results.filter((r) => r.status === "created").length,
        already_exists: results.filter((r) => r.status === "already_exists").length,
        failed: results.filter((r) => r.status === "failed").length,
      },
    }),
    { status: 200, headers: corsHeaders },
  );
});
