/**
 * LTV Boost v4 — Smart AI Reply Suggestions
 * Analyzes conversation history and suggests the best response
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

    const { conversation_id, context = "" } = await req.json();

    if (!conversation_id) throw new Error("conversation_id missing");

    // 1. Fetch last 10 messages for context
    const { data: messages } = await supabase
      .from("messages")
      .select("content, direction")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const history = (messages || []).reverse().map(m => 
      `${m.direction === 'inbound' ? 'Cliente' : 'Atendente'}: ${m.content}`
    ).join('\n');

    // 2. Call Claude 3.5 Sonnet
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

    const system = `Você é um assistente de atendimento de um e-commerce brasileiro.
Sua tarefa é sugerir uma resposta empática, profissional e direta para o cliente.
Baseie-se no histórico da conversa fornecido.
Se o cliente estiver reclamando, seja solícito. Se estiver em dúvida, seja informativo.
Retorne APENAS o texto sugerido, sem introduções ou explicações.`;

    const user = `Histórico da conversa:\n${history}\n\nContexto extra: ${context}\n\nSugira a próxima resposta para o Atendente:`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const data = await response.json();
    const suggestion = data.content[0].text;

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
