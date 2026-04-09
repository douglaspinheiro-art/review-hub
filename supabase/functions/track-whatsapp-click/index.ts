/**
 * track-whatsapp-click — tracks WhatsApp link clicks and redirects
 *
 * GET /functions/v1/track-whatsapp-click?cid=<campaign_id>&uid=<user_id>&contact=<customer_id>&url=<encoded_url>
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("cid");
  const userId = url.searchParams.get("uid");
  const contactId = url.searchParams.get("contact");
  const dest = url.searchParams.get("url");

  const redirect = (to: string) => new Response(null, {
    status: 302,
    headers: { Location: to || "/" },
  });

  if (!dest) return redirect("/");

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(dest);
  } catch {
    targetUrl = dest;
  }

  // Validate the redirect destination to prevent open redirect attacks.
  // Only http and https schemes are allowed.
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return redirect("/");
    }
  } catch {
    // Not a valid URL — redirect to safe fallback
    return redirect("/");
  }

  if (campaignId) {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      await sb.rpc("increment_campaign_click", { campaign_id: campaignId }).catch(async () => {
        const { data } = await sb
          .from("campaigns")
          .select("click_count")
          .eq("id", campaignId)
          .maybeSingle();
        if (!data) return;
        await sb
          .from("campaigns")
          .update({ click_count: Number((data as any).click_count ?? 0) + 1 } as any)
          .eq("id", campaignId);
      });

      if (userId && contactId) {
        await (sb as any).from("message_sends").insert({
          user_id: userId,
          campaign_id: campaignId,
          customer_id: contactId,
          phone: "tracked_click",
          status: "clicked",
        }).then(() => {}, () => {});
      }
    } catch {
      // Never block redirect on tracking errors.
    }
  }

  return redirect(targetUrl);
});
