/**
 * team-accept-invite — utilizador autenticado aceita convite (token + e-mail deve coincidir).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";

const BodySchema = z.object({
  token: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  let token: string;
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    token = parsed.data.token;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return errorResponse("Server misconfiguration", 500);

  const admin = createClient(url, serviceKey);

  const { data: authUser, error: authUserErr } = await admin.auth.admin.getUserById(auth.userId);
  if (authUserErr || !authUser?.user?.email) return errorResponse("Sessão inválida.", 401);
  const sessionEmail = authUser.user.email.trim().toLowerCase();

  const { data: row, error: rowErr } = await admin
    .from("team_members")
    .select("id, invited_email, status, invite_expires_at, invited_user_id")
    .eq("invite_token", token)
    .maybeSingle();

  if (rowErr || !row) return errorResponse("Convite inválido ou expirado.", 404);

  const invitedEmail = String((row as { invited_email: string }).invited_email).trim().toLowerCase();
  if (invitedEmail !== sessionEmail) {
    return errorResponse("Inicie sessão com o e-mail que recebeu o convite.", 403);
  }

  const st = (row as { status: string }).status;
  const iuid = (row as { invited_user_id?: string | null }).invited_user_id;

  if (st === "active" && iuid === auth.userId) {
    return jsonResponse({ ok: true, already: true });
  }

  const exp = (row as { invite_expires_at: string | null }).invite_expires_at;
  if (exp && new Date(exp) < new Date()) {
    return errorResponse("Este convite expirou.", 410);
  }

  if (st === "revoked") {
    return errorResponse("Este convite foi revogado.", 403);
  }

  if (st !== "pending") {
    return errorResponse("Este convite já foi utilizado ou não está pendente.", 409);
  }

  const { error: updErr } = await admin
    .from("team_members")
    .update({
      invited_user_id: auth.userId,
      status: "active",
      accepted_at: new Date().toISOString(),
      invite_token: null,
      invite_expires_at: null,
    })
    .eq("id", (row as { id: string }).id);

  if (updErr) {
    console.error("team-accept-invite:", updErr);
    return errorResponse(updErr.message ?? "Erro ao aceitar", 500);
  }

  return jsonResponse({ ok: true });
});
