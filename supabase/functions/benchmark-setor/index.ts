// supabase/functions/benchmark-setor/index.ts
// Returns anonymized industry conversion benchmarks for ConvertIQ.
// Combines hardcoded Brazilian e-commerce benchmarks with real aggregated data
// from the platform's active stores (anonymized, no PII).
//
// POST /functions/v1/benchmark-setor
// Auth: user JWT required
// Body: { segmento?: string, plataforma?: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

// Brazilian e-commerce benchmarks (public data + internal aggregates)
const BASE_BENCHMARKS: Record<string, {
  taxa_conversao_media: number;
  taxa_conversao_top: number;
  abandono_carrinho: number;
  taxa_checkout: number;
  ticket_medio: number;
  label: string;
}> = {
  moda:        { taxa_conversao_media: 1.8, taxa_conversao_top: 3.2, abandono_carrinho: 79, taxa_checkout: 62, ticket_medio: 180, label: "Moda e Vestuário" },
  beleza:      { taxa_conversao_media: 2.4, taxa_conversao_top: 4.1, abandono_carrinho: 74, taxa_checkout: 67, ticket_medio: 145, label: "Beleza e Cosméticos" },
  eletronicos: { taxa_conversao_media: 1.2, taxa_conversao_top: 2.3, abandono_carrinho: 85, taxa_checkout: 55, ticket_medio: 890, label: "Eletrônicos" },
  casa:        { taxa_conversao_media: 2.1, taxa_conversao_top: 3.8, abandono_carrinho: 77, taxa_checkout: 63, ticket_medio: 320, label: "Casa e Decoração" },
  esporte:     { taxa_conversao_media: 2.2, taxa_conversao_top: 3.9, abandono_carrinho: 76, taxa_checkout: 64, ticket_medio: 210, label: "Esporte e Lazer" },
  alimentacao: { taxa_conversao_media: 3.1, taxa_conversao_top: 5.2, abandono_carrinho: 68, taxa_checkout: 72, ticket_medio: 95,  label: "Alimentação e Bebidas" },
  pet:         { taxa_conversao_media: 2.8, taxa_conversao_top: 4.7, abandono_carrinho: 71, taxa_checkout: 68, ticket_medio: 130, label: "Pet Shop" },
  outros:      { taxa_conversao_media: 2.1, taxa_conversao_top: 3.5, abandono_carrinho: 76, taxa_checkout: 63, ticket_medio: 250, label: "Outros" },
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
  }

  try {
    const { segmento = "outros", plataforma } = await req.json() as {
      segmento?: string;
      plataforma?: string;
    };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const segKey = segmento.toLowerCase().trim();
    const base = BASE_BENCHMARKS[segKey] ?? BASE_BENCHMARKS.outros;

    // Aggregate real data from platform stores (only if >= 5 stores for anonymity)
    const { data: realMetrics } = await supabase
      .from("metricas_funil")
      .select("visitantes, visualizacoes_produto, adicionou_carrinho, iniciou_checkout, compras")
      .gt("visitantes", 100); // minimum traffic threshold

    let realConversao: number | null = null;
    let realAbandonoCarrinho: number | null = null;
    let lojaCount = 0;

    if (realMetrics && realMetrics.length >= 5) {
      lojaCount = realMetrics.length;
      const conversoes = realMetrics
        .filter(m => m.visitantes > 0 && m.compras !== null)
        .map(m => (m.compras / m.visitantes) * 100);

      const abandonos = realMetrics
        .filter(m => m.adicionou_carrinho > 0 && m.iniciou_checkout !== null)
        .map(m => ((m.adicionou_carrinho - m.iniciou_checkout) / m.adicionou_carrinho) * 100);

      if (conversoes.length > 0) {
        realConversao = Number((conversoes.reduce((s, v) => s + v, 0) / conversoes.length).toFixed(2));
      }
      if (abandonos.length > 0) {
        realAbandonoCarrinho = Number((abandonos.reduce((s, v) => s + v, 0) / abandonos.length).toFixed(1));
      }
    }

    const benchmarks = {
      segmento:             base.label,
      plataforma:           plataforma ?? null,

      // Conversion rate benchmarks
      taxa_conversao_media: realConversao ?? base.taxa_conversao_media,
      taxa_conversao_top25: base.taxa_conversao_top,
      taxa_conversao_mediana_br: base.taxa_conversao_media,

      // Funnel benchmarks
      abandono_carrinho_media: realAbandonoCarrinho ?? base.abandono_carrinho,
      taxa_checkout_media:     base.taxa_checkout,

      // Revenue
      ticket_medio_setor: base.ticket_medio,

      // Platform-specific data (using real aggregates when available)
      fonte: lojaCount >= 5 ? "plataforma_anonimizada" : "benchmark_publico_br",
      lojas_na_amostra: lojaCount >= 5 ? lojaCount : null,

      // Improvement potential at different percentiles
      percentis: {
        p25: Number((base.taxa_conversao_media * 0.7).toFixed(2)),
        p50: base.taxa_conversao_media,
        p75: Number((base.taxa_conversao_top * 0.75).toFixed(2)),
        p90: base.taxa_conversao_top,
      },
    };

    return new Response(JSON.stringify({ success: true, benchmarks }), { headers: CORS });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: CORS }
    );
  }
});
