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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend API error (${res.status}): ${errBody}`);
  }

  return res.json();
}
