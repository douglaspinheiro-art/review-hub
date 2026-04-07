import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRL(key: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const e = rateLimitMap.get(key);
  if (!e || now > e.resetAt) { rateLimitMap.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

const BodySchema = z.object({
  conversation_id: z.string().uuid(),
  context: z.string().max(2000).default(""),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: corsHeaders });
    }
    const { conversation_id, context } = parsed.data;

    const clientIp = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRL(clientIp)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: messages } = await supabase
      .from("messages").select("content, direction")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false }).limit(10);

    const history = (messages || []).reverse().map(m => 
      `${m.direction === 'inbound' ? 'Cliente' : 'Atendente'}: ${m.content}`
    ).join('\n');

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
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", max_tokens: 500, system, messages: [{ role: "user", content: user }] }),
    });

    const data = await response.json();
    const suggestion = data.content[0].text;

    return new Response(JSON.stringify({ suggestion }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
