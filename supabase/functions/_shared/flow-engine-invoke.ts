/**
 * Chamada interna ao `flow-engine`.
 * O campo `event` deve coincidir com `journeys_config.tipo_jornada` (ex.: cart_abandoned, payment_pending, loyalty_points).
 */
export async function invokeFlowEngine(
  origin: string,
  body: {
    event: string;
    store_id: string;
    customer_id: string;
    payload?: Record<string, unknown>;
  },
): Promise<Response> {
  const secret = Deno.env.get("FLOW_ENGINE_SECRET") ?? "";
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!secret || !sr) {
    console.warn("[invokeFlowEngine] FLOW_ENGINE_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente.");
    return new Response(JSON.stringify({ error: "flow-engine not configured" }), { status: 503 });
  }
  const base = origin.replace(/\/$/, "");
  return await fetch(`${base}/functions/v1/flow-engine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sr}`,
      "x-internal-secret": secret,
    },
    body: JSON.stringify(body),
  });
}
