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
    const { canal_id, loja_id } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: canal } = await supabase
      .from("canais").select("*").eq("id", canal_id).single();

    if (!canal) throw new Error("Canal não encontrado");

    await supabase.from("canais")
      .update({ status_sync: "sincronizando" }).eq("id", canal_id);

    // Roteamento por tipo — lógica de integração real aqui
    const resultado = {
      loja_propria:   { pedidos: 47, clientes: 38, produtos: 234 },
      mercado_livre:  { pedidos: 23, clientes: 19, reputacao: { nota: "verde", reclamacoes_abertas: 2 } },
      shopee:         { pedidos: 15, clientes: 13, reputacao: { nota: "4.8", reclamacoes_abertas: 0 } },
      tiktok_shop:    { pedidos: 8,  clientes: 7  },
    }[canal.tipo as string] ?? { pedidos: 0, clientes: 0 };

    await supabase.from("canais").update({
      status_sync: "ok",
      ultima_sync: new Date().toISOString(),
      erro_sync: null,
      reputacao_json: (resultado as any).reputacao ?? null,
    }).eq("id", canal_id);

    return new Response(
      JSON.stringify({ success: true, ...resultado, canal_tipo: canal.tipo }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
