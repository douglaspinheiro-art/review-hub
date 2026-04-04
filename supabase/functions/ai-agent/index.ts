import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Templates de Segurança (Fallback)
const SAFETY_TEMPLATES = [
  "Olá! Recebi sua mensagem e já estou verificando os detalhes para você. Só um momento! 😊",
  "Oi! Tudo bem? Estou consultando as informações aqui no sistema e já te respondo com precisão. 📦",
  "Opa! Como vai? Vou checar isso agora mesmo e te retorno em instantes. 👍"
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { message, contact_phone, loja_id, history = [] } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: config } = await supabase
      .from("agente_ia_config")
      .select("*")
      .eq("loja_id", loja_id)
      .maybeSingle();

    if (!config || !config.ativo) {
      return new Response(JSON.stringify({ success: false, error: "Agente inativo" }), { headers: cors });
    }

    // --- LOGIC: IA CALL WITH TIMEOUT & FALLBACK ---
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    const fetchAI = async () => {
      const promptSistema = `
        Persona: ${config.prompt_sistema}
        Tom de voz: ${config.tom_de_voz}
        Conhecimento da Loja: ${config.conhecimento_loja || "Loja de e-commerce de alta performance."}
        REGRAS: Responda em Português Brasileiro (pt-BR). Seja direto (3-5 linhas). Use emojis moderadamente.
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `INSTRUÇÕES DE SISTEMA: ${promptSistema}` }] },
            ...history.slice(-5).map((h: any) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.content }]
            })),
            { role: "user", parts: [{ text: message }] }
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
        })
      });
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text;
    };

    // Timeout de 8 segundos para a IA
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));
    
    let aiText;
    try {
      aiText = await Promise.race([fetchAI(), timeout]);
    } catch (e) {
      console.error("AI Error or Timeout, using Safety Template:", e.message);
      aiText = SAFETY_TEMPLATES[Math.floor(Math.random() * SAFETY_TEMPLATES.length)];
    }

    return new Response(JSON.stringify({ success: true, response: aiText, is_fallback: !aiText }), {
      headers: { ...cors, "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: cors });
  }
});
