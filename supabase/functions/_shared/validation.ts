/**
 * Validação HTTP compartilhada (Edge Functions).
 */
import { z, errorResponse } from "./edge-utils.ts";

export const uuidSchema = z.string().uuid();

export const emailSchema = z.string().trim().email().max(320);

export function rejectIfBodyTooLarge(req: Request, maxBytes: number): Response | null {
  const len = req.headers.get("content-length");
  if (len == null) return null;
  const n = Number(len);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > maxBytes) {
    return new Response(JSON.stringify({ error: "Payload too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

export async function validateRequest<S extends z.ZodTypeAny>(
  req: Request,
  options: { method: string; maxBytes: number; schema: S },
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }>;

export async function validateRequest(
  req: Request,
  options: { method: string; maxBytes: number; schema?: undefined },
): Promise<{ ok: true } | { ok: false; response: Response }>;

export async function validateRequest<S extends z.ZodTypeAny>(
  req: Request,
  options: { method: string; maxBytes: number; schema?: S },
): Promise<{ ok: true; data?: z.infer<S> } | { ok: false; response: Response }> {
  if (req.method !== options.method) {
    return { ok: false, response: methodNotAllowed() };
  }
  const tooBig = rejectIfBodyTooLarge(req, options.maxBytes);
  if (tooBig) return { ok: false, response: tooBig };

  if (!options.schema) {
    return { ok: true };
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: errorResponse("Invalid JSON", 400) };
  }

  const parsed = options.schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: errorResponse("Invalid request payload", 400) };
  }

  return { ok: true, data: parsed.data };
}
