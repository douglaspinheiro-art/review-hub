/**
 * LTV Boost v4 — Conversational AI Agent
 * Autonomous decision making for customer interactions
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { conversation_id, message_content, store_id } = await req.json();

    // 1. Get Store and AI Config
    const { data: store } = await supabase.from("stores").select("name, segment").eq("id", store_id).single();
    const { data: aiConfig } = await supabase.from("ai_agent_config").select("*").eq("store_id", store_id).maybeSingle();

    // 2. Call Claude 3.5 Sonnet to decide response
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    
    const system = `Você é o Agente de IA da loja ${store?.name || 'LTV Boost'}.
Seu objetivo é ajudar o cliente, resolver dúvidas e incentivar a conversão de forma natural.
Personalidade da marca: ${aiConfig?.personality || 'Profissional e prestativa'}.
Contexto do segmento: ${store?.segment}.
Instruções: Nunca invente informações. Se não souber algo, direcione para um humano.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: message_content }],
      }),
    });

    const data = await response.json();
    const replyText = data.content[0].text;

    // 3. Save as outbound message (pending dispatch)
    await supabase.from("messages").insert({
      conversation_id,
      content: replyText,
      direction: "outbound",
      status: "pending",
      type: "text",
      user_id: store?.user_id
    });

    return new Response(JSON.stringify({ reply: replyText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
