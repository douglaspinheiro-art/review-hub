/**
 * LTV Boost v4 — AI Copywriting Engine
 * Generates persuasive messages for WhatsApp/Email using Claude 3.5 Sonnet
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { 
      type, // 'whatsapp' | 'email'
      objective, // 'recuperar_carrinho' | 'boas_vindas' | 'reativacao' | 'upsell'
      customer_name,
      product_name,
      discount_value,
      tone = "persuasivo", // 'persuasivo' | 'amigavel' | 'urgente'
      brand_context = ""
    } = await req.json();

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
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await response.json();
    const copy = data.content[0].text;

    return new Response(JSON.stringify({ copy }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
