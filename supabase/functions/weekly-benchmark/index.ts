// supabase/functions/weekly-benchmark/index.ts
// Deno Edge Function — weekly benchmark report sent via WhatsApp to store owner.
//
// Schedule (Supabase Cron): every Monday at 09:00 BRT
// cron: "0 12 * * 1"  (UTC, = 09:00 BRT)
//
// POST /functions/v1/weekly-benchmark  (manual trigger for testing)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

// Industry benchmarks for comparison
const INDUSTRY_BENCHMARKS = {
  read_rate: 62,       // %
  reply_rate: 8,       // %
  recovery_rate: 23,   // % cart recovery
};

// Tier labels for display
function tierEmoji(pct: number, benchmark: number): string {
  if (pct >= benchmark * 1.1) return "🟢";
  if (pct >= benchmark * 0.9) return "🟡";
  return "🔴";
}

async function processUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<void> {
  // Aggregate this week's analytics_daily
  const { data: dailyRows } = await supabase
    .from("analytics_daily")
    .select("messages_sent, messages_delivered, messages_read, messages_replied, revenue_influenced, active_conversations")
    .eq("user_id", userId)
    .gte("date", weekStart)
    .lt("date", weekEnd);

  if (!dailyRows || dailyRows.length === 0) return;

  const totals = dailyRows.reduce(
    (acc, row) => ({
      sent: acc.sent + (row.messages_sent ?? 0),
      delivered: acc.delivered + (row.messages_delivered ?? 0),
      read: acc.read + (row.messages_read ?? 0),
      replied: acc.replied + (row.messages_replied ?? 0),
      revenue: acc.revenue + Number(row.revenue_influenced ?? 0),
      conversations: Math.max(acc.conversations, row.active_conversations ?? 0),
    }),
    { sent: 0, delivered: 0, read: 0, replied: 0, revenue: 0, conversations: 0 },
  );

  const readRate = totals.sent > 0 ? Math.round((totals.read / totals.sent) * 100) : 0;
  const replyRate = totals.sent > 0 ? Math.round((totals.replied / totals.sent) * 100) : 0;

  // Cart recovery rate this week
  const { count: recoveredCarts } = await supabase
    .from("abandoned_carts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "recovered")
    .gte("recovered_at", weekStart)
    .lt("recovered_at", weekEnd);

  const { count: totalCarts } = await supabase
    .from("abandoned_carts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", weekStart)
    .lt("created_at", weekEnd);

  const recoveryRate = (totalCarts ?? 0) > 0
    ? Math.round(((recoveredCarts ?? 0) / (totalCarts ?? 1)) * 100)
    : 0;

  // Get previous week for comparison
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekStartStr = prevWeekStart.toISOString().split("T")[0];

  const { data: prevReport } = await supabase
    .from("benchmark_reports")
    .select("metrics")
    .eq("user_id", userId)
    .eq("week_start", prevWeekStartStr)
    .maybeSingle();

  const prevRevenue = Number((prevReport?.metrics as Record<string, number> | null)?.revenue ?? 0);
  const revenueChange = prevRevenue > 0
    ? Math.round(((totals.revenue - prevRevenue) / prevRevenue) * 100)
    : null;

  const metrics = {
    sent: totals.sent,
    delivered: totals.delivered,
    read: totals.read,
    replied: totals.replied,
    revenue: totals.revenue,
    conversations: totals.conversations,
    read_rate: readRate,
    reply_rate: replyRate,
    recovery_rate: recoveryRate,
  };

  const benchmarks = {
    read_rate: INDUSTRY_BENCHMARKS.read_rate,
    reply_rate: INDUSTRY_BENCHMARKS.reply_rate,
    recovery_rate: INDUSTRY_BENCHMARKS.recovery_rate,
  };

  // Save to benchmark_reports
  await supabase
    .from("benchmark_reports")
    .upsert(
      { user_id: userId, week_start: weekStart, metrics, benchmarks, sent_at: null },
      { onConflict: "user_id,week_start" },
    );

  // Skip WhatsApp send if no messages were sent this week
  if (totals.sent === 0) return;

  // Get user's WhatsApp connection
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("evolution_api_url, evolution_api_key, instance_name, owner_phone")
    .eq("user_id", userId)
    .eq("status", "connected")
    .maybeSingle();

  if (!conn || !conn.owner_phone) return;

  // Build WhatsApp message
  const readEmoji = tierEmoji(readRate, INDUSTRY_BENCHMARKS.read_rate);
  const replyEmoji = tierEmoji(replyRate, INDUSTRY_BENCHMARKS.reply_rate);
  const recoveryEmoji = recoveryRate > 0 ? tierEmoji(recoveryRate, INDUSTRY_BENCHMARKS.recovery_rate) : "";

  const revenueStr = totals.revenue > 0
    ? `R$ ${totals.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : "—";

  const revenueChangeStr = revenueChange !== null
    ? ` (${revenueChange >= 0 ? "+" : ""}${revenueChange}% vs semana anterior)`
    : "";

  const message =
    `📊 *Relatório Semanal — LTV Boost*\n` +
    `Semana de ${formatDate(weekStart)}\n\n` +
    `📨 *${totals.sent.toLocaleString("pt-BR")}* mensagens enviadas\n` +
    `${readEmoji} Taxa de leitura: *${readRate}%* (benchmark: ${INDUSTRY_BENCHMARKS.read_rate}%)\n` +
    `${replyEmoji} Taxa de resposta: *${replyRate}%* (benchmark: ${INDUSTRY_BENCHMARKS.reply_rate}%)\n` +
    (recoveryRate > 0
      ? `${recoveryEmoji} Recuperação de carrinho: *${recoveryRate}%*\n`
      : "") +
    `\n💰 Receita influenciada: *${revenueStr}*${revenueChangeStr}\n` +
    `\n🟢 acima do benchmark  🟡 dentro  🔴 abaixo\n\n` +
    `Veja o painel completo em ltvboost.com.br/dashboard/relatorios`;

  // Send via Evolution API
  const phone = conn.owner_phone.replace(/\D/g, "");
  const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;

  try {
    await fetch(
      `${conn.evolution_api_url}/message/sendText/${conn.instance_name}`,
      {
        method: "POST",
        headers: {
          "apikey": conn.evolution_api_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: `${normalizedPhone}@s.whatsapp.net`,
          options: { delay: 1000 },
          textMessage: { text: message },
        }),
      },
    );

    // Mark as sent
    await supabase
      .from("benchmark_reports")
      .update({ sent_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("week_start", weekStart);
  } catch (err) {
    console.error(`Failed to send WhatsApp report to user ${userId}:`, err);
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Compute week range (last Monday to this Monday)
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(now);
    thisMonday.setUTCDate(now.getUTCDate() - daysToLastMonday);
    thisMonday.setUTCHours(0, 0, 0, 0);

    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);

    const weekStart = lastMonday.toISOString().split("T")[0];
    const weekEnd = thisMonday.toISOString().split("T")[0];

    // Get all users who had activity this week
    const { data: activeUsers } = await supabase
      .from("analytics_daily")
      .select("user_id")
      .gte("date", weekStart)
      .lt("date", weekEnd)
      .gt("messages_sent", 0);

    if (!activeUsers || activeUsers.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No active users this week" }),
        { headers: CORS },
      );
    }

    const uniqueUserIds = [...new Set(activeUsers.map((r) => r.user_id as string))];
    let processed = 0;
    let errors = 0;

    for (const userId of uniqueUserIds) {
      try {
        await processUser(supabase, userId, weekStart, weekEnd);
        processed++;
      } catch (err) {
        console.error(`Error processing user ${userId}:`, err);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        week_start: weekStart,
        week_end: weekEnd,
        processed,
        errors,
        total: uniqueUserIds.length,
      }),
      { headers: CORS },
    );
  } catch (err) {
    console.error("weekly-benchmark error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: CORS },
    );
  }
});
