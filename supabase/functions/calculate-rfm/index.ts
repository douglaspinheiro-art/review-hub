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

  // Optimized: single batch SQL call instead of per-customer loop
  const { data, error } = await supabase.rpc("calculate_rfm_for_store", {
    p_store_id: store_id,
  });

  if (error) {
    console.error("RPC calculate_rfm_for_store error:", error);
    if (job_id) {
      await supabase.from("rfm_jobs").update({ status: "failed", error_message: error.message }).eq("id", job_id);
    }
    throw error;
  }

  const updatedCount = (data as any)?.updated_count ?? 0;

  if (job_id) {
    await supabase.from("rfm_jobs").update({
      status: "completed",
      progress: updatedCount,
      updated_count: updatedCount,
      completed_at: new Date().toISOString(),
    }).eq("id", job_id);
  }

  return { updated: updatedCount, processedCustomers: updatedCount, capped: false };
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

    // Verify the authenticated user owns the requested store.
    // Service-role callers (cron) are trusted; regular users must own the store.
    if (!isServiceRole && userId) {
      const { data: storeOwner } = await supabase
        .from("stores")
        .select("id")
        .eq("id", store_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!storeOwner) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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
