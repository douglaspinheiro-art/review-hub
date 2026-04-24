// @ts-nocheck — Supabase RPC return types lack `.catch`/promise chain on this client version; runtime is a Promise (verified).
/**
 * track-email-click — Registra clique por destinatário e redireciona
 *
 * GET /functions/v1/track-email-click?sid=<uuid>&url=<encoded_dest>
 * Legado: ?cid=&url=
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLICK_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

async function bumpClickCount(sb: ReturnType<typeof createClient>, campaignId: string) {
  await sb.rpc("increment_campaign_click", { campaign_id: campaignId }).catch(async () => {
    const { data } = await sb.from("campaigns").select("click_count").eq("id", campaignId).single();
    if (!data) return;
    await sb.from("campaigns").update({ click_count: Number((data as { click_count?: number }).click_count ?? 0) + 1 } as never).eq("id", campaignId);
  });
}

function isLikelyBotRequest(req: Request): boolean {
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  const purpose = (req.headers.get("purpose") ?? req.headers.get("x-purpose") ?? "").toLowerCase();
  const secFetchMode = (req.headers.get("sec-fetch-mode") ?? "").toLowerCase();
  const secFetchDest = (req.headers.get("sec-fetch-dest") ?? "").toLowerCase();
  return (
    /(bot|crawler|spider|preview|headless|monitor|wget|curl|python-requests)/.test(ua) ||
    purpose.includes("prefetch") ||
    purpose.includes("preview") ||
    (secFetchMode === "no-cors" && secFetchDest === "empty")
  );
}

serve(async (req) => {
  const url = new URL(req.url);
  const sid = url.searchParams.get("sid");
  const legacyCid = url.searchParams.get("cid");
  const dest = url.searchParams.get("url");

  const redirect = (to: string) =>
    new Response(null, { status: 302, headers: { Location: to || "/" } });

  if (!dest) return redirect("/");

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(dest);
  } catch {
    targetUrl = dest;
  }
  if (!/^https?:\/\//i.test(targetUrl)) return redirect("/");

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let campaignId: string | null = null;

    if (sid) {
      const { data: row } = await sb
        .from("newsletter_send_recipients")
        .select("id,campaign_id,customer_id,user_id")
        .eq("id", sid)
        .maybeSingle();
      if (row) {
        campaignId = row.campaign_id;
        if (!isLikelyBotRequest(req)) {
          const dedupeSince = new Date(Date.now() - CLICK_DEDUPE_WINDOW_MS).toISOString();
          const normalizedUrl = targetUrl.slice(0, 2048);
          const { data: existingClick } = await sb
            .from("email_engagement_events")
            .select("id")
            .eq("send_recipient_id", row.id)
            .eq("event_type", "click")
            .eq("link_url", normalizedUrl)
            .gte("created_at", dedupeSince)
            .limit(1)
            .maybeSingle();

          if (!existingClick) {
            await sb.from("email_engagement_events").insert({
              send_recipient_id: row.id,
              campaign_id: row.campaign_id,
              customer_id: row.customer_id,
              user_id: row.user_id,
              event_type: "click",
              link_url: normalizedUrl,
            });
            await bumpClickCount(sb, campaignId);
          }
        }
      }
    }

    if (!sid && legacyCid && !isLikelyBotRequest(req)) await bumpClickCount(sb, legacyCid);
  } catch {
    // redirect anyway
  }

  return redirect(targetUrl);
});
