/**
 * Enqueue a campaign or newsletter dispatch via Inngest.
 *
 * This sends an event to Inngest which triggers durable background processing,
 * avoiding HTTP timeouts for large contact lists.
 */

import { supabase } from "./supabase";

interface EnqueueResult {
  success: boolean;
  error?: string;
}

/**
 * Enqueue campaign dispatch via Inngest (preferred) or fallback to direct edge function.
 */
export async function enqueueCampaignDispatch(campaignId: string): Promise<EnqueueResult> {
  try {
    // Try Inngest first
    const { error } = await supabase.functions.invoke("enqueue-inngest-event", {
      body: {
        event_name: "campaign/dispatch.requested",
        event_data: { campaign_id: campaignId },
      },
    });

    if (error) throw error;
    return { success: true };
  } catch {
    // Fallback to direct dispatch
    const { error } = await supabase.functions.invoke("dispatch-campaign", {
      body: { campaign_id: campaignId },
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  }
}

/**
 * Enqueue newsletter dispatch via Inngest (preferred) or fallback to direct edge function.
 */
export async function enqueueNewsletterDispatch(
  campaignId: string,
  recipientMode: string = "all",
  recipientTag?: string,
  recipientRfm?: string
): Promise<EnqueueResult> {
  try {
    const { error } = await supabase.functions.invoke("enqueue-inngest-event", {
      body: {
        event_name: "newsletter/dispatch.requested",
        event_data: {
          campaign_id: campaignId,
          recipient_mode: recipientMode,
          recipient_tag: recipientTag,
          recipient_rfm: recipientRfm,
        },
      },
    });

    if (error) throw error;
    return { success: true };
  } catch {
    // Fallback to direct dispatch
    const { error } = await supabase.functions.invoke("dispatch-newsletter", {
      body: {
        campaign_id: campaignId,
        recipient_mode: recipientMode,
        recipient_tag: recipientTag,
        recipient_rfm: recipientRfm,
      },
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  }
}
