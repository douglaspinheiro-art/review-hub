/**
 * export-contacts — Streaming CSV export of the full contact base.
 *
 * GET /functions/v1/export-contacts?rfm=champions&search=...
 *
 * - Auth: user JWT (Authorization: Bearer <jwt>)
 * - Streams CSV in 1 000-row chunks via ReadableStream (no memory build-up)
 * - Rate-limited: 3 exports per hour per user (LGPD protection)
 * - Scoped to the authenticated user's store (RLS-safe via service key query)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyJwt, checkRateLimit, rateLimitedResponse } from "../_shared/edge-utils.ts";

const CHUNK_SIZE = 1_000;
const EXPORT_RATE_LIMIT = 3;        // per hour
const EXPORT_RATE_WINDOW_MS = 3_600_000;

const CSV_HEADER = [
  "id", "nome", "email", "telefone", "segmento_rfm",
  "tags", "ultima_compra", "total_pedidos", "total_gasto",
  "chs", "opt_out_email", "hard_bounce", "reclamacao",
  "criado_em",
].join(",") + "\n";

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function rowToCsv(c: Record<string, unknown>): string {
  return [
    escapeCsv(c.id as string),
    escapeCsv(c.name as string),
    escapeCsv(c.email as string),
    escapeCsv(c.phone as string),
    escapeCsv(c.rfm_segment as string),
    escapeCsv(Array.isArray(c.tags) ? (c.tags as string[]).join("; ") : ""),
    escapeCsv(c.last_purchase_at ? new Date(c.last_purchase_at as string).toISOString().slice(0, 10) : ""),
    escapeCsv(String(c.total_orders ?? "")),
    escapeCsv(String(c.total_spent ?? "")),
    escapeCsv(String(c.customer_health_score ?? "")),
    escapeCsv(c.unsubscribed_at ? "sim" : ""),
    escapeCsv(c.email_hard_bounce_at ? "sim" : ""),
    escapeCsv(c.email_complaint_at ? "sim" : ""),
    escapeCsv(c.created_at as string),
  ].join(",") + "\n";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  // Auth
  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  // Rate limit: 3 exports/hour per user
  if (!checkRateLimit(`export-contacts:${auth.userId}`, EXPORT_RATE_LIMIT, EXPORT_RATE_WINDOW_MS)) {
    return rateLimitedResponse();
  }

  const url = new URL(req.url);
  const rfmFilter = url.searchParams.get("rfm") ?? null;
  const searchTerm = url.searchParams.get("search") ?? null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve the store for this user
  const { data: stores } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: true })
    .limit(1);
  const storeId = stores?.[0]?.id ?? null;
  if (!storeId) {
    return new Response(JSON.stringify({ error: "No store found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const filename = `contatos-${today}.csv`;

  // Streaming response — chunks 1 000 rows at a time
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(CSV_HEADER));

      let offset = 0;
      let done = false;

      while (!done) {
        let query = supabase
          .from("customers_v3")
          .select(
            "id, name, email, phone, rfm_segment, tags, last_purchase_at, total_orders, total_spent, customer_health_score, unsubscribed_at, email_hard_bounce_at, email_complaint_at, created_at",
          )
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .range(offset, offset + CHUNK_SIZE - 1);

        if (rfmFilter) query = query.eq("rfm_segment", rfmFilter);
        if (searchTerm) {
          query = query.or(
            `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`,
          );
        }

        const { data, error } = await query;
        if (error) {
          console.error("[export-contacts] query error:", error.message);
          controller.close();
          return;
        }

        const rows = data ?? [];
        for (const row of rows) {
          controller.enqueue(enc.encode(rowToCsv(row as Record<string, unknown>)));
        }

        if (rows.length < CHUNK_SIZE) {
          done = true;
        } else {
          offset += CHUNK_SIZE;
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "X-Export-Rate-Limit": `${EXPORT_RATE_LIMIT} por hora`,
    },
  });
});
