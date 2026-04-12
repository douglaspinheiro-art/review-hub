import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  corsHeaders,
  checkRateLimit,
  getClientIp,
  checkDistributedRateLimit,
  rateLimitedResponseWithRetry,
} from "../_shared/edge-utils.ts";

const ConversationBodySchema = z.object({
  conversation_id: z.string().uuid(),
  context: z.string().max(2000).default(""),
});

const ReviewBodySchema = z
  .object({
    review_id: z.string().uuid().optional(),
    content: z.string().max(4000).optional(),
    rating: z.number().min(1).max(5).nullable().optional(),
    reviewer_name: z.string().min(1).max(120).optional(),
    context: z.string().max(2000).default(""),
  })
  .refine(
    (d) => !!d.review_id || !!(d.content && d.content.trim().length > 0),
    { message: "Informe review_id ou content", path: ["content"] },
  );

const JSON_HDR = { ...corsHeaders, "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized", request_id: requestId }), { status: 401, headers: JSON_HDR });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: authData } = await authClient.auth.getUser();
    if (!authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized", request_id: requestId }), { status: 401, headers: JSON_HDR });
    }

    const body = await req.json();
    const parsedConversation = ConversationBodySchema.safeParse(body);
    const parsedReview = ReviewBodySchema.safeParse(body);
    if (!parsedConversation.success && !parsedReview.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          request_id: requestId,
          details: {
            conversation: parsedConversation.success ? null : parsedConversation.error.flatten().fieldErrors,
            review: parsedReview.success ? null : parsedReview.error.flatten().fieldErrors,
          },
        }),
        { status: 400, headers: JSON_HDR },
      );
    }

    const clientIp = getClientIp(req);
    const rlKey = `ai-reply:${authData.user.id}:${clientIp}`;
    if (!checkRateLimit(rlKey, 30, 60_000)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded", request_id: requestId }), { status: 429, headers: JSON_HDR });
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

      if (!conv || conv.user_id !== authData.user.id) {
        return new Response(JSON.stringify({ error: "Forbidden", request_id: requestId }), { status: 403, headers: JSON_HDR });
      }

      const storeRateKey = `ai-reply-suggest:store:${conv.store_id ?? "none"}`;
      const dayCapStore = Math.min(200, Math.max(5, Number(Deno.env.get("AI_REPLY_SUGGEST_MAX_PER_STORE_PER_DAY") ?? "80") || 80));
      const distStore = await checkDistributedRateLimit(supabase, storeRateKey, dayCapStore, 86_400_000);
      if (!distStore.allowed) {
        return rateLimitedResponseWithRetry(distStore.retryAfterSeconds);
      }

      const { data: aiCfg } = conv?.store_id
        ? await (supabase as any)
          .from("ai_agent_config")
          .select("personalidade_preset,prompt_sistema,conhecimento_loja,tom_de_voz")
          .eq("store_id", conv.store_id)
          .maybeSingle()
        : { data: null };

      const { data: ownerPrefs } = await supabase
        .from("profiles")
        .select("ia_negotiation_enabled, ia_max_discount_pct, social_proof_enabled, pix_key")
        .eq("id", conv.user_id)
        .maybeSingle();

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

      const negOn = ownerPrefs?.ia_negotiation_enabled !== false;
      const maxDisc = Number(ownerPrefs?.ia_max_discount_pct ?? 10);
      const socialOn = ownerPrefs?.social_proof_enabled !== false;
      const pix = String(ownerPrefs?.pix_key ?? "").trim();

      const commerceRules = `Regras comerciais (configuradas pelo lojista):
- Negociação/objeção de preço: ${negOn ? "permitida dentro do limite abaixo" : "desativada — não ofereça descontos nem cupons improvisados; mantenha posicionamento de valor"}.
${negOn ? `- Desconto máximo a mencionar ou aplicar em ofertas verbais: ${maxDisc}%. Nunca prometa acima disso.` : ""}
- Prova social: ${socialOn ? "pode mencionar que outros clientes compraram recentemente quando couber de forma natural, sem inventar números ou estatísticas." : "não invente números de vendas, estoque ou urgência."}
- PIX: ${pix ? `se o cliente pedir chave PIX, use apenas esta chave oficial: ${pix}. Não invente outra chave.` : "se pedirem PIX, oriente a pagar pelo checkout oficial da loja ou diga que um humano confirmará a chave; não invente chave PIX."}`;

      system = `${aiCfg?.prompt_sistema ? `${aiCfg.prompt_sistema}\n\n` : ""}Você é um assistente de atendimento de um e-commerce brasileiro.
Sua tarefa é sugerir uma resposta empática, profissional e direta para o cliente.
Baseie-se no histórico da conversa fornecido.
Se o cliente estiver reclamando, seja solícito. Se estiver em dúvida, seja informativo.
Tom preferido: ${aiCfg?.tom_de_voz ?? "amigável e profissional"}.
Contexto da loja: ${aiCfg?.conhecimento_loja ?? "não informado"}.

${commerceRules}
Retorne APENAS o texto sugerido, sem introduções ou explicações.`;

      user = `Histórico da conversa:\n${history}\n\nContexto extra: ${context}\n\nSugira a próxima resposta para o Atendente:`;
    } else {
      let content = parsedReview.data.content;
      let rating = parsedReview.data.rating ?? null;
      let reviewer_name = parsedReview.data.reviewer_name ?? "Cliente";
      const { review_id, context } = parsedReview.data;

      if (review_id) {
        const { data: row, error: revErr } = await supabase
          .from("reviews")
          .select("user_id, content, rating, reviewer_name")
          .eq("id", review_id)
          .maybeSingle();

        if (revErr) {
          return new Response(JSON.stringify({ error: revErr.message, request_id: requestId }), { status: 500, headers: JSON_HDR });
        }
        if (!row) {
          return new Response(JSON.stringify({ error: "Review not found", request_id: requestId }), { status: 404, headers: JSON_HDR });
        }
        if (row.user_id !== authData.user.id) {
          return new Response(JSON.stringify({ error: "Forbidden", request_id: requestId }), { status: 403, headers: JSON_HDR });
        }
        const c = (row.content ?? "").trim();
        if (!c) {
          return new Response(JSON.stringify({ error: "Review has no text content", request_id: requestId }), { status: 400, headers: JSON_HDR });
        }
        content = c;
        rating = row.rating ?? null;
        reviewer_name = row.reviewer_name ?? "Cliente";
      }

      const userReviewKey = `ai-reply-suggest:user-reviews:${authData.user.id}`;
      const dayCapReviews = Math.min(200, Math.max(5, Number(Deno.env.get("AI_REPLY_SUGGEST_MAX_PER_USER_REVIEWS_PER_DAY") ?? "60") || 60));
      const distReviews = await checkDistributedRateLimit(supabase, userReviewKey, dayCapReviews, 86_400_000);
      if (!distReviews.allowed) {
        return rateLimitedResponseWithRetry(distReviews.retryAfterSeconds);
      }

      system = `Você é um especialista em atendimento e reputação para e-commerce brasileiro.
Sua tarefa é escrever uma resposta pública para uma avaliação de cliente.
A resposta deve ser respeitosa, profissional, breve e em português brasileiro.
Retorne APENAS o texto sugerido, sem introduções ou explicações.`;

      user = `Avaliação recebida:
- Cliente: ${reviewer_name}
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
    if (!response.ok) {
      const msg = typeof data?.error?.message === "string"
        ? data.error.message
        : (typeof data?.message === "string" ? data.message : JSON.stringify(data?.error ?? data));
      return new Response(
        JSON.stringify({ error: msg || "Anthropic API error", status: response.status, request_id: requestId }),
        { status: 502, headers: JSON_HDR },
      );
    }
    const suggestion = data?.content?.[0]?.text ?? "";
    if (!suggestion) {
      throw new Error("Empty model response");
    }

    return new Response(
      JSON.stringify({ suggestion, suggestions: [suggestion], reply: suggestion, request_id: requestId }),
      { headers: JSON_HDR },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message, request_id: requestId }), { status: 500, headers: JSON_HDR });
  }
});
