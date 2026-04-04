// supabase/functions/ai-copy/index.ts
// Deno Edge Function — generates WhatsApp copy variations using OpenAI GPT-4o
//
// POST /functions/v1/ai-copy
// Auth: user JWT required
// Body: { context: string, segment: string, tone: string, count?: number }
// Returns: { variations: [{ label, text }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

const SEGMENT_LABELS: Record<string, string> = {
  all: "todos os clientes",
  active: "clientes ativos (compraram recentemente)",
  inactive: "clientes inativos (sem compra há mais de 60 dias)",
  vip: "clientes VIP (top 20% por valor gasto)",
  cart_abandoned: "clientes com carrinho abandonado",
};

const TONE_LABELS: Record<string, string> = {
  friendly: "amigável e próximo",
  urgent: "urgente e persuasivo",
  exclusive: "exclusivo e sofisticado",
  humorous: "leve e bem-humorado",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // Verify auth
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
  }

  try {
    const body = await req.json() as {
      context?: string;
      segment?: string;
      tone?: string;
      count?: number;
    };

    const context = (body.context ?? "").trim();
    const segment = body.segment ?? "all";
    const tone = body.tone ?? "friendly";
    const count = Math.min(body.count ?? 3, 5);

    if (!context) {
      return new Response(
        JSON.stringify({ error: "Informe o contexto da campanha (ex: promoção de Páscoa com 20% OFF)" }),
        { status: 400, headers: CORS },
      );
    }

    const segmentLabel = SEGMENT_LABELS[segment] ?? segment;
    const toneLabel = TONE_LABELS[tone] ?? tone;

    const systemPrompt = `Você é um especialista em copywriting para WhatsApp Marketing no mercado brasileiro de e-commerce.
Você cria mensagens curtas, diretas e com alta taxa de conversão para campanhas de WhatsApp.

Regras obrigatórias:
- Máximo 300 caracteres por mensagem
- Use linguagem informal e próxima do brasileiro
- Inclua um emoji relevante no início ou meio da mensagem
- Use {{nome}} para personalização do nome do cliente
- Use {{link}} para o link de destino (sempre incluir no final)
- Não use "prezado(a)" ou linguagem formal
- Não prometa percentuais ou valores específicos que não foram informados
- Cada variação deve ter um ângulo diferente (ex: curiosidade, FOMO, recompensa, humor)`;

    const userPrompt = `Contexto da campanha: ${context}
Público-alvo: ${segmentLabel}
Tom da mensagem: ${toneLabel}

Crie exatamente ${count} variações de mensagem para WhatsApp.

Responda em JSON com este formato exato:
{
  "variations": [
    { "label": "Nome criativo da variação (2-3 palavras)", "text": "Mensagem completa aqui..." },
    ...
  ]
}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.85,
        max_tokens: 1000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", errText);
      return new Response(
        JSON.stringify({ error: "Serviço de IA temporariamente indisponível. Tente novamente." }),
        { status: 502, headers: CORS },
      );
    }

    const completion = await response.json() as {
      choices: [{ message: { content: string } }];
    };

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { variations?: { label: string; text: string }[] };

    const variations = (parsed.variations ?? []).slice(0, count);

    if (variations.length === 0) {
      return new Response(
        JSON.stringify({ error: "Não foi possível gerar variações. Tente um contexto mais detalhado." }),
        { status: 500, headers: CORS },
      );
    }

    return new Response(JSON.stringify({ variations }), { headers: CORS });
  } catch (err) {
    console.error("ai-copy error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: CORS },
    );
  }
});
