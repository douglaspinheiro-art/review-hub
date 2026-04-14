/**
 * inngest-serve — Durable background job handler via Inngest.
 *
 * Exposes Inngest functions for:
 * - Campaign dispatch (batched WhatsApp sends)
 * - Newsletter dispatch (batched email sends)
 *
 * Deploy this edge function, then sync with Inngest so it discovers the functions.
 */

import { Inngest } from "https://esm.sh/inngest@3";
import { serve } from "https://esm.sh/inngest@3/deno";
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

// ── Serve handler ─────────────────────────────────────────────────────────────
export default serve({
  client: inngest,
  functions: [dispatchCampaign, dispatchNewsletter],
});
