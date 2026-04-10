import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  to: z.string().min(8).max(20),
  message: z.string().min(1).max(1000),
  provider: z.enum(["zenvia", "twilio", "smsdev"]).optional(),
});

async function sendViaSMSDev(token: string, to: string, message: string) {
  const res = await fetch(
    `https://api.smsdev.com.br/v1/send?key=${token}&type=9&number=${encodeURIComponent(to)}&msg=${encodeURIComponent(message)}`
  );
  return res.json();
}

async function sendViaZenvia(token: string, senderId: string, to: string, message: string) {
  const res = await fetch("https://api.zenvia.com/v2/channels/sms/messages", {
    method: "POST",
    headers: { "X-API-TOKEN": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: senderId,
      to,
      contents: [{ type: "text", text: message }],
    }),
  });
  return res.json();
}

async function sendViaTwilio(sid: string, authToken: string, from: string, to: string, message: string) {
  const auth = btoa(`${sid}:${authToken}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: message }),
  });
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { to, message, provider: requestedProvider } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Try to authenticate user and read their SMS integration
    const jwt = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user } } = await supabase.auth.getUser(jwt);

    let data: Record<string, unknown>;

    if (user) {
      // Look for SMS integrations saved by the user
      const SMS_TYPES = ["zenvia", "twilio"];
      const { data: integration } = await supabase
        .from("integrations")
        .select("type, config")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .in("type", SMS_TYPES)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (integration) {
        const cfg = integration.config as Record<string, string>;

        if (integration.type === "zenvia") {
          data = await sendViaZenvia(cfg.token, cfg.sender_id || "LTV Boost", to, message);
          return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (integration.type === "twilio") {
          data = await sendViaTwilio(cfg.account_sid, cfg.auth_token, cfg.from_number, to, message);
          return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // Fallback to env var (SMS Dev legacy)
    const SMS_DEV_TOKEN = Deno.env.get("SMS_DEV_TOKEN");
    if (!SMS_DEV_TOKEN) {
      return new Response(JSON.stringify({ error: "Nenhum provedor SMS configurado. Conecte Zenvia ou Twilio em Integrações." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    data = await sendViaSMSDev(SMS_DEV_TOKEN, to, message);
    return new Response(JSON.stringify(data), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
