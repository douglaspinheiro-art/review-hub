import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, verifyJwt, z, errorResponse, jsonResponse } from "../_shared/edge-utils.ts";

const RequestSchema = z.object({
  domain: z.string().min(3).max(255),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse("Domínio inválido", 400);

    const { domain } = parsed.data;
    const targetCname = "app.ltvboost.com";

    // Cloudflare DNS over HTTPS API
    const dnsUrl = `https://cloudflare-dns.com/query?name=${encodeURIComponent(domain)}&type=CNAME`;
    const res = await fetch(dnsUrl, {
      headers: { "accept": "application/dns-json" }
    });

    if (!res.ok) throw new Error("DNS check failed");
    
    const dnsData = await res.json();
    const answers = dnsData.Answer || [];
    
    const cnameRecord = answers.find((a: any) => a.type === 5); // 5 is CNAME
    const isCorrect = cnameRecord && (cnameRecord.data === targetCname || cnameRecord.data === targetCname + ".");

    return jsonResponse({
      ok: true,
      domain,
      isCorrect,
      found: cnameRecord ? cnameRecord.data : null,
      expected: targetCname,
      status: isCorrect ? "valid" : "invalid"
    });

  } catch (err) {
    console.error("verify-domain error:", err);
    return errorResponse("Erro ao verificar DNS", 500);
  }
});
