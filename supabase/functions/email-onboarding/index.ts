// supabase/functions/email-onboarding/index.ts
// Deno Edge Function — sends D+1 and D+3 onboarding reminder emails.
// Triggered by a Supabase cron job daily at 10:00 BRT.
// Requires RESEND_API_KEY and CRON_SECRET secrets.
//
// POST /functions/v1/email-onboarding

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/edge-utils.ts";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY      = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL          = "no-reply@ltvboost.com.br";
const APP_URL             = "https://ltvboost.com.br";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log(`[email-onboarding] RESEND_API_KEY not configured. Would send to: ${to}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

function d1Html(name: string, automationCount: number): string {
  const firstName = name.split(" ")[0];
  return `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb">
  <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    <h1 style="font-size:20px;font-weight:700;color:#111;margin-bottom:8px">
      Oi, ${firstName} 👋
    </h1>
    <p style="color:#6b7280;font-size:14px;margin-bottom:24px">
      Você criou sua conta no LTV Boost ontem.
      ${automationCount === 0
        ? "Mas ainda não ativou nenhuma automação — isso leva menos de 2 minutos!"
        : `Você já tem ${automationCount} automação(ões) ativa(s). Que tal adicionar mais?`
      }
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="color:#166534;font-size:13px;font-weight:600;margin:0 0 4px">
        💡 Quick win disponível
      </p>
      <p style="color:#166534;font-size:13px;margin:0">
        Ative a recuperação de carrinho abandonado agora e comece a recuperar
        em média <strong>R$ 3.200–8.400/mês</strong> automaticamente.
      </p>
    </div>
    <a href="${APP_URL}/dashboard/automacoes"
       style="display:inline-block;background:#10b981;color:#fff;font-weight:600;font-size:14px;
              padding:12px 24px;border-radius:8px;text-decoration:none">
      Ativar automações agora →
    </a>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">
      LTV Boost · <a href="${APP_URL}/dashboard" style="color:#10b981">Acessar dashboard</a>
    </p>
  </div>
</div>`;
}

function d3Html(name: string, hasIntegration: boolean): string {
  const firstName = name.split(" ")[0];
  return `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb">
  <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    <h1 style="font-size:20px;font-weight:700;color:#111;margin-bottom:8px">
      ${firstName}, sua loja pode estar perdendo dinheiro 💸
    </h1>
    <p style="color:#6b7280;font-size:14px;margin-bottom:24px">
      Faz 3 dias que você criou sua conta.
      ${hasIntegration
        ? "Você conectou sua loja — agora é hora de ver os resultados reais das automações."
        : "Você ainda não conectou sua loja de e-commerce, então as automações não têm dados para trabalhar."
      }
    </p>
    ${!hasIntegration ? `
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="color:#713f12;font-size:13px;font-weight:600;margin:0 0 4px">
        ⚠️ Integração pendente
      </p>
      <p style="color:#713f12;font-size:13px;margin:0">
        Conecte sua Shopify, Nuvemshop ou VTEX para ativar a recuperação de carrinho.
        Leva menos de 5 minutos.
      </p>
    </div>
    <a href="${APP_URL}/dashboard/integracoes"
       style="display:inline-block;background:#f59e0b;color:#fff;font-weight:600;font-size:14px;
              padding:12px 24px;border-radius:8px;text-decoration:none">
      Conectar minha loja →
    </a>
    ` : `
    <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="color:#1e40af;font-size:13px;font-weight:600;margin:0 0 4px">
        🔍 Já pensou em diagnosticar seu funil?
      </p>
      <p style="color:#1e40af;font-size:13px;margin:0">
        O Diagnostics identifica onde você está perdendo conversões e gera um plano de ação com IA.
      </p>
    </div>
    <a href="${APP_URL}/dashboard/diagnostico"
       style="display:inline-block;background:#3b82f6;color:#fff;font-weight:600;font-size:14px;
              padding:12px 24px;border-radius:8px;text-decoration:none">
      Ver diagnóstico de conversão →
    </a>
    `}
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">
      LTV Boost · <a href="${APP_URL}/dashboard" style="color:#10b981">Acessar dashboard</a>
    </p>
  </div>
</div>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const cronErr = verifyCronSecret(req);
  if (cronErr) return cronErr;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = new Date();

  // Find users created exactly 1 or 3 days ago (±1h window)
  const d1Start = new Date(now.getTime() - 25 * 3600_000).toISOString();
  const d1End   = new Date(now.getTime() - 23 * 3600_000).toISOString();
  const d3Start = new Date(now.getTime() - 73 * 3600_000).toISOString();
  const d3End   = new Date(now.getTime() - 71 * 3600_000).toISOString();

  const [d1Res, d3Res] = await Promise.all([
    supabase.from("profiles")
      .select("id, full_name, email, onboarding_completed")
      .gte("created_at", d1Start).lte("created_at", d1End)
      .eq("onboarding_completed", false),
    supabase.from("profiles")
      .select("id, full_name, email, onboarding_completed")
      .gte("created_at", d3Start).lte("created_at", d3End),
  ]);

  const d1Users = d1Res.data ?? [];
  const d3Users = d3Res.data ?? [];

  let sent = 0;
  const errors: string[] = [];

  // D+1: users who haven't completed onboarding
  for (const u of d1Users) {
    try {
      if (!u.email) continue;
      const { count: automationCount } = await supabase
        .from("automations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.id)
        .eq("is_active", true);

      await sendEmail(
        u.email,
        "Você deixou dinheiro na mesa ontem 💰",
        d1Html(u.full_name ?? "Lojista", automationCount ?? 0)
      );
      sent++;
    } catch (err) {
      errors.push(`d1 ${u.id}: ${(err as Error).message}`);
    }
  }

  // D+3: all users (check integration status for personalization)
  for (const u of d3Users) {
    try {
      if (!u.email) continue;
      const { count: integrationCount } = await supabase
        .from("integrations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.id)
        .eq("is_active", true);

      await sendEmail(
        u.email,
        "3 dias de LTV Boost — veja o que falta configurar",
        d3Html(u.full_name ?? "Lojista", (integrationCount ?? 0) > 0)
      );
      sent++;
    } catch (err) {
      errors.push(`d3 ${u.id}: ${(err as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, d1: d1Users.length, d3: d3Users.length, errors }), { headers: CORS });
});
