import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, checkRateLimit } from "../_shared/edge-utils.ts";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRL(key: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const e = rateLimitMap.get(key);
  if (!e || now > e.resetAt) { rateLimitMap.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

const ConversationBodySchema = z.object({
  conversation_id: z.string().uuid(),
  context: z.string().max(2000).default(""),
});

const ReviewBodySchema = z.object({
  review_id: z.string().uuid().optional(),
  content: z.string().min(1).max(4000),
  rating: z.number().min(1).max(5).nullable().optional(),
  reviewer_name: z.string().min(1).max(120).optional(),
  context: z.string().max(2000).default(""),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: authData } = await authClient.auth.getUser();
    if (!authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const parsedConversation = ConversationBodySchema.safeParse(body);
    const parsedReview = ReviewBodySchema.safeParse(body);
    if (!parsedConversation.success && !parsedReview.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: {
            conversation: parsedConversation.success ? null : parsedConversation.error.flatten().fieldErrors,
            review: parsedReview.success ? null : parsedReview.error.flatten().fieldErrors,
          },
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const clientIp = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRL(clientIp)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
    let system = "";
    let user = "";

    if (parsedConversation.success) {
      const { conversation_id, context } = parsedConversation.data;
      const { data: conv } = await supabase
        .from("conversations")
        .select("store_id, user_id")
        .eq("id", conversation_id)
        .maybeSingle();

      // IDOR guard: verify the authenticated user owns this conversation
      if (!conv || conv.user_id !== authData.user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }

      const { data: aiCfg } = conv?.store_id
        ? await (supabase as any)
          .from("ai_agent_config")
          .select("personalidade_preset,prompt_sistema,conhecimento_loja,tom_de_voz")
          .eq("store_id", conv.store_id)
          .maybeSingle()
        : { data: null };
      const { data: messages } = await supabase
        .from("messages")
        .select("content, direction")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(10);

      const history = (messages || [])
        .reverse()
        .map((m) => `${m.direction === "inbound" ? "Cliente" : "Atendente"}: ${m.content}`)
        .join("\n");

      system = `${aiCfg?.prompt_sistema ? `${aiCfg.prompt_sistema}\n\n` : ""}Você é um assistente de atendimento de um e-commerce brasileiro.
Sua tarefa é sugerir uma resposta empática, profissional e direta para o cliente.
Baseie-se no histórico da conversa fornecido.
Se o cliente estiver reclamando, seja solícito. Se estiver em dúvida, seja informativo.
Tom preferido: ${aiCfg?.tom_de_voz ?? "amigável e profissional"}.
Contexto da loja: ${aiCfg?.conhecimento_loja ?? "não informado"}.
Retorne APENAS o texto sugerido, sem introduções ou explicações.`;

      user = `Histórico da conversa:\n${history}\n\nContexto extra: ${context}\n\nSugira a próxima resposta para o Atendente:`;
    } else {
      const { content, rating, reviewer_name, context } = parsedReview.data;

      system = `Você é um especialista em atendimento e reputação para e-commerce brasileiro.
Sua tarefa é escrever uma resposta pública para uma avaliação de cliente.
A resposta deve ser respeitosa, profissional, breve e em português brasileiro.
Retorne APENAS o texto sugerido, sem introduções ou explicações.`;

      user = `Avaliação recebida:
- Cliente: ${reviewer_name ?? "Cliente"}
- Nota: ${rating ?? "não informada"}
- Texto: ${content}

Contexto extra: ${context}

Gere uma resposta ideal para publicar na avaliação.`;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", max_tokens: 500, system, messages: [{ role: "user", content: user }] }),
    });

    const data = await response.json();
    const suggestion = data?.content?.[0]?.text ?? "";
    if (!suggestion) {
      throw new Error("Empty model response");
    }

    // Keep backward compatibility with existing frontend contracts.
    return new Response(
      JSON.stringify({ suggestion, suggestions: [suggestion], reply: suggestion }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
