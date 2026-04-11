import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyJwt } from "../_shared/edge-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BENCHMARKS: Record<string, number> = {
  "Moda": 2.8, "Beleza e Cosméticos": 3.1, "Suplementos": 3.4,
  "Eletrônicos": 1.9, "Pet": 2.6, "Casa e Decoração": 2.2,
  "Alimentos": 3.0, "Outro": 2.5,
};

const DESCONTO_POR_SEGMENTO: Record<string, { tipo: string; valor: number; justificativa: string }> = {
  campiao:       { tipo: "percentual", valor: 5,  justificativa: "Campeões respondem a qualquer incentivo — não desperdice margem" },
  fiel:          { tipo: "percentual", valor: 8,  justificativa: "Fiéis valorizam reconhecimento mais que desconto" },
  potencial_fiel:{ tipo: "percentual", valor: 10, justificativa: "Incentivo leve para solidificar o hábito de compra" },
  em_risco:      { tipo: "percentual", valor: 15, justificativa: "Precisa de motivo concreto para voltar" },
  hibernando:    { tipo: "percentual", valor: 20, justificativa: "Barreira alta — oferta significativa necessária" },
  perdido:       { tipo: "frete_gratis", valor: 0, justificativa: "Frete grátis tem percepção melhor que cupom para clientes perdidos" },
  novo:          { tipo: "percentual", valor: 10, justificativa: "Incentivar segunda compra é o objetivo" },
  promissor:     { tipo: "percentual", valor: 12, justificativa: "Converter potencial em frequência" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      loja_id,
      visitantes, produto_visto, carrinho, checkout, pedido,
      ticket_medio, meta_conversao, segmento,
      canais_conectados = [],
      total_clientes_unificados = 0,
      clientes_multicanal = 0,
      visitantes_mobile = 0,
      visitantes_desktop = 0,
      pedidos_mobile = 0,
      pedidos_desktop = 0,
      produtos_estoque_critico = 0,
      produtos_avaliacao_baixa = 0,
      historico_prescricoes = [],
      proximos_eventos_sazonais = [],
    } = await req.json();

    const p = (a: number, b: number) =>
      b > 0 ? ((a / b) * 100).toFixed(1) : "0";

    const taxa_produto   = p(produto_visto, visitantes);
    const taxa_carrinho  = p(carrinho, produto_visto);
    const taxa_checkout  = p(checkout, carrinho);
    const taxa_pedido    = p(pedido, checkout);
    const conversao      = ((pedido / visitantes) * 100).toFixed(2);
    const bench          = BENCHMARKS[segmento] ?? 2.5;
    const perda          = Math.round(
      ((meta_conversao / 100) - (Number(conversao) / 100)) * visitantes * ticket_medio
    );

    // CHS com mais dimensões
    const scoreConversao = Math.min(55, Math.round((Number(conversao) / bench) * 55));
    const scoreFunil     = Math.min(20, Math.round(
      ((Number(taxa_produto)/85)*7 + (Number(taxa_carrinho)/45)*7 + (Number(taxa_checkout)/60)*6)
    ));
    const scoreProdutos  = Math.min(15, 15 - Math.min(15, produtos_estoque_critico * 2 + produtos_avaliacao_baixa));
    const scoreMobile    = Math.min(10, visitantes_mobile > 0
      ? Math.round((pedidos_mobile / visitantes_mobile) / (pedidos_desktop / visitantes_desktop || 1) * 5 + 5)
      : 5);
    const chs = scoreConversao + scoreFunil + scoreProdutos + scoreMobile;

    const chs_label =
      chs < 30 ? "Crítico" : chs < 50 ? "Em risco" :
      chs < 70 ? "Regular" : chs < 85 ? "Bom" : "Excelente";

    const cvr_mobile  = visitantes_mobile  > 0 ? ((pedidos_mobile  / visitantes_mobile)  * 100).toFixed(2) : "N/A";
    const cvr_desktop = visitantes_desktop > 0 ? ((pedidos_desktop / visitantes_desktop) * 100).toFixed(2) : "N/A";

    const KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!KEY) throw new Error("ANTHROPIC_API_KEY não configurada");

    const system = `Você é o motor de inteligência do LTV Boost — Conversion Operating System para ecommerce brasileiro.
Você recebe dados de funil, produto e histórico de prescrições anteriores.
Use o histórico para NÃO repetir prescrições que não funcionaram e priorizar abordagens que funcionaram.
Considere o contexto sazonal ao gerar recomendações.
Retorne APENAS este JSON (sem markdown, sem texto extra):
{
  "chs": <number 0-100>,
  "chs_label": "Crítico|Em risco|Regular|Bom|Excelente",
  "chs_breakdown": {
    "conversao": <number>,
    "funil": <number>,
    "produtos": <number>,
    "mobile": <number>
  },
  "resumo": "2 frases diretas em linguagem de lojista",
  "perda_principal": "etapa com maior impacto",
  "percentual_explicado": <number>,
  "problemas": [
    {
      "tipo": "funil|produto|sazonal|reputacao",
      "titulo": "título curto e direto",
      "descricao": "máx 2 frases com dado concreto e benchmark",
      "severidade": "critico|alto|medio|oportunidade",
      "impacto_reais": <number>,
      "causa_raiz": "1 frase explicando o porquê",
      "prescricao_sugerida": {
        "titulo": "nome da ação",
        "canal": "whatsapp|email|sms|multicanal",
        "segmento": "OBRIGATÓRIO: use exatamente um destes valores (minúsculas, sem acento): all | active | inactive | vip | cart_abandoned | rfm_champions | rfm_loyal | rfm_at_risk | rfm_lost | rfm_new | em_risco | campiao | carrinho | hibernando | perdido | novo | fiel | promissor | potencial_fiel",
        "perfil_comportamental": "cacador_desconto|comprador_presente|etc ou null",
        "num_clientes_estimado": <number>,
        "desconto_tipo": "percentual|frete_gratis|fixo",
        "desconto_valor": <number>,
        "desconto_justificativa": "por que esse desconto mínimo",
        "mensagem_base": "template em português brasileiro",
        "melhor_horario": "dia e hora",
        "custo_estimado": <number>,
        "potencial_estimado": <number>,
        "roi_estimado": <number>,
        "prazo_resultado_dias": <number>,
        "ab_teste_recomendado": <boolean>
      }
    }
  ],
  "oportunidades": [
    {
      "titulo": "string",
      "descricao": "string",
      "potencial_reais": <number>,
      "janela_dias": <number>,
      "segmento": "string",
      "evento_sazonal": "nome do evento ou null"
    }
  ],
  "recomendacoes_ux": [
    {
      "titulo": "melhoria específica",
      "descricao": "o que fazer e onde",
      "esforco": "baixo|medio|alto",
      "impacto_pp": <number>,
      "prazo_semanas": <number>,
      "tipo": "quick_win|ab_test|medio_prazo"
    }
  ],
  "forecast_30d": {
    "minimo": <number>,
    "maximo": <number>,
    "com_prescricoes": <number>,
    "com_ux_fixes": <number>
  }
}`;

    const user = `Dados do funil (segmento: ${segmento}):
Canais: ${canais_conectados.join(", ") || "loja própria"}
Clientes únicos: ${total_clientes_unificados} | Multicanal: ${clientes_multicanal}

Funil consolidado:
- Visitantes: ${visitantes} (mobile: ${visitantes_mobile} | desktop: ${visitantes_desktop})
- Produto visto: ${produto_visto} (${taxa_produto}%)
- Carrinho: ${carrinho} (${taxa_carrinho}%)
- Checkout: ${checkout} (${taxa_checkout}%)
- Pedido: ${pedido} (${taxa_pedido}%)

Conversão: geral=${conversao}% | mobile=${cvr_mobile}% | desktop=${cvr_desktop}%
Meta: ${meta_conversao}% | Benchmark: ${bench}%
Ticket médio: R$${ticket_medio} | Perda estimada: R$${perda}/mês
CHS calculado: ${chs}/100 (${chs_label})

Saúde de produtos:
- Produtos com estoque crítico (<5 unidades): ${produtos_estoque_critico}
- Produtos com avaliação abaixo de 3.5: ${produtos_avaliacao_baixa}

Histórico de prescrições (últimas 5):
${historico_prescricoes.length > 0
  ? historico_prescricoes.map((p: any) =>
    `- "${p.titulo}": ${p.funcionou ? '✓ funcionou' : '✗ não funcionou'} | ${p.canal} | seg:${p.segmento} | roi_real:${p.roi_real}x`
  ).join('\n')
  : '- Nenhuma prescrição anterior'}

Eventos sazonais próximos:
${proximos_eventos_sazonais.length > 0
  ? proximos_eventos_sazonais.map((e: any) => `- ${e.nome} em ${e.dias_restantes} dias`).join('\n')
  : '- Nenhum evento nos próximos 30 dias'}

Gere 3 problemas priorizados por impacto, 2 oportunidades e 3 recomendações de UX.
Para cada prescrição, use o desconto mínimo necessário para o segmento alvo.
NÃO repita abordagens de prescrições que não funcionaram.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 3000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const data = await r.json();
    const raw  = data.content[0].text.trim();
    let diag;
    try { diag = JSON.parse(raw); }
    catch { diag = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); }

    // Salvar diagnóstico no banco
    if (loja_id) {
      // Verify the authenticated user owns this store
      const { data: storeData } = await supabase.from("stores").select("user_id").eq("id", loja_id).single();
      if (!storeData || storeData.user_id !== auth.userId) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const storeUserId = storeData.user_id;

      await supabase.from("diagnostics_v3").insert({
        store_id: loja_id,
        user_id: storeUserId,
        diagnostic_json: diag,
        chs,
        chs_label
      });

      // Atualizar CHS da loja — rpc() não é serializável dentro de .update(),
      // então atualizamos o score e executamos o RPC separadamente
      await supabase.from("stores").update({ conversion_health_score: chs }).eq("id", loja_id);
      await supabase.rpc("append_chs_history", { store_id_input: loja_id, new_score: chs, new_label: chs_label });

      // Criar problemas e prescrições sugeridas
      for (const p of diag.problemas) {
        const { data: probData } = await supabase.from("opportunities").insert({
          store_id: loja_id,
          user_id: storeUserId,
          type: p.tipo,
          title: p.titulo,
          description: p.descricao,
          severity: p.severidade,
          estimated_impact: p.impacto_reais,
          root_cause: p.causa_raiz,
          dados_json: p
        }).select().single();

        if (probData && p.prescricao_sugerida) {
          const s = p.prescricao_sugerida;
          await supabase.from("prescriptions").insert({
            store_id: loja_id,
            user_id: storeUserId,
            opportunity_id: probData.id,
            title: s.titulo,
            description: s.descricao || p.descricao,
            execution_channel: s.canal,
            segment_target: s.segmento,
            behavioral_profile_target: s.perfil_comportamental,
            num_clients_target: s.num_clientes_estimado,
            discount_value: s.desconto_valor,
            discount_type: s.desconto_tipo,
            estimated_potential: s.potencial_estimado,
            estimated_roi: s.roi_estimado,
            template_json: {
              mensagem: s.mensagem_base,
              prazo: s.prazo_resultado_dias,
              ab_test: Boolean(s.ab_teste_recomendado),
            },
            status: 'aguardando_aprovacao'
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, diagnostico: diag, chs,
        desconto_por_segmento: DESCONTO_POR_SEGMENTO }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("gerar-diagnostico error:", e);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
