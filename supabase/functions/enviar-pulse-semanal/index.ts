import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/edge-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cronErr = verifyCronSecret(req);
  if (cronErr) return cronErr;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Busca todas as lojas com pulse ativo e número configurado
    const { data: configs, error } = await supabase
      .from("configuracoes_v3")
      .select("*, lojas(*), whatsapp_connections(*)")
      .eq("pulse_ativo", true)
      .not("pulse_numero_whatsapp", "is", null);

    if (error) throw error;

    const agora = new Date();
    const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let enviados = 0;
    let erros = 0;

    for (const config of configs ?? []) {
      const loja = (config as any).lojas;
      const userId = loja?.user_id;
      if (!userId) continue;

      // Calcula métricas reais da semana
      const [prescricoesRes, prescPendentesRes, recuperadoRes] = await Promise.all([
        supabase
          .from("prescricoes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "aprovada")
          .gte("updated_at", seteDiasAtras),
        supabase
          .from("prescricoes")
          .select("id, valor_estimado")
          .eq("user_id", userId)
          .eq("status", "pendente"),
        supabase
          .from("message_sends")
          .select("receita_atribuida")
          .eq("user_id", userId)
          .gte("created_at", seteDiasAtras),
      ]);

      const prescricoesConcluidas = prescricoesRes.count ?? 0;
      const prescricoesPendentes = prescPendentesRes.data ?? [];
      const receitaRecuperada = (recuperadoRes.data ?? []).reduce(
        (acc: number, m: any) => acc + (m.receita_atribuida ?? 0),
        0
      );
      const chsAtual = loja.conversion_health_score ?? 0;

      // Encontra maior oportunidade pendente
      const maiorOportunidade = prescricoesPendentes.sort(
        (a: any, b: any) => (b.valor_estimado ?? 0) - (a.valor_estimado ?? 0)
      )[0];

      const valorPendente = prescricoesPendentes.reduce(
        (acc: number, p: any) => acc + (p.valor_estimado ?? 0),
        0
      );

      const sinal = chsAtual >= 60 ? "↑" : "↓";
      const emoji = chsAtual >= 60 ? "📈" : "⚠️";

      const mensagem = receitaRecuperada > 0
        ? `📊 *${loja.nome} — Relatório Semanal LTV Boost*

CHS: ${chsAtual}/100 ${sinal} ${emoji}

💰 Recuperado esta semana: R$ ${receitaRecuperada.toLocaleString('pt-BR')}
✅ ${prescricoesConcluidas} ${prescricoesConcluidas === 1 ? "prescrição concluída" : "prescrições concluídas"}

${prescricoesPendentes.length > 0 ? `⚡ *R$ ${valorPendente.toLocaleString('pt-BR')} esperando aprovação:*
"${maiorOportunidade?.titulo ?? prescricoesPendentes.length + " oportunidades detectadas"}"

👉 Acesse o LTV Boost para aprovar e recuperar agora` : `✨ Todas as oportunidades da semana foram aprovadas! Bom trabalho.

👉 Acesse o LTV Boost para ver o relatório completo`}`
        : `📊 *${loja.nome} — Resumo Semanal LTV Boost*

${prescricoesPendentes.length > 0
  ? `⚠️ *R$ ${valorPendente.toLocaleString('pt-BR')} identificados e aguardando ação*
${prescricoesPendentes.length} ${prescricoesPendentes.length === 1 ? "oportunidade detectada" : "oportunidades detectadas"} pela IA.

A cada hora sem aprovação, a taxa de recuperação cai ~3%.

👉 Acesse o LTV Boost para não deixar esse dinheiro na mesa`
  : `✅ Nenhuma prescrição pendente esta semana.
Sua loja está operando bem!

👉 Confira o relatório completo no dashboard`}`;

      // Envia via Evolution API (usando a primeira conexão ativa do usuário)
      const conexoes = (config as any).whatsapp_connections ?? [];
      const conexaoAtiva = conexoes.find((c: any) => c.status === "connected");

      if (!conexaoAtiva) {
        console.log(`Usuário ${userId} sem WhatsApp conectado — pulando pulse`);
        continue;
      }

      const evolutionUrl = Deno.env.get("EVOLUTION_API_URL") || loja.evolution_api_url;
      const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") || loja.evolution_api_key;

      if (!evolutionUrl || !evolutionKey) {
        console.log(`Usuário ${userId} sem config Evolution API — pulando pulse`);
        continue;
      }

      try {
        const response = await fetch(
          `${evolutionUrl}/message/sendText/${conexaoAtiva.instance_name}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evolutionKey,
            },
            body: JSON.stringify({
              number: config.pulse_numero_whatsapp,
              text: mensagem,
            }),
          }
        );

        if (response.ok) {
          enviados++;
          // Registra envio do pulse no log
          await supabase.from("analytics_daily").upsert({
            user_id: userId,
            date: agora.toISOString().split("T")[0],
            pulse_enviado: true,
            pulse_receita_exibida: receitaRecuperada,
          }, { onConflict: "user_id,date" });
        } else {
          erros++;
          console.error(`Erro ao enviar pulse para ${userId}:`, await response.text());
        }
      } catch (sendErr) {
        erros++;
        console.error(`Falha na requisição Evolution API para ${userId}:`, sendErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, enviados, erros, total: configs?.length ?? 0 }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enviar-pulse-semanal error:", e);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
