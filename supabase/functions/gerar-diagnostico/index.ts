import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  verifyJwt,
  checkDistributedRateLimit,
  rateLimitedResponseWithRetry,
  corsHeaders as cors,
  validateBrowserOrigin,
} from "../_shared/edge-utils.ts";

const BENCHMARKS: Record<string, number> = {
  "Moda": 2.8, "Beleza e Cosméticos": 3.1, "Suplementos": 3.4,
  "Eletrônicos": 1.9, "Pet": 2.6, "Casa e Decoração": 2.2,
  "Alimentos": 3.0, "Outro": 2.5,
};

type HistoricoPrescricaoLinha = {
  titulo?: string;
  funcionou?: boolean;
  canal?: string;
  segmento?: string;
  roi_real?: number | string;
};

type EventoSazonalLinha = {
  nome?: string;
  dias_restantes?: number;
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

function normalizeSegment(segmento?: string | null) {
  const raw = String(segmento ?? "").trim().toLowerCase();
  if (!raw) return "em_risco";
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return DESCONTO_POR_SEGMENTO[normalized] ? normalized : "em_risco";
}

function buildFallbackDiagnostic(input: {
  chs: number;
  chsLabel: string;
  perda: number;
  ticketMedio: number;
  visitantes: number;
  produtoVisto: number;
  carrinho: number;
  checkout: number;
  pedido: number;
  taxaProduto: string;
  taxaCarrinho: string;
  taxaCheckout: string;
  taxaPedido: string;
  conversao: string;
  bench: number;
  segmento?: string;
  canaisConectados?: string[];
  visitantesMobile?: number;
  visitantesDesktop?: number;
  pedidosMobile?: number;
  pedidosDesktop?: number;
  produtosEstoqueCritico?: number;
  produtosAvaliacaoBaixa?: number;
}) {
  const segmentKey = normalizeSegment(input.segmento);
  const discount = DESCONTO_POR_SEGMENTO[segmentKey] ?? DESCONTO_POR_SEGMENTO.em_risco;
  const channels = input.canaisConectados?.length ? input.canaisConectados.join(", ") : "whatsapp";
  const mobileCvr = input.visitantesMobile && input.visitantesMobile > 0
    ? (input.pedidosMobile ?? 0) / input.visitantesMobile
    : 0;
  const desktopCvr = input.visitantesDesktop && input.visitantesDesktop > 0
    ? (input.pedidosDesktop ?? 0) / input.visitantesDesktop
    : 0;
  const stageDrops = [
    {
      titulo: "Baixa progressão de visitante para produto visto",
      etapa: "Visitante → Produto visto",
      drop: Math.max(0, input.visitantes - input.produtoVisto),
      taxa: input.taxaProduto,
      severidade: "alto",
      tipo: "funil",
      descricao: `Só ${input.taxaProduto}% dos visitantes chegam a visualizar produto. Isso indica vitrine fraca, tráfego pouco qualificado ou páginas lentas no topo do funil.`,
      causa: "A promessa do anúncio ou da home não está levando o cliente para páginas com intenção clara de compra.",
    },
    {
      titulo: "Abandono forte entre produto e carrinho",
      etapa: "Produto visto → Carrinho",
      drop: Math.max(0, input.produtoVisto - input.carrinho),
      taxa: input.taxaCarrinho,
      severidade: "alto",
      tipo: "funil",
      descricao: `Só ${input.taxaCarrinho}% de quem vê produto adiciona ao carrinho. Normalmente isso acontece por preço, frete, prova social ou CTA pouco convincente.`,
      causa: "A página de produto não está reduzindo objeções suficientes para levar o cliente ao próximo passo.",
    },
    {
      titulo: "Queda crítica na finalização do pedido",
      etapa: "Checkout → Pedido",
      drop: Math.max(0, input.checkout - input.pedido),
      taxa: input.taxaPedido,
      severidade: "critico",
      tipo: "funil",
      descricao: `Apenas ${input.taxaPedido}% de quem entra no checkout conclui o pedido. Esse gargalo sozinho já compromete boa parte da conversão total de ${input.conversao}%.`,
      causa: "O checkout está gerando fricção final com custo surpresa, excesso de campos ou falta de confiança.",
    },
  ].sort((a, b) => b.drop - a.drop);

  const principal = stageDrops[0];
  const second = mobileCvr > 0 && desktopCvr > 0 && mobileCvr < desktopCvr * 0.75
    ? {
        titulo: "Conversão mobile abaixo do desktop",
        etapa: "Mobile",
        drop: Math.round((desktopCvr - mobileCvr) * input.visitantesMobile!),
        taxa: (mobileCvr * 100).toFixed(2),
        severidade: "alto",
        tipo: "funil",
        descricao: `No mobile a conversão está em ${(mobileCvr * 100).toFixed(2)}% contra ${(desktopCvr * 100).toFixed(2)}% no desktop. Isso costuma apontar atrito de UX em tela pequena.`,
        causa: "A experiência mobile exige mais esforço que a desktop para completar a compra.",
      }
    : stageDrops[1];
  const third = (input.produtosEstoqueCritico ?? 0) > 0 || (input.produtosAvaliacaoBaixa ?? 0) > 0
    ? {
        titulo: "Catálogo com risco comercial em produtos-chave",
        etapa: "Produto",
        drop: Math.max(input.produtosEstoqueCritico ?? 0, input.produtosAvaliacaoBaixa ?? 0),
        taxa: "0",
        severidade: "medio",
        tipo: "produto",
        descricao: `${input.produtosEstoqueCritico ?? 0} itens estão com estoque crítico e ${input.produtosAvaliacaoBaixa ?? 0} têm avaliação baixa. Isso reduz confiança e derruba a taxa de adição ao carrinho.`,
        causa: "Oferta e reputação de produto não estão sustentando a intenção de compra.",
      }
    : stageDrops[2];

  const impacts = [0.52, 0.28, 0.2].map((ratio) => Math.max(1000, Math.round(input.perda * ratio)));
  const problemas = [principal, second, third].map((item, index) => ({
    tipo: item.tipo,
    titulo: item.titulo,
    descricao: item.descricao,
    severidade: item.severidade,
    impacto_reais: impacts[index],
    causa_raiz: item.causa,
    prescricao_sugerida: {
      titulo: index === 0 ? `Recuperar ${item.etapa}` : index === 1 ? "Acionar campanha segmentada de recuperação" : "Ativar prova social e urgência comercial",
      descricao: item.descricao,
      canal: channels.includes("email") ? "multicanal" : "whatsapp",
      segmento: segmentKey,
      perfil_comportamental: null,
      num_clientes_estimado: Math.max(50, Math.round(input.visitantes * (index === 0 ? 0.18 : 0.1))),
      desconto_tipo: discount.tipo,
      desconto_valor: discount.valor,
      desconto_justificativa: discount.justificativa,
      mensagem_base: `Olá! Identificamos uma oportunidade especial para concluir sua compra com mais facilidade. Responda esta mensagem e ativamos sua condição exclusiva agora.`,
      melhor_horario: index === 0 ? "Hoje às 18h" : index === 1 ? "Amanhã às 10h" : "Hoje às 14h",
      custo_estimado: Math.max(200, Math.round(impacts[index] * 0.04)),
      potencial_estimado: Math.max(1500, Math.round(impacts[index] * 1.8)),
      roi_estimado: 4 + index,
      prazo_resultado_dias: 7 + index * 5,
      ab_teste_recomendado: index !== 2,
    },
  }));

  return {
    chs: input.chs,
    chs_label: input.chsLabel,
    chs_breakdown: {
      conversao: Math.min(55, Math.round((Number(input.conversao) / Math.max(input.bench, 0.1)) * 55)),
      funil: Math.min(20, Math.round((Number(input.taxaProduto) / 100) * 7 + (Number(input.taxaCarrinho) / 100) * 7 + (Number(input.taxaCheckout) / 100) * 6)),
      produtos: Math.max(0, 15 - Math.min(15, (input.produtosEstoqueCritico ?? 0) * 2 + (input.produtosAvaliacaoBaixa ?? 0))),
      mobile: Math.max(0, Math.min(10, mobileCvr > 0 && desktopCvr > 0 ? Math.round((mobileCvr / desktopCvr) * 10) : 6)),
    },
    resumo: `Seu funil está abaixo do benchmark de ${input.bench}% e hoje deixa cerca de R$ ${input.perda.toLocaleString("pt-BR")} por mês na mesa. O maior gargalo está em ${principal.etapa}, então a prioridade é remover fricção de checkout e reativar intenção com campanhas prescritivas imediatas.`,
    perda_principal: principal.etapa,
    percentual_explicado: 82,
    problemas,
    oportunidades: [
      {
        titulo: "Recuperação imediata de intenção de compra",
        descricao: "Ative uma sequência de recuperação para quem abandonou antes de concluir o checkout.",
        potencial_reais: Math.max(2500, Math.round(input.perda * 0.35)),
        janela_dias: 7,
        segmento: segmentKey,
        evento_sazonal: null,
      },
      {
        titulo: "Melhoria rápida na experiência mobile",
        descricao: "Simplifique etapas, destaque frete e remova atritos visuais no celular.",
        potencial_reais: Math.max(1800, Math.round(input.perda * 0.18)),
        janela_dias: 14,
        segmento: "active",
        evento_sazonal: null,
      },
    ],
    recomendacoes_ux: [
      {
        titulo: "Exibir frete e prazo antes do checkout",
        descricao: "Mostre estimativa de frete e prazo já na página de produto e no carrinho para reduzir surpresa no fechamento.",
        esforco: "baixo",
        impacto_pp: 0.45,
        prazo_semanas: 1,
        tipo: "quick_win",
      },
      {
        titulo: "Testar checkout mais curto",
        descricao: "Remova campos não essenciais e teste uma versão com menos etapas, principalmente no mobile.",
        esforco: "medio",
        impacto_pp: 0.62,
        prazo_semanas: 3,
        tipo: "ab_test",
      },
      {
        titulo: "Reforçar prova social nas páginas críticas",
        descricao: "Destaque avaliações, garantia e diferenciais acima da dobra nas páginas com maior tráfego.",
        esforco: "medio",
        impacto_pp: 0.28,
        prazo_semanas: 2,
        tipo: "medio_prazo",
      },
    ],
    forecast_30d: {
      minimo: Math.max(3000, Math.round(input.perda * 0.2)),
      maximo: Math.max(7000, Math.round(input.perda * 0.55)),
      com_prescricoes: Math.max(5000, Math.round(input.perda * 0.33)),
      com_ux_fixes: Math.max(4500, Math.round(input.perda * 0.27)),
    },
  };
}

serve(async (req) => {
  // CORS preflight FIRST — sempre 200 com headers, antes de qualquer validação.
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Origin check (tolerante: se ALLOWED_ORIGIN não estiver setado, apenas avisa).
  const originCheck = validateBrowserOrigin(req);
  if (originCheck) return originCheck;

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Distributed per-user burst guard (replaces in-memory checkRateLimit which is per-instance only).
    const burst = await checkDistributedRateLimit(supabase, `gerar-diagnostico:burst:${auth.userId}`, 8, 60_000);
    if (!burst.allowed) {
      return rateLimitedResponseWithRetry(burst.retryAfterSeconds);
    }

    const bodyJson = await req.json();

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
    } = bodyJson;

    const storeUuid =
      typeof loja_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(loja_id)
        ? loja_id
        : null;

    // Verify the authenticated user owns the store they are diagnosing.
    // Without this check, any authenticated user could trigger AI diagnostics
    // (and burn Anthropic API quota) for any store by providing its UUID.
    if (storeUuid) {
      const { data: ownedStore } = await supabase
        .from("stores")
        .select("id")
        .eq("id", storeUuid)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (!ownedStore) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden" }),
          { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
    }

    // Ponto #6: Add stricter per-store rate limit (1 req / 5 min)
    if (storeUuid) {
      const { data: isRateAllowed, error: rateError } = await supabase.rpc("check_rate_limit", {
        p_key: `gerar-diagnostico:5min:${storeUuid}`,
        p_interval: '5 minutes'
      });
      if (rateError) console.error("Rate limit check error:", rateError);
      if (isRateAllowed === false) {
        return new Response(
          JSON.stringify({ success: false, error: "Aguarde 5 minutos entre gerações de diagnóstico." }),
          { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": "300" } }
        );
      }
    }

    const dayCap = Math.min(100, Math.max(1, Number(Deno.env.get("GERAR_DIAGNOSTICO_MAX_PER_STORE_PER_DAY") ?? "20") || 20));
    const rateKey = storeUuid ? `gerar-diagnostico:store:${storeUuid}` : `gerar-diagnostico:user:${auth.userId}`;
    const dist = await checkDistributedRateLimit(supabase, rateKey, dayCap, 86_400_000);
    if (!dist.allowed) {
      return rateLimitedResponseWithRetry(dist.retryAfterSeconds);
    }

    // Guard against division by zero before any rate computation
    if (!visitantes || visitantes <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "visitantes deve ser maior que zero" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const p = (a: number, b: number) =>
      b > 0 ? ((a / b) * 100).toFixed(1) : "0";

    const taxa_produto   = p(produto_visto, visitantes);
    const taxa_carrinho  = p(carrinho, produto_visto);
    const taxa_checkout  = p(checkout, carrinho);
    const taxa_pedido    = p(pedido, checkout);
    const conversao      = ((pedido / visitantes) * 100).toFixed(2);
    const bench          = BENCHMARKS[segmento as string] ?? 2.5;
    // Lacuna vs benchmark de segmento (não usar meta_conversao do body — o cliente às vezes enviava a CVR medida)
    const perda = Math.max(
      0,
      Math.round(
        ((bench / 100) - (Number(conversao) / 100)) * visitantes * ticket_medio,
      ),
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
  ? (historico_prescricoes as HistoricoPrescricaoLinha[]).map((p) =>
    `- "${p.titulo ?? ""}": ${p.funcionou ? '✓ funcionou' : '✗ não funcionou'} | ${p.canal ?? ""} | seg:${p.segmento ?? ""} | roi_real:${p.roi_real}x`
  ).join('\n')
  : '- Nenhuma prescrição anterior'}

Eventos sazonais próximos:
${proximos_eventos_sazonais.length > 0
  ? (proximos_eventos_sazonais as EventoSazonalLinha[]).map((e) => `- ${e.nome ?? ""} em ${e.dias_restantes ?? "?"} dias`).join('\n')
  : '- Nenhum evento nos próximos 30 dias'}

Gere 3 problemas priorizados por impacto, 2 oportunidades e 3 recomendações de UX.
Para cada prescrição, use o desconto mínimo necessário para o segmento alvo.
NÃO repita abordagens de prescrições que não funcionaram.`;

    // Anthropic call with per-attempt 25s timeout + exponential backoff on 429/5xx.
    // Without an explicit signal, a hanging Anthropic response would hold the Edge
    // Function open until Supabase's runtime kills it (~60-120s), giving the user no
    // feedback. The AbortController gives us a clean, user-readable error at 25s.
    const ANTHROPIC_TIMEOUT_MS = 25_000;

    async function callAnthropicWithRetry(maxRetries = 1): Promise<Response> {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
        let res: Response;
        try {
          res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            signal: controller.signal,
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
        } catch (err) {
          clearTimeout(timeoutId);
          if (err instanceof Error && err.name === "AbortError") {
            console.warn(`[gerar-diagnostico] Anthropic fetch timed out after ${ANTHROPIC_TIMEOUT_MS}ms (attempt ${attempt + 1}/${maxRetries})`);
            if (attempt < maxRetries - 1) {
              await new Promise(r => setTimeout(r, 1_000));
              continue;
            }
            throw new Error("A IA demorou mais do que o esperado. Tente novamente em alguns instantes.");
          }
          throw err;
        }
        clearTimeout(timeoutId);
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = res.headers.get("retry-after");
          const waitMs = retryAfter
            ? Math.min(Number(retryAfter) * 1000, 16_000)
            : Math.min(1000 * Math.pow(2, attempt), 8_000);
          console.warn(`[gerar-diagnostico] Anthropic HTTP ${res.status}, retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        return res;
      }
      throw new Error("Anthropic API indisponível após retentativas.");
    }

    let diag: Record<string, unknown>;
    try {
      if (!KEY) throw new Error("ANTHROPIC_API_KEY não configurada");

      const r = await callAnthropicWithRetry();
      const data = await r.json();
      if (!data.content?.[0]?.text) {
        console.error("[gerar-diagnostico] Resposta inesperada da Anthropic:", JSON.stringify(data).slice(0, 300));
        throw new Error("Resposta inválida da Anthropic API");
      }
      const raw = data.content[0].text.trim();
      try {
        diag = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/)?.[0];
        if (!match) throw new Error("Anthropic retornou JSON inválido");
        diag = JSON.parse(match);
      }
    } catch (error) {
      console.warn("[gerar-diagnostico] Usando fallback local para diagnóstico:", error instanceof Error ? error.message : String(error));
      diag = buildFallbackDiagnostic({
        chs,
        chsLabel: chs_label,
        perda,
        ticketMedio: ticket_medio,
        visitantes,
        produtoVisto: produto_visto,
        carrinho,
        checkout,
        pedido,
        taxaProduto: taxa_produto,
        taxaCarrinho: taxa_carrinho,
        taxaCheckout: taxa_checkout,
        taxaPedido: taxa_pedido,
        conversao,
        bench,
        segmento,
        canaisConectados: canais_conectados,
        visitantesMobile: visitantes_mobile,
        visitantesDesktop: visitantes_desktop,
        pedidosMobile: pedidos_mobile,
        pedidosDesktop: pedidos_desktop,
        produtosEstoqueCritico: produtos_estoque_critico,
        produtosAvaliacaoBaixa: produtos_avaliacao_baixa,
      });
    }

    // Validate minimum required fields from AI response
    if (!diag || typeof diag !== "object" || !Array.isArray(diag.problemas)) {
      console.error("[gerar-diagnostico] Diagnóstico sem campo 'problemas':", JSON.stringify(diag).slice(0, 200));
      throw new Error("Diagnóstico gerado sem estrutura mínima requerida");
    }
    if (diag.problemas.length === 0) {
      console.error("[gerar-diagnostico] IA retornou array 'problemas' vazio — resposta incompleta");
      throw new Error("Diagnóstico gerado sem problemas identificados. Tente novamente.");
    }

    // Compute recommended_plan server-side (mirror of frontend recommendPlan rules)
    // Keeps /resultado and /planos consistent even if the rule changes later.
    const problemasArr = Array.isArray(diag.problemas) ? (diag.problemas as Array<{ severidade?: string }>) : [];
    const problemasCriticos = problemasArr.filter(
      (p) => String(p?.severidade ?? "").toLowerCase() === "critico",
    ).length;
    let recommendedPlan: "growth" | "scale" = "growth";
    if (chs < 25 || perda > 200_000) {
      recommendedPlan = "scale";
    } else if (chs < 40 || perda > 50_000 || problemasCriticos >= 2) {
      recommendedPlan = "growth";
    }

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
        chs_label,
        recommended_plan: recommendedPlan,
      });

      // Atualizar CHS da loja — rpc() não é serializável dentro de .update(),
      // então atualizamos o score e executamos o RPC separadamente
      await supabase.from("stores").update({ conversion_health_score: chs }).eq("id", loja_id);
      await supabase.rpc("append_chs_history", { store_id_input: loja_id, new_score: chs, new_label: chs_label });

      // Batch insert opportunities (single round-trip instead of N)
      type DiagProblema = {
        tipo?: string; titulo?: string; descricao?: string; severidade?: string;
        impacto_reais?: unknown; causa_raiz?: string; prescricao_sugerida?: Record<string, unknown>;
      };
      const problemas = (diag.problemas as DiagProblema[]).filter(p => p && typeof p === "object");
      const oppsPayload = problemas.map(p => ({
        store_id: loja_id,
        user_id: storeUserId,
        type: p.tipo ?? "funil",
        title: p.titulo ?? "Problema identificado",
        description: p.descricao ?? "",
        severity: p.severidade ?? "medio",
        estimated_impact: Number.isFinite(Number(p.impacto_reais)) ? Number(p.impacto_reais) : 0,
        root_cause: p.causa_raiz ?? null,
        dados_json: p,
      }));

      const { data: insertedOpps } = await supabase
        .from("opportunities")
        .insert(oppsPayload)
        .select("id");

      // Batch insert prescriptions for all problems that have a suggestion
      const rxPayload = [];
      for (let i = 0; i < problemas.length; i++) {
        const p = problemas[i];
        const s = p.prescricao_sugerida;
        const oppId = insertedOpps?.[i]?.id;
        if (s && oppId) {
          rxPayload.push({
            store_id: loja_id,
            user_id: storeUserId,
            opportunity_id: oppId,
            title: String(s.titulo ?? "Prescrição sugerida"),
            description: String(s.descricao ?? p.descricao ?? ""),
            execution_channel: String(s.canal ?? "whatsapp"),
            segment_target: String(s.segmento ?? "all"),
            behavioral_profile_target: s.perfil_comportamental ?? null,
            num_clients_target: Number.isFinite(Number(s.num_clientes_estimado)) ? Number(s.num_clientes_estimado) : null,
            discount_value: Number.isFinite(Number(s.desconto_valor)) ? Number(s.desconto_valor) : null,
            discount_type: s.desconto_tipo ?? null,
            estimated_potential: Number.isFinite(Number(s.potencial_estimado)) ? Number(s.potencial_estimado) : null,
            estimated_roi: Number.isFinite(Number(s.roi_estimado)) ? Number(s.roi_estimado) : null,
            template_json: {
              mensagem: s.mensagem_base ?? "",
              prazo: s.prazo_resultado_dias ?? null,
              ab_test: Boolean(s.ab_teste_recomendado),
            },
            status: "aguardando_aprovacao",
          });
        }
      }
      if (rxPayload.length > 0) {
        await supabase.from("prescriptions").insert(rxPayload);
      }
    }

    return new Response(
      JSON.stringify({ success: true, diagnostico: diag, chs,
        recommended_plan: recommendedPlan,
        persisted: Boolean(loja_id),
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
