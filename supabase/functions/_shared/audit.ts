import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type AuditPayload = {
  user_id?: string | null;
  tenant_id?: string | null;
  action: string;
  resource: string;
  result: "success" | "failure";
  ip?: string | null;
  metadata?: Record<string, unknown>;
};

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function writeAuditLog(supabase: SupabaseClient, payload: AuditPayload) {
  const ipHash = payload.ip ? await hashIp(payload.ip) : null;
  await supabase.from("audit_logs").insert({
    user_id: payload.user_id ?? null,
    tenant_id: payload.tenant_id ?? null,
    action: payload.action,
    resource: payload.resource,
    result: payload.result,
    ip_hash: ipHash,
    metadata: payload.metadata ?? null,
  });

  const sourceToken = Deno.env.get("LOGTAIL_SOURCE_TOKEN");
  if (!sourceToken) return;

  await fetch("https://in.logtail.com", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sourceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dt: new Date().toISOString(),
      level: payload.result === "failure" ? "error" : "info",
      action: payload.action,
      resource: payload.resource,
      tenant_id: payload.tenant_id ?? null,
      user_id: payload.user_id ?? null,
      ip_hash: ipHash,
      metadata: payload.metadata ?? {},
    }),
  }).catch(() => undefined);
}
