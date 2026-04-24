/**
 * track-email-open — Pixel 1×1; grava abertura por destinatário (sid)
 *
 * GET /functions/v1/track-email-open?sid=<newsletter_send_recipients.id>
 */

// @ts-nocheck — Supabase RPC return types lack `.catch`/promise chain on this client version; runtime is a Promise (verified).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

const OPEN_DEDUPE_WINDOW_MS = 12 * 60 * 60 * 1000;

function isLikelyBotRequest(req: Request): boolean {
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  const purpose = (req.headers.get("purpose") ?? req.headers.get("x-purpose") ?? "").toLowerCase();
  const secFetchMode = (req.headers.get("sec-fetch-mode") ?? "").toLowerCase();
  const secFetchDest = (req.headers.get("sec-fetch-dest") ?? "").toLowerCase();
  return (
    /(bot|crawler|spider|preview|slurp|headless|monitor|wget|curl|python-requests)/.test(ua) ||
    purpose.includes("prefetch") ||
    purpose.includes("preview") ||
    (secFetchMode === "no-cors" && secFetchDest === "empty")
  );
}

serve(async (req) => {
  const url = new URL(req.url);
  const sid = url.searchParams.get("sid");
  const legacyCid = url.searchParams.get("cid");

  const gifResponse = () =>
    new Response(GIF, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });

  if (!sid && !legacyCid) return gifResponse();

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (sid) {
      const { data: row, error: rErr } = await sb
        .from("newsletter_send_recipients")
        .select("id,campaign_id,customer_id,user_id")
        .eq("id", sid)
        .maybeSingle();
      if (rErr || !row) return gifResponse();

      if (!isLikelyBotRequest(req)) {
        const dedupeSince = new Date(Date.now() - OPEN_DEDUPE_WINDOW_MS).toISOString();
        const { data: existingOpen } = await sb
          .from("email_engagement_events")
          .select("id")
          .eq("send_recipient_id", row.id)
          .eq("event_type", "open")
          .gte("created_at", dedupeSince)
          .limit(1)
          .maybeSingle();

        if (!existingOpen) {
          await sb.from("email_engagement_events").insert({
            send_recipient_id: row.id,
            campaign_id: row.campaign_id,
            customer_id: row.customer_id,
            user_id: row.user_id,
            event_type: "open",
            link_url: null,
          });

          await sb.rpc("increment_campaign_read", { campaign_id: row.campaign_id }).catch(async () => {
            const { data } = await sb.from("campaigns").select("read_count").eq("id", row.campaign_id).single();
            if (!data) return;
            await sb.from("campaigns").update({ read_count: (data.read_count ?? 0) + 1 } as never).eq("id", row.campaign_id);
          });
        }
      }
    } else if (legacyCid) {
      await sb.rpc("increment_campaign_read", { campaign_id: legacyCid }).catch(async () => {
        const { data } = await sb.from("campaigns").select("read_count").eq("id", legacyCid).single();
        if (!data) return;
        await sb.from("campaigns").update({ read_count: (data.read_count ?? 0) + 1 } as never).eq("id", legacyCid);
      });
    }
  } catch {
    // always return pixel
  }

  return gifResponse();
});
