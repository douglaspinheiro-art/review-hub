import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { verifyJwt } from "../_shared/edge-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  store_id: z.string().uuid(),
  job_id: z.string().uuid().optional(),
  is_background: z.boolean().optional(),
});

/** Evita timeout da edge em lojas muito grandes; o restante pode ser processado por cron futuro. */
const MAX_CUSTOMERS_PER_INVOCATION = 8000;

function isPaidLikeStatus(status: string | null | undefined, internalStatus: string | null | undefined): boolean {
  const s = (status || "").toLowerCase();
  if (["cancelled", "canceled", "refunded", "failed", "voided"].includes(s)) return false;
  if (internalStatus === "cancelled") return false;
  return true;
}

async function runRfmProcessing(
  supabase: SupabaseClient,
  store_id: string,
  job_id: string | null,
): Promise<{ updated: number; processedCustomers: number; capped: boolean }> {
  if (job_id) {
    await supabase.from("rfm_jobs").update({ status: "processing" }).eq("id", job_id);
  }

  const { data: customersRaw } = await supabase.from("customers_v3").select("id").eq("store_id", store_id);
  const totalRaw = customersRaw?.length ?? 0;
  const capped = totalRaw > MAX_CUSTOMERS_PER_INVOCATION;
  const customers = capped
    ? (customersRaw ?? []).slice(0, MAX_CUSTOMERS_PER_INVOCATION)
    : (customersRaw ?? []);

  if (job_id) {
    await supabase.from("rfm_jobs").update({ total_customers: totalRaw }).eq("id", job_id);
  }

  let updatedCount = 0;
  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i]!;
    const { data: orders } = await supabase
      .from("orders_v3")
      .select("valor, created_at, status, internal_status")
      .eq("store_id", store_id)
      .eq("cliente_id", customer.id)
      .order("created_at", { ascending: false });

    const paidOrders = (orders ?? []).filter((o) => isPaidLikeStatus(o.status as string, o.internal_status as string));
    if (paidOrders.length === 0) continue;

    const totalSpent = paidOrders.reduce((sum, o) => sum + Number(o.valor || 0), 0);
    const totalOrders = paidOrders.length;
    const lastOrderDate = new Date(paidOrders[0]!.created_at as string);
    const daysSinceLastOrder = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));

    const rScore = daysSinceLastOrder < 30 ? 5 : daysSinceLastOrder < 90 ? 4 : daysSinceLastOrder < 180 ? 3 : daysSinceLastOrder < 365 ? 2 : 1;
    const fScore = totalOrders >= 10 ? 5 : totalOrders >= 5 ? 4 : totalOrders >= 3 ? 3 : totalOrders >= 2 ? 2 : 1;
    const avgTicket = totalSpent / Math.max(totalOrders, 1);
    const mScore = avgTicket >= 400 ? 5 : avgTicket >= 200 ? 4 : avgTicket >= 100 ? 3 : avgTicket >= 50 ? 2 : 1;

    let segment = "loyal";
    if (rScore >= 4 && fScore >= 4) segment = "champions";
    else if (fScore >= 4) segment = "loyal";
    else if (rScore >= 4 && fScore === 1) segment = "new";
    else if (rScore === 1) segment = "lost";
    else if (rScore <= 2) segment = "at_risk";

    await supabase.from("customers_v3").update({
      rfm_recency: rScore,
      rfm_frequency: fScore,
      rfm_monetary: mScore,
      rfm_segment: segment,
      last_purchase_at: lastOrderDate.toISOString(),
    }).eq("id", customer.id);

    updatedCount++;

    if (job_id && i % 50 === 0) {
      await supabase.from("rfm_jobs").update({
        progress: i + 1,
        updated_count: updatedCount,
      }).eq("id", job_id);
    }
  }

  if (job_id) {
    await supabase.from("rfm_jobs").update({
      status: "completed",
      progress: customers.length,
      updated_count: updatedCount,
      completed_at: new Date().toISOString(),
    }).eq("id", job_id);
  }

  return { updated: updatedCount, processedCustomers: customers.length, capped };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "___");

  let userId = "";
  if (!isServiceRole) {
    const auth = await verifyJwt(req);
    if (!auth.ok) return auth.response;
    userId = auth.userId;
  }

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "store_id is required" }), { status: 400, headers: corsHeaders });
    }
    const { store_id, job_id, is_background } = parsed.data;

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    if (!job_id && !is_background) {
      const { data: existingJob } = await supabase
        .from("rfm_jobs")
        .select("id, status")
        .eq("store_id", store_id)
        .in("status", ["pending", "processing"])
        .maybeSingle();

      if (existingJob) {
        return new Response(
          JSON.stringify({
            ok: true,
            enqueued: false,
            message: "A job is already in progress.",
            job_id: existingJob.id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: job, error: jobErr } = await supabase
        .from("rfm_jobs")
        .insert({
          store_id,
          user_id: userId,
          status: "pending",
        })
        .select("id")
        .single();

      if (jobErr) throw jobErr;

      const { updated, capped } = await runRfmProcessing(supabase, store_id, job.id);

      return new Response(
        JSON.stringify({
          ok: true,
          enqueued: true,
          processed: true,
          job_id: job.id,
          updated,
          capped,
          ...(capped
            ? {
              message:
                `Recálculo aplicado aos primeiros ${MAX_CUSTOMERS_PER_INVOCATION} clientes; há mais na base — agende processamento em lote para o restante.`,
            }
            : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { updated, capped } = await runRfmProcessing(supabase, store_id, job_id ?? null);
    return new Response(
      JSON.stringify({ ok: true, updated, capped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("calculate-rfm error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
