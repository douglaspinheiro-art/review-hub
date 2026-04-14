/**
 * Bulk Import Contacts
 *
 * Upserts up to 5,000 contacts from JSON into customers_v3 + contacts tables.
 *
 * POST /functions/v1/bulk-import-contacts
 * Auth: JWT (user must be authenticated)
 *
 * Body: { store_id: UUID, contacts: Array<{ phone, email?, name?, tags? }> }
 * Response: { imported: number, skipped: number, errors: Array<{ row, reason }> }
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const MAX_CONTACTS = 5000;
const BATCH_SIZE = 200;

const ContactSchema = z.object({
  phone: z.string().min(8).max(20),
  email: z.string().email().optional().nullable(),
  name: z.string().max(255).optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional().nullable(),
});

const BodySchema = z.object({
  store_id: uuidSchema,
  contacts: z.array(z.unknown()).min(1).max(MAX_CONTACTS),
});

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // Auth
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseSvc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const supabaseAuth = createClient(supabaseUrl, supabaseAnon);

  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!jwt) return errorResponse("Unauthorized", 401);

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(jwt);
  if (authErr || !user) return errorResponse("Unauthorized", 401);

  // Rate limit: 10 requests/min per user
  const ip = getClientIp(req);
  const rl = await checkDistributedRateLimit(supabaseSvc, `bulk-import:${user.id}:${ip}`, 10, 60_000);
  if (!rl.allowed) return rateLimitedResponseWithRetry(rl.retryAfterSeconds);

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: corsHeaders,
    });
  }

  const { store_id, contacts: rawContacts } = parsed.data;

  // Verify store belongs to user
  const { data: store } = await supabaseSvc
    .from("stores")
    .select("user_id")
    .eq("id", store_id)
    .single();

  if (!store || store.user_id !== user.id) {
    // Check team membership
    const { data: member } = await supabaseSvc
      .from("membros_loja")
      .select("role")
      .eq("store_id", store_id)
      .eq("user_id", user.id)
      .single();

    if (!member || !["admin", "owner"].includes(member.role)) {
      return errorResponse("Store not found or access denied", 403);
    }
  }

  const storeUserId = store?.user_id ?? user.id;

  // Process contacts
  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  // Validate all contacts first
  const validContacts: Array<{ index: number; phone: string; email?: string | null; name?: string | null; tags?: string[] | null }> = [];

  for (let i = 0; i < rawContacts.length; i++) {
    const result = ContactSchema.safeParse(rawContacts[i]);
    if (!result.success) {
      errors.push({ row: i, reason: Object.values(result.error.flatten().fieldErrors).flat().join(", ") });
      skipped++;
      continue;
    }

    const phone = normalizePhone(result.data.phone);
    if (phone.length < 10) {
      errors.push({ row: i, reason: "Phone number too short after normalization" });
      skipped++;
      continue;
    }

    validContacts.push({ index: i, phone, email: result.data.email, name: result.data.name, tags: result.data.tags });
  }

  // Batch upsert into customers_v3
  for (let i = 0; i < validContacts.length; i += BATCH_SIZE) {
    const batch = validContacts.slice(i, i + BATCH_SIZE);

    const customerRows = batch.map((c) => ({
      user_id: storeUserId,
      store_id,
      phone: c.phone,
      email: c.email || null,
      name: c.name || null,
      tags: c.tags || [],
    }));

    const { error: custErr } = await supabaseSvc
      .from("customers_v3")
      .upsert(customerRows, { onConflict: "store_id,phone", ignoreDuplicates: false });

    if (custErr) {
      console.error("customers_v3 upsert error:", custErr.message);
      // Mark these as errors
      for (const c of batch) {
        errors.push({ row: c.index, reason: `DB error: ${custErr.message}` });
        skipped++;
      }
      continue;
    }

    // Also upsert into contacts for backward compatibility
    const contactRows = batch.map((c) => ({
      user_id: storeUserId,
      store_id,
      phone: c.phone,
      email: c.email || null,
      name: c.name || "Importado",
      tags: c.tags || [],
      status: "active",
    }));

    await supabaseSvc
      .from("contacts")
      .upsert(contactRows, { onConflict: "store_id,phone", ignoreDuplicates: true })
      .then(() => {}) // ignore contacts errors (backward compat table)
      .catch(() => {});

    imported += batch.length;
  }

  return new Response(
    JSON.stringify({ ok: true, imported, skipped, errors: errors.slice(0, 100) }),
    { status: 200, headers: corsHeaders },
  );
});
