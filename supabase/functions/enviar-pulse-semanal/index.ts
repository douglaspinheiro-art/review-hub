import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Busca todas as lojas com pulse ativo
    const { data: configs } = await supabase
      .from("configuracoes_v3")
      .select("*, lojas(*)")
      .eq("pulse_ativo", true)
      .not("pulse_numero_whatsapp", "is", null);

    for (const config of configs ?? []) {
      const loja = (config as any).lojas;

      // Dados da semana (mock — substituir por queries reais)
      const dadosSemana = {
        chs_atual: loja.conversion_health_score,
        chs_variacao: +4,
        receita_recuperada: 8940,
        clientes_reativados: 67,
        prescricoes_concluidas: 2,
        prescricoes_aguardando: 1,
        proxima_oportunidade: {
          titulo: "847 clientes com 60 dias sem comprar",
          potencial: 12400,
        },
      };

      const sinal = dadosSemana.chs_variacao >= 0 ? "↑" : "↓";
      const emoji = dadosSemana.chs_variacao >= 0 ? "📈" : "⚠️";

      const mensagem = `📊 *${loja.nome} — Relatório Semanal*

CHS: ${dadosSemana.chs_atual}/100 ${sinal}${Math.abs(dadosSemana.chs_variacao)}pts ${emoji}

💰 Recuperado: R$ ${dadosSemana.receita_recuperada.toLocaleString('pt-BR')}
👥 Reativados: ${dadosSemana.clientes_reativados} clientes
✅ ${dadosSemana.prescricoes_concluidas} prescrições concluídas

⚡ *${dadosSemana.prescricoes_aguardando} prescrição esperando aprovação:*
"${dadosSemana.proxima_oportunidade.titulo}"
Potencial: R$ ${dadosSemana.proxima_oportunidade.potencial.toLocaleString('pt-BR')}

👉 Acesse o LTV Boost para aprovar`;

      // Aqui vai a integração com WhatsApp Business API
      console.log(`Pulse para ${config.pulse_numero_whatsapp}:`, mensagem);
    }

    return new Response(
      JSON.stringify({ success: true, enviados: configs?.length ?? 0 }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
