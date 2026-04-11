/**
 * team-invite — owner convida colaborador; persiste team_members + envia e-mail (Resend).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";

const BodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "operator", "viewer"]),
});

function planMemberLimit(plan: string | null | undefined): number {
  if (plan === "growth") return 5;
  if (plan === "starter" || !plan) return 0;
  return 999;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    body = parsed.data;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return errorResponse("Server misconfiguration", 500);

  const admin = createClient(url, serviceKey);
  const emailNorm = body.email.trim().toLowerCase();

  const { data: ownerProfile, error: profErr } = await admin
    .from("profiles")
    .select("plan, full_name")
    .eq("id", auth.userId)
    .maybeSingle();

  if (profErr) return errorResponse(profErr.message, 500);
  const plan = (ownerProfile as { plan?: string } | null)?.plan ?? "starter";
  const limit = planMemberLimit(plan);
  if (limit === 0) {
    return errorResponse("Equipe disponível a partir do plano Growth.", 403);
  }

  const { data: authUser, error: authUserErr } = await admin.auth.admin.getUserById(auth.userId);
  if (authUserErr || !authUser?.user?.email) return errorResponse("Não foi possível resolver o utilizador.", 500);
  if (emailNorm === authUser.user.email.trim().toLowerCase()) {
    return errorResponse("Não pode convidar o seu próprio e-mail.", 400);
  }

  const { count: memberCount, error: cntErr } = await admin
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("account_owner_id", auth.userId)
    .in("status", ["pending", "active"]);

  if (cntErr) return errorResponse(cntErr.message, 500);
  if ((memberCount ?? 0) >= limit) {
    return errorResponse("Limite de membros do plano atingido.", 403);
  }

  const { data: existing } = await admin
    .from("team_members")
    .select("id,status")
    .eq("account_owner_id", auth.userId)
    .eq("invited_email", emailNorm)
    .maybeSingle();

  if (existing && (existing as { status: string }).status === "active") {
    return jsonResponse({ ok: true, alreadyMember: true });
  }

  const inviteToken = crypto.randomUUID();
  const inviteExpiresAt = new Date(Date.now() + 7 * 864e5).toISOString();
  const row = {
    account_owner_id: auth.userId,
    invited_email: emailNorm,
    role: body.role,
    status: "pending" as const,
    invited_user_id: null as string | null,
    accepted_at: null as string | null,
    invite_token: inviteToken,
    invite_expires_at: inviteExpiresAt,
  };

  let upsertErr: { message?: string } | null = null;
  if (existing?.id) {
    const { error } = await admin.from("team_members").update(row).eq("id", (existing as { id: string }).id);
    upsertErr = error;
  } else {
    const { error } = await admin.from("team_members").insert(row);
    upsertErr = error;
  }

  if (upsertErr) {
    console.error("team-invite save:", upsertErr);
    return errorResponse(upsertErr.message ?? "Erro ao gravar convite", 400);
  }

  const siteUrl = (Deno.env.get("SITE_URL") ?? Deno.env.get("ALLOWED_ORIGIN") ?? "http://localhost:8080").replace(/\/$/, "");
  const acceptUrl = `${siteUrl}/aceitar-convite?token=${encodeURIComponent(inviteToken)}`;
  const ownerName = (ownerProfile as { full_name?: string | null } | null)?.full_name ?? "A sua equipa";

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (RESEND_API_KEY) {
    const html = `
      <p>Olá,</p>
      <p><strong>${ownerName}</strong> convidou-o para colaborar no LTV Boost.</p>
      <p>Função: <strong>${body.role}</strong></p>
      <p><a href="${acceptUrl}">Aceitar convite</a></p>
      <p>O link expira em 7 dias. Se não tem conta, registe-se com o mesmo e-mail do convite antes de aceitar.</p>
    `;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "LTV Boost <notificacoes@ltvboost.com.br>",
        to: [emailNorm],
        subject: "Convite para equipa — LTV Boost",
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("team-invite resend:", t);
    }
  } else {
    console.warn("team-invite: RESEND_API_KEY missing — convite gravado sem e-mail.");
  }

  return jsonResponse({ ok: true, acceptUrl: RESEND_API_KEY ? undefined : acceptUrl });
});
