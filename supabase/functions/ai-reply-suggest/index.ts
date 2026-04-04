// supabase/functions/ai-reply-suggest/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { conversation_id } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Get Context
    const { data: conv } = await supabase
      .from("conversations")
      .select("*, contacts(*), messages(*)")
      .eq("id", conversation_id)
      .single();

    if (!conv) throw new Error("Conversa não encontrada");

    // 2. Call AI Agent
    const lastMessage = conv.messages.filter((m: any) => m.direction === 'inbound').pop();
    const history = conv.messages.map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content
    }));

    const aiResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: lastMessage?.content,
        contact_phone: conv.contacts.phone,
        loja_id: conv.contacts.loja_id,
        history: history
      }),
    });

    const aiResult = await aiResponse.json();
    
    // For suggestions, we could ask for 3 variations, but for now we return the agent's best answer
    return new Response(JSON.stringify({ 
      suggestions: [aiResult.response].filter(Boolean) 
    }), { headers: CORS });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});
