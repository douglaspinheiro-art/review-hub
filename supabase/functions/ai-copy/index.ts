import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import {
  corsHeaders,
  rateLimitedResponse,
  verifyJwt,
  checkDistributedRateLimit,
  rateLimitedResponseWithRetry,
  anthropicFetch,
} from "../_shared/edge-utils.ts";

const BodySchema = z.object({
  type: z.enum(["whatsapp", "email"]),
  objective: z.enum(["recuperar_carrinho", "boas_vindas", "reativacao", "upsell"]),
  customer_name: z.string().max(200).optional(),
  product_name: z.string().max(500).optional(),
  discount_value: z.number().min(0).max(100).optional(),
  tone: z.enum(["persuasivo", "amigavel", "urgente"]).default("persuasivo"),
  brand_context: z.string().max(2000).default(""),
});

const JSON_HDR = { ...corsHeaders, "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestId = crypto.randomUUID();
  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", request_id: requestId, details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: JSON_HDR },
      );
    }
    const { type, objective, customer_name, product_name, discount_value, tone, brand_context } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Per-minute burst guard (distributed — works across all Edge Function instances).
    const burst = await checkDistributedRateLimit(supabase, `ai-copy:burst:${auth.userId}`, 15, 60_000);
    if (!burst.allowed) {
      return rateLimitedResponse();
    }

    const userRateKey = `ai-copy:user:${auth.userId}`;
    const dayCap = Math.min(200, Math.max(5, Number(Deno.env.get("AI_COPY_MAX_PER_USER_PER_DAY") ?? "50") || 50));
    const dist = await checkDistributedRateLimit(supabase, userRateKey, dayCap, 86_400_000);
    if (!dist.allowed) {
      return rateLimitedResponseWithRetry(dist.retryAfterSeconds);
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");

    const systemPrompt = `Você é um especialista em copy para e-commerce brasileiro focado em LTV e conversão.
Sua missão é criar mensagens que convertem sem parecer spam. 
Use gatilhos mentais apropriados para o tom solicitado (${tone}).
Responda APENAS com o texto da mensagem final.
Para WhatsApp: use emojis moderadamente, parágrafos curtos, inclua variáveis como {{nome}} e {{link}}.
Para E-mail: inclua [Assunto: ...] na primeira linha.`;

    const userPrompt = `Gere uma mensagem de ${type} para o objetivo: ${objective}.
Contexto:
- Nome do cliente: ${customer_name || "{{nome}}"}
- Produto: ${product_name || "o produto que você escolheu"}
- Desconto disponível: ${discount_value ? discount_value + "%" : "frete grátis"}
- Tom de voz: ${tone}
- Informações extras da marca: ${brand_context}

Gere 3 variações curtas e eficazes.`;

    const response = await anthropicFetch(ANTHROPIC_API_KEY, {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const data = await response.json();
    const copy = data.content?.[0]?.text;
    if (!response.ok || !copy) {
      const msg = typeof data?.error?.message === "string"
        ? data.error.message
        : (typeof data?.message === "string" ? data.message : JSON.stringify(data?.error ?? data));
      return new Response(
        JSON.stringify({ error: msg || "Anthropic API error", request_id: requestId }),
        { status: 502, headers: JSON_HDR },
      );
    }

    return new Response(JSON.stringify({ copy, request_id: requestId }), { headers: JSON_HDR });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message, request_id: requestId }), { status: 500, headers: JSON_HDR });
  }
});
