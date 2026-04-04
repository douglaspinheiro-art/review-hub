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
    const { loja_id, cliente_ids, canal, prescricao_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Busca configurações de frequência
    const { data: config } = await supabase
      .from("configuracoes_v3")
      .select("cap_msgs_whatsapp_semana, cap_msgs_email_semana, cooldown_pos_compra_dias")
      .eq("loja_id", loja_id)
      .single();

    const cap = canal === "whatsapp"
      ? (config?.cap_msgs_whatsapp_semana ?? 2)
      : (config?.cap_msgs_email_semana ?? 3);

    const cooldownDias = config?.cooldown_pos_compra_dias ?? 7;
    const umaSemanAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const cooldownDate = new Date(Date.now() - cooldownDias * 24 * 60 * 60 * 1000).toISOString();

    // Clientes que já receberam mensagens demais essa semana
    const { data: clientesComCap } = await supabase
      .from("comunicacoes_enviadas")
      .select("cliente_id")
      .eq("loja_id", loja_id)
      .eq("canal", canal)
      .gte("enviado_em", umaSemanAtras)
      .in("cliente_id", cliente_ids);

    const contagem: Record<string, number> = {};
    for (const c of clientesComCap ?? []) {
      contagem[c.cliente_id] = (contagem[c.cliente_id] ?? 0) + 1;
    }

    // Clientes em cooldown pós-compra
    const { data: clientesCooldown } = await supabase
      .from("clientes")
      .select("id")
      .eq("loja_id", loja_id)
      .in("id", cliente_ids)
      .gte("ultima_compra_em", cooldownDate);

    // Clientes com opt-out
    const { data: clientesOptOut } = await supabase
      .from("clientes")
      .select("id")
      .eq("loja_id", loja_id)
      .in("id", cliente_ids)
      .eq(canal === "whatsapp" ? "whatsapp_opt_out" : "email_opt_out", true);

    const idsComCap = Object.entries(contagem).filter(([, n]) => n >= cap).map(([id]) => id);
    const idsCooldown = (clientesCooldown ?? []).map((c: any) => c.id);
    const idsOptOut = (clientesOptOut ?? []).map((c: any) => c.id);

    const excluidos = new Set([
      ...idsComCap,
      ...idsCooldown,
      ...idsOptOut,
    ]);

    const clientesAptos = cliente_ids.filter((id: string) => !excluidos.has(id));

    return new Response(JSON.stringify({
      success: true,
      total_original: cliente_ids.length,
      excluidos: excluidos.size,
      aptos: clientesAptos.length,
      motivos_exclusao: {
        cap_frequencia: idsComCap.length,
        cooldown_pos_compra: idsCooldown.length,
        opt_out: idsOptOut.length,
      },
      clientes_aptos: clientesAptos,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
