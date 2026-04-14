const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

export type EmailPayload = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  reply_to?: string | null;
  tags?: Array<{ name: string; value: string }>;
};

/**
 * Envia e-mail via Resend API
 */
export async function sendEmail(payload: EmailPayload) {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurado");
  }

  const body: Record<string, unknown> = {
    from: payload.from,
    to: Array.isArray(payload.to) ? payload.to : [payload.to],
    subject: payload.subject,
    html: payload.html,
  };
  if (payload.reply_to) body.reply_to = payload.reply_to;
  if (payload.tags) body.tags = payload.tags;

  // 15s timeout — prevents edge functions from hanging if Resend is unresponsive.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    const isTimeout = (err as Error)?.name === "AbortError";
    throw new Error(isTimeout ? "Resend API timeout (15s)" : String(err));
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend API error (${res.status}): ${errBody}`);
  }

  return res.json();
}
