/**
 * inngest-serve — Durable background job handler via Inngest.
 *
 * Exposes Inngest functions for:
 * - Campaign dispatch (batched WhatsApp sends)
 * - Newsletter dispatch (batched email sends)
 *
 * Deploy this edge function, then sync with Inngest so it discovers the functions.
 */

import { Inngest } from "https://esm.sh/inngest@3.27.4";
// @ts-ignore — runtime export exists; types index omits it
import { serve } from "https://esm.sh/inngest@3.27.4?target=deno&exports=serve";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const inngest = new Inngest({ id: "ltv-boost" });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ── Campaign Dispatch (WhatsApp) ──────────────────────────────────────────────
const dispatchCampaign = inngest.createFunction(
  {
    id: "dispatch-campaign-batch",
    retries: 3,
    concurrency: { limit: 5 },
  },
  { event: "campaign/dispatch.requested" },
  async ({ event, step }) => {
    const { campaign_id, user_id } = event.data as {
      campaign_id: string;
      user_id: string;
    };

    const supabase = getServiceClient();

    // Step 1: Load campaign
    const campaign = await step.run("load-campaign", async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, message, channel, status, store_id, user_id, total_contacts")
        .eq("id", campaign_id)
        .single();
      if (error || !data) throw new Error(`Campaign not found: ${campaign_id}`);
      if (data.status !== "scheduled" && data.status !== "draft") {
        throw new Error(`Campaign ${campaign_id} is already ${data.status}`);
      }
      return data;
    });

    // Step 2: Mark as running
    await step.run("mark-running", async () => {
      await supabase
        .from("campaigns")
        .update({ status: "running" })
        .eq("id", campaign_id);
    });

    // Step 3: Load contacts in batches and dispatch
    const BATCH_SIZE = 50;
    let offset = 0;
    let totalSent = 0;

    while (true) {
      const batch = await step.run(`load-contacts-${offset}`, async () => {
        const { data } = await supabase
          .from("contacts")
          .select("id, phone, name")
          .eq("store_id", campaign.store_id)
          .eq("status", "active")
          .range(offset, offset + BATCH_SIZE - 1);
        return data ?? [];
      });

      if (batch.length === 0) break;

      // Create message_sends records
      await step.run(`send-batch-${offset}`, async () => {
        const sends = batch.map((contact: { id: string; phone: string; name: string }) => ({
          campaign_id,
          contact_id: contact.id,
          store_id: campaign.store_id,
          user_id: campaign.user_id,
          channel: campaign.channel,
          status: "queued",
        }));

        await supabase.from("message_sends").insert(sends);
        totalSent += batch.length;
      });

      // Rate limit: wait between batches
      if (batch.length === BATCH_SIZE) {
        await step.sleep("batch-delay", "2s");
        offset += BATCH_SIZE;
      } else {
        break;
      }
    }

    // Step 4: Update campaign counts
    await step.run("finalize", async () => {
      await supabase
        .from("campaigns")
        .update({ status: "sent", sent_count: totalSent })
        .eq("id", campaign_id);
    });

    return { campaign_id, totalSent };
  }
);

// ── Newsletter Dispatch (Email) ───────────────────────────────────────────────
const dispatchNewsletter = inngest.createFunction(
  {
    id: "dispatch-newsletter-batch",
    retries: 2,
    concurrency: { limit: 3 },
  },
  { event: "newsletter/dispatch.requested" },
  async ({ event, step }) => {
    const { campaign_id, recipient_mode, recipient_tag, recipient_rfm } =
      event.data as {
        campaign_id: string;
        recipient_mode: string;
        recipient_tag?: string;
        recipient_rfm?: string;
      };

    const supabase = getServiceClient();

    // Step 1: Load campaign
    const campaign = await step.run("load-campaign", async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, subject, blocks, channel, status, store_id, user_id")
        .eq("id", campaign_id)
        .single();
      if (error || !data) throw new Error(`Newsletter not found: ${campaign_id}`);
      return data;
    });

    // Step 2: Mark as running
    await step.run("mark-running", async () => {
      await supabase
        .from("campaigns")
        .update({ status: "running" })
        .eq("id", campaign_id);
    });

    // Step 3: Dispatch via the existing edge function (internal call)
    const result = await step.run("dispatch-emails", async () => {
      const { data, error } = await supabase.functions.invoke(
        "dispatch-newsletter",
        {
          body: {
            campaign_id,
            recipient_mode: recipient_mode ?? "all",
            recipient_tag,
            recipient_rfm,
          },
          headers: {
            "x-internal-secret":
              Deno.env.get("PROCESS_SCHEDULED_MESSAGES_SECRET") ?? "",
          },
        }
      );
      if (error) throw error;
      return data;
    });

    return { campaign_id, result };
  }
);

// ── Webhook Processing (Durable) ──────────────────────────────────────────────
const processWebhookJob = inngest.createFunction(
  {
    id: "process-webhook-job",
    retries: 5,
    concurrency: { limit: 10 },
  },
  { event: "webhook/job.queued" },
  async ({ event, step }) => {
    const { job_id, store_id } = event.data as {
      job_id: string;
      store_id: string;
    };

    const supabase = getServiceClient();

    // Step 1: Claim the job
    const job = await step.run("claim-job", async () => {
      const { data } = await supabase
        .from("webhook_queue")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", job_id)
        .eq("status", "pending")
        .select("id, store_id, user_id, platform, payload_normalized, attempts")
        .maybeSingle();
      if (!data) throw new Error(`Job ${job_id} already claimed or not found`);
      return data;
    });

    // Step 2: Validate + upsert
    const customerId = await step.run("upsert-cart", async () => {
      const normalized = job.payload_normalized as Record<string, unknown>;
      const { data, error } = await supabase.rpc("upsert_cart_with_customer", {
        p_user_id: job.user_id,
        p_store_id: job.store_id,
        p_phone: normalized.customer_phone as string,
        p_email: (normalized.customer_email as string | null) ?? null,
        p_name: (normalized.customer_name as string | null) ?? null,
        p_external_id: String(normalized.external_id),
        p_source: job.platform,
        p_cart_value: normalized.cart_value ?? null,
        p_cart_items: normalized.cart_items ?? null,
        p_recovery_url: normalized.recovery_url ?? null,
        p_raw_payload: normalized,
        p_utm_source: normalized.utm_source ?? null,
        p_utm_medium: normalized.utm_medium ?? null,
        p_utm_campaign: normalized.utm_campaign ?? null,
        p_shipping_value: normalized.shipping_value ?? null,
        p_shipping_zip_code: normalized.shipping_zip_code ?? null,
        p_payment_failure_reason: normalized.payment_failure_reason ?? null,
        p_inventory_status: normalized.inventory_status ?? null,
        p_abandon_step: normalized.abandon_step ?? null,
      });
      if (error) throw error;
      return data as string;
    });

    // Step 3: Trigger flow engine
    await step.run("trigger-flow", async () => {
      const normalized = job.payload_normalized as Record<string, unknown>;
      const event = normalized.abandon_step === "payment" ? "payment_pending" : "cart_abandoned";
      const { error } = await supabase.functions.invoke("flow-engine", {
        body: {
          event,
          store_id: job.store_id,
          customer_id: customerId,
          payload: {
            recovery_url: normalized.recovery_url ?? "",
            cart_value: normalized.cart_value,
            shipping_value: normalized.shipping_value,
          },
        },
        headers: {
          "x-internal-secret": Deno.env.get("FLOW_ENGINE_SECRET") ?? "",
        },
      });
      if (error) throw error;
    });

    // Step 4: Mark completed
    await step.run("mark-completed", async () => {
      await supabase.from("webhook_queue").update({
        status: "completed",
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job_id);
    });

    return { job_id, store_id, customerId };
  }
);

// ── Serve handler ─────────────────────────────────────────────────────────────
export default serve({
  client: inngest,
  functions: [dispatchCampaign, dispatchNewsletter, processWebhookJob],
});
