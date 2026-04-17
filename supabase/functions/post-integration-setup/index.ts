/**
 * Seed idempotente de automações e jornadas padrão após integração e-commerce.
 * Mantém os mesmos defaults que `src/lib/automations-meta.ts` + `src/lib/journey-defaults.ts` (sincronizar ao alterar).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": Deno.env.get("INTEGRATIONS_CORS_ORIGIN") ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-internal-secret",
  };
}

async function runSeeding(
  client: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ automationsSeeded: boolean; journeysStoresSeeded: number }> {
  let automationsSeeded = false;
  const { count: autoCount, error: autoCountErr } = await client
    .from("automations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (autoCountErr) throw autoCountErr;

  if ((autoCount ?? 0) === 0) {
    const rows = AUTOMATION_SEED.map((a) => ({
      user_id: userId,
      name: a.name,
      trigger: a.trigger,
      message_template: a.message_template,
      delay_minutes: a.delay_minutes,
      is_active: a.is_active,
    }));
    const { error: insAuto } = await client.from("automations").insert(rows);
    if (insAuto) throw insAuto;
    automationsSeeded = true;
  }

  const { data: stores, error: storesErr } = await client
    .from("stores")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (storesErr) throw storesErr;

  let journeysStoresSeeded = 0;
  const nowIso = new Date().toISOString();

  for (const row of stores ?? []) {
    const { count: jc, error: jcErr } = await client
      .from("journeys_config")
      .select("id", { count: "exact", head: true })
      .eq("store_id", row.id);

    if (jcErr) throw jcErr;
    if ((jc ?? 0) > 0) continue;

    const jrows = JOURNEY_SEED.map((j) => ({
      ...j,
      store_id: row.id,
      kpi_atual: 0,
      updated_at: nowIso,
    }));
    const { error: upErr } = await client.from("journeys_config").upsert(jrows, {
      onConflict: "store_id,tipo_jornada",
    });
    if (upErr) throw upErr;
    journeysStoresSeeded += 1;
  }

  return { automationsSeeded, journeysStoresSeeded };
}

const AUTOMATION_SEED: {
  name: string;
  trigger: string;
  message_template: string;
  delay_minutes: number;
  is_active: boolean;
}[] = [
  {
    name: "Jornada do Novo Cliente",
    trigger: "new_contact",
    message_template: "Olá {{name}}! Obrigado pela sua compra. Já separamos tudo com carinho pra você 🎉",
    delay_minutes: 0,
    is_active: true,
  },
  {
    name: "Carrinho Abandonado",
    trigger: "cart_abandoned",
    message_template: "Oi {{name}}, você deixou itens no carrinho! Finalize aqui: {{magic_link}} 🛒",
    delay_minutes: 60,
    is_active: true,
  },
  {
    name: "Boleto/PIX Vencido",
    trigger: "custom",
    message_template: "{{name}}, seu pedido está aguardando pagamento. Quer um link PIX direto? ⚡",
    delay_minutes: 120,
    is_active: true,
  },
  {
    name: "Reativação Automática",
    trigger: "customer_inactive",
    message_template: "Sentimos sua falta, {{name}}! Preparamos algo especial só pra você 💜",
    delay_minutes: 86400,
    is_active: true,
  },
  {
    name: "Pós-compra e Cross-sell",
    trigger: "order_delivered",
    message_template: "{{name}}, seu pedido foi entregue! Como foi a experiência? 😊",
    delay_minutes: 1440,
    is_active: true,
  },
  {
    name: "Fidelidade — Pontos",
    trigger: "custom",
    message_template: "{{name}}, você acumulou novos pontos! Veja suas recompensas disponíveis 🎁",
    delay_minutes: 0,
    is_active: true,
  },
  {
    name: "Aniversário",
    trigger: "customer_birthday",
    message_template: "Feliz aniversário, {{name}}! Preparamos um presente especial pra você 🎂",
    delay_minutes: -4320,
    is_active: true,
  },
];

type JourneyRow = {
  tipo_jornada: string;
  ativa: boolean;
  config_json: Record<string, unknown>;
};

const JOURNEY_SEED: JourneyRow[] = [
  {
    tipo_jornada: "cart_abandoned",
    ativa: true,
    config_json: {
      delay_minutes: 20,
      message_template: "Oi {{nome}}! Seu carrinho ainda está reservado. Finalize aqui: {{link}}",
    },
  },
  {
    tipo_jornada: "reactivation",
    ativa: true,
    config_json: {
      delay_minutes: 60,
      message_template: "{{nome}}, sentimos sua falta. Volte com uma oferta especial: {{link}}",
    },
  },
  {
    tipo_jornada: "birthday",
    ativa: true,
    config_json: {
      delay_minutes: 0,
      message_template: "Parabéns, {{nome}}! Preparamos um presente para você hoje: {{link}}",
    },
  },
  {
    tipo_jornada: "post_purchase",
    ativa: true,
    config_json: {
      delay_minutes: 1440,
      message_template:
        "Obrigado pela compra, {{nome}}! Aqui está um benefício para seu próximo pedido: {{link}}",
    },
  },
  {
    tipo_jornada: "welcome",
    ativa: true,
    config_json: {
      delay_minutes: 5,
      message_template: "Bem-vindo(a), {{nome}}! Confira nossas ofertas iniciais: {{link}}",
    },
  },
  {
    tipo_jornada: "review_request",
    ativa: true,
    config_json: {
      delay_minutes: 2880,
      message_template: "{{nome}}, como foi sua experiência? Sua avaliação é muito importante.",
    },
  },
  {
    tipo_jornada: "winback",
    ativa: true,
    config_json: {
      delay_minutes: 10080,
      message_template: "Tem novidade para você, {{nome}}. Reative seu benefício aqui: {{link}}",
    },
  },
  {
    tipo_jornada: "payment_pending",
    ativa: true,
    config_json: {
      delay_minutes: 120,
      message_template:
        "{{nome}}, seu pedido está aguardando pagamento. Quer o link PIX ou boleto atualizado? {{link}}",
    },
  },
  {
    tipo_jornada: "loyalty_points",
    ativa: true,
    config_json: {
      delay_minutes: 0,
      message_template:
        "{{nome}}, você acumulou novos pontos de fidelidade! Veja recompensas disponíveis: {{link}}",
    },
  },
];

serve(async (req) => {
  const c = cors();
  if (req.method === "OPTIONS") return new Response("ok", { headers: c });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const internalSecret = Deno.env.get("EDGE_INTERNAL_CALLBACK_SECRET");
  const incomingSecret = req.headers.get("x-internal-secret") ?? "";

  // OAuth / server callbacks (no browser JWT)
  if (
    req.method === "POST" &&
    internalSecret &&
    incomingSecret === internalSecret &&
    serviceRole &&
    supabaseUrl
  ) {
    try {
      const body = await req.json().catch(() => ({})) as { user_id?: string };
      const userId = body.user_id;
      if (!userId || typeof userId !== "string") {
        return new Response(JSON.stringify({ ok: false, detail: "user_id obrigatório" }), {
          status: 400,
          headers: { ...c, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(supabaseUrl, serviceRole);
      const { data: authUser, error: authLookupErr } = await admin.auth.admin.getUserById(userId);
      if (authLookupErr || !authUser?.user) {
        return new Response(JSON.stringify({ ok: false, detail: "user_id inválido" }), {
          status: 403,
          headers: { ...c, "Content-Type": "application/json" },
        });
      }
      const { automationsSeeded, journeysStoresSeeded } = await runSeeding(admin, userId);
      return new Response(
        JSON.stringify({ ok: true, automationsSeeded, journeysStoresSeeded }),
        { status: 200, headers: { ...c, "Content-Type": "application/json" } },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ ok: false, detail: msg }), {
        status: 500,
        headers: { ...c, "Content-Type": "application/json" },
      });
    }
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !supabaseAnon || !jwt) {
    return new Response(JSON.stringify({ ok: false, detail: "Configuração ou sessão em falta" }), {
      status: 401,
      headers: { ...c, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ ok: false, detail: "Sessão inválida" }), {
      status: 401,
      headers: { ...c, "Content-Type": "application/json" },
    });
  }

  try {
    const { automationsSeeded, journeysStoresSeeded } = await runSeeding(sb, user.id);

    return new Response(
      JSON.stringify({ ok: true, automationsSeeded, journeysStoresSeeded }),
      { status: 200, headers: { ...c, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, detail: msg }), {
      status: 500,
      headers: { ...c, "Content-Type": "application/json" },
    });
  }
});
