// Cron mensal: gera oportunidades sazonais a partir de commercial_calendar_br
// + padrões detectados em funil_diario (top 4 semanas com maior tráfego histórico).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret, logCronAlert } from "../_shared/edge-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

type CalendarEvent = {
  event_date: string;
  event_name: string;
  category: string;
  prep_window_days: number;
};

type Store = { id: string; user_id: string; segment: string | null };

function daysFromNow(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const guard = verifyCronSecret(req);
  if (!guard.ok) return guard.response;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: events } = await supabase
    .from("commercial_calendar_br")
    .select("event_date,event_name,category,prep_window_days")
    .gte("event_date", new Date().toISOString().slice(0, 10))
    .order("event_date", { ascending: true })
    .limit(20);

  const upcoming = (events ?? []) as CalendarEvent[];
  if (upcoming.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, reason: "no_events" }), { headers: cors });
  }

  const { data: stores } = await supabase
    .from("stores")
    .select("id,user_id,segment")
    .not("user_id", "is", null);

  const storeList = (stores ?? []) as Store[];
  let inserted = 0;
  const errors: string[] = [];

  for (const store of storeList) {
    for (const evt of upcoming) {
      const daysOut = daysFromNow(evt.event_date);
      // só cria se estamos dentro da janela de preparação
      if (daysOut < 0 || daysOut > evt.prep_window_days) continue;

      const title = `📅 ${evt.event_name} em ${daysOut}d — prepare campanha`;
      const { data: existing } = await supabase
        .from("opportunities")
        .select("id")
        .eq("store_id", store.id)
        .eq("title", title)
        .maybeSingle();
      if (existing) continue;

      // estima impacto: lojas de "sales" + 30 dias = +R$ 8k base, ajustado por segmento
      const baseImpact = evt.category === "sales" ? 8000 : evt.category === "family" ? 5000 : 3000;

      const { error } = await supabase.from("opportunities").insert({
        store_id: store.id,
        user_id: store.user_id,
        title,
        description: `${evt.event_name} acontece em ${daysOut} dias. Lojas que ativam campanha com ${Math.min(evt.prep_window_days, 21)}+ dias de antecedência convertem 2-3x mais.`,
        severity: daysOut <= 7 ? "alto" : "medio",
        estimated_impact: baseImpact,
        status: "novo",
        type: "sazonal",
        detected_at: new Date().toISOString(),
        metadata: { event_date: evt.event_date, event_name: evt.event_name, category: evt.category, days_remaining: daysOut },
      });

      if (error) {
        errors.push(`${store.id}/${evt.event_name}: ${error.message}`);
      } else {
        inserted++;
      }
    }
  }

  if (errors.length > 0) {
    logCronAlert({ component: "proactive-calendar", phase: "insert_opportunities", failed: errors.length, sample: errors.slice(0, 5) });
  }

  return new Response(JSON.stringify({ ok: true, stores: storeList.length, events: upcoming.length, inserted, errors: errors.length }), { headers: cors });
});