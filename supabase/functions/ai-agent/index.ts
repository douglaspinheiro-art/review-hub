import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRL(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const e = rateLimitMap.get(key);
  if (!e || now > e.resetAt) { rateLimitMap.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

const BodySchema = z.object({
  conversation_id: z.string().uuid(),
  message_content: z.string().min(1).max(5000),
  store_id: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: corsHeaders });
    }
    const { conversation_id, message_content, store_id } = parsed.data;

    if (!checkRL(store_id, 20)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: store } = await supabase.from("stores").select("name, segment, user_id").eq("id", store_id).single();
    const { data: aiConfig } = await supabase.from("ai_agent_config").select("*").eq("store_id", store_id).maybeSingle();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

    const system = `Você é o Agente de IA da loja ${store?.name || 'LTV Boost'}.
Seu objetivo é ajudar o cliente, resolver dúvidas e incentivar a conversão de forma natural.
Personalidade da marca: ${aiConfig?.personality || 'Profissional e prestativa'}.
Contexto do segmento: ${store?.segment}.
Instruções: Nunca invente informações. Se não souber algo, direcione para um humano.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", max_tokens: 1000, system, messages: [{ role: "user", content: message_content }] }),
    });

    const data = await response.json();
    const replyText = data.content[0].text;

    await supabase.from("messages").insert({
      conversation_id, content: replyText, direction: "outbound", status: "pending", type: "text", user_id: store?.user_id
    });

    return new Response(JSON.stringify({ reply: replyText }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
