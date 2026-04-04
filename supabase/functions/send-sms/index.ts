import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ZENVIA_API_KEY = Deno.env.get("ZENVIA_API_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { to, message, from = "LTV Boost" } = await req.json();

    if (!ZENVIA_API_KEY) {
      return new Response(JSON.stringify({ error: "ZENVIA_API_KEY não configurada no Supabase." }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // A Zenvia utiliza uma API baseada em JSON para SMS
    const res = await fetch("https://api.zenvia.com/v2/channels/sms/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-TOKEN": ZENVIA_API_KEY,
      },
      body: JSON.stringify({
        from,
        to,
        contents: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: cors,
    });
  }
});
