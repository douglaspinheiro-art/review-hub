import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/edge-utils.ts";
import { metaGraphSendText } from "../_shared/meta-graph-send.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SettingsPulse = {
  id: string;
  user_id: string;
  store_id: string | null;
  pulse_whatsapp_number: string | null;
};

type StorePulseRow = {
  id: string;
  name: string;
  conversion_health_score: number | null;
};

type WaConnRow = {
  instance_name: string | null;
  provider: string;
  meta_phone_number_id: string | null;
  meta_access_token: string | null;
  meta_api_version: string | null;
};

async function resolveStoreId(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  row: SettingsPulse
): Promise<{ storeId: string | null; storeName: string; chs: number }> {
  if (row.store_id) {
    const { data: s } = await supabase
      .from("stores")
      .select("id, name, conversion_health_score")
      .eq("id", row.store_id)
      .maybeSingle();
    const rowS = s as StorePulseRow | null;
    return {
      storeId: rowS?.id ?? row.store_id,
      storeName: rowS?.name ?? "Loja",
      chs: Number(rowS?.conversion_health_score ?? 0),
    };
  }
  const { data: s } = await supabase
    .from("stores")
    .select("id, name, conversion_health_score")
    .eq("user_id", row.user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const rowS = s as StorePulseRow | null;
  return {
    storeId: rowS?.id ?? null,
    storeName: rowS?.name ?? "Loja",
    chs: Number(rowS?.conversion_health_score ?? 0),
  };
}

function prescTitulo(p: Record<string, unknown>) {
  return String((p as { titulo?: string }).titulo ?? p.title ?? "");
}

function prescValor(p: Record<string, unknown>) {
  const v = (p as { valor_estimado?: unknown }).valor_estimado ?? p.estimated_potential;
  return typeof v === "number" ? v : Number(v ?? 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cronErr = verifyCronSecret(req);
  if (cronErr) return cronErr;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settingsRows, error } = await supabase
      .from("settings_v3")
      .select("id, user_id, store_id, pulse_whatsapp_number, pulse_active")
      .eq("pulse_active", true)
      .not("pulse_whatsapp_number", "is", null);

    if (error) throw error;

    const agora = new Date();
    const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let enviados = 0;
    let erros = 0;

    for (const raw of settingsRows ?? []) {
      const config = raw as SettingsPulse;
      const userId = config.user_id;
      const destino = (config.pulse_whatsapp_number ?? "").trim();
      if (!userId || !destino) continue;

      const { storeId, storeName, chs: chsAtual } = await resolveStoreId(supabase, config);

      let prescAprovadas = supabase
        .from("prescricoes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["aprovada", "approved", "concluida", "completed", "em_execucao"])
        .gte("updated_at", seteDiasAtras);
      let prescPendentesQ = supabase
        .from("prescricoes")
        .select("id, title, estimated_potential")
        .eq("user_id", userId)
        .in("status", ["pendente", "pending", "draft", "aguardando_aprovacao"])
        .limit(50);
      if (storeId) {
        prescAprovadas = prescAprovadas.eq("store_id", storeId);
        prescPendentesQ = prescPendentesQ.eq("store_id", storeId);
      }

      const [prescricoesRes, prescPendentesRes] = await Promise.all([
        prescAprovadas,
        prescPendentesQ,
      ]);

      const prescricoesConcluidas = prescricoesRes.count ?? 0;
      const prescricoesPendentes = (prescPendentesRes.data ?? []) as Record<string, unknown>[];

      const maiorOportunidade = [...prescricoesPendentes].sort(
        (a, b) => prescValor(b) - prescValor(a)
      )[0];

      const valorPendente = prescricoesPendentes.reduce((acc, p) => acc + prescValor(p), 0);

      const sinal = chsAtual >= 60 ? "↑" : "↓";
      const emoji = chsAtual >= 60 ? "📈" : "⚠️";

      const tituloMaior = maiorOportunidade ? prescTitulo(maiorOportunidade) : "";

      const mensagem = `📊 *${storeName} — Resumo Semanal LTV Boost*

CHS: ${chsAtual}/100 ${sinal} ${emoji}
✅ ${prescricoesConcluidas} ${prescricoesConcluidas === 1 ? "prescrição concluída" : "prescrições concluídas"} (7 dias)

${prescricoesPendentes.length > 0
  ? `⚠️ *R$ ${valorPendente.toLocaleString("pt-BR")} identificados e aguardando ação*
${prescricoesPendentes.length} ${prescricoesPendentes.length === 1 ? "oportunidade detectada" : "oportunidades detectadas"} pela IA.

${tituloMaior ? `Destaque: _${tituloMaior}_` : ""}

👉 Acesse o LTV Boost para não deixar esse dinheiro na mesa`
  : `✅ Nenhuma prescrição pendente esta semana.
Sua loja está operando bem!

👉 Confira o relatório completo no dashboard`}`;

      const connQuery = supabase
        .from("whatsapp_connections")
        .select("id, instance_name, status, provider, meta_phone_number_id, meta_access_token, meta_api_version")
        .eq("user_id", userId)
        .eq("status", "connected")
        .eq("provider", "meta_cloud");
      if (storeId) connQuery.eq("store_id", storeId);
      const { data: conexoes } = await connQuery.order("updated_at", { ascending: false }).limit(3);

      const list = (conexoes ?? []) as WaConnRow[];
      const conexaoAtiva = list.find((c) =>
        Boolean(
          c.instance_name &&
            c.meta_phone_number_id?.trim() &&
            c.meta_access_token?.trim() &&
            c.provider === "meta_cloud",
        )
      );

      if (!conexaoAtiva) {
        console.log(`Usuário ${userId} sem Meta Cloud API conectada — pulando pulse`);
        continue;
      }

      const numDigits = destino.replace(/\D/g, "");
      if (numDigits.length < 10) {
        console.log(`Pulse número inválido para ${userId}`);
        continue;
      }

      try {
        await metaGraphSendText(
          conexaoAtiva.meta_phone_number_id!,
          conexaoAtiva.meta_access_token!,
          numDigits,
          mensagem,
          conexaoAtiva.meta_api_version ?? "v21.0",
        );
        enviados++;
      } catch (sendErr) {
        erros++;
        console.error(`Falha ao enviar pulse Meta para ${userId}:`, sendErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, enviados, erros, total: settingsRows?.length ?? 0 }),
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
