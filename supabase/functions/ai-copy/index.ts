import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { corsHeaders } from "../_shared/edge-utils.ts";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRL(key: string, max = 15, windowMs = 60_000): boolean {
  const now = Date.now();
  const e = rateLimitMap.get(key);
  if (!e || now > e.resetAt) { rateLimitMap.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

const BodySchema = z.object({
  type: z.enum(["whatsapp", "email"]),
  objective: z.enum(["recuperar_carrinho", "boas_vindas", "reativacao", "upsell"]),
  customer_name: z.string().max(200).optional(),
  product_name: z.string().max(500).optional(),
  discount_value: z.number().min(0).max(100).optional(),
  tone: z.enum(["persuasivo", "amigavel", "urgente"]).default("persuasivo"),
  brand_context: z.string().max(2000).default(""),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { type, objective, customer_name, product_name, discount_value, tone, brand_context } = parsed.data;

    const clientIp = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRL(clientIp)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: corsHeaders });
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
- Nome do cliente: ${customer_name || '{{nome}}'}
- Produto: ${product_name || 'o produto que você escolheu'}
- Desconto disponível: ${discount_value ? discount_value + '%' : 'frete grátis'}
- Tom de voz: ${tone}
- Informações extras da marca: ${brand_context}

Gere 3 variações curtas e eficazes.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", max_tokens: 1000, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
    });

    const data = await response.json();
    const copy = data.content[0].text;

    return new Response(JSON.stringify({ copy }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
