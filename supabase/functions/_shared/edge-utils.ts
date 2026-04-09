/**
 * Shared utilities for Supabase Edge Functions:
 * - JWT authentication helper
 * - Cron secret verification
 * - Zod input validation helper
 * - In-memory rate limiting
 * - Standard CORS headers
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS ──────────────────────────────────────────────────────────────────────
export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Rate Limiting (in-memory, per-instance) ───────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests = 30,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function checkDistributedRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = Date.now();
  const windowStart = new Date(now - windowMs).toISOString();

  const { count, error: countError } = await supabase
    .from("api_request_logs")
    .select("id", { count: "exact", head: true })
    .eq("rate_key", key)
    .gte("created_at", windowStart);

  if (countError) {
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  const currentCount = count ?? 0;
  if (currentCount >= maxRequests) {
    return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  await supabase.from("api_request_logs").insert({
    rate_key: key,
  });

  return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
}

// ── Validation helper ─────────────────────────────────────────────────────────
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): { success: true; data: z.infer<T> } | { success: false; response: Response } {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }
  return { success: true, data: parsed.data };
}

// ── Error response helper ─────────────────────────────────────────────────────
export function errorResponse(message: string, status = 500): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ── Success response helper ───────────────────────────────────────────────────
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ── Rate limit response ───────────────────────────────────────────────────────
export function rateLimitedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

export function rateLimitedResponseWithRetry(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

// ── JWT Authentication ────────────────────────────────────────────────────────

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

/**
 * Verifies the Bearer JWT from the Authorization header.
 * Returns the authenticated userId or an error Response.
 * Use for all user-invoked Edge Functions.
 */
export async function verifyJwt(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: errorResponse("Missing or invalid Authorization header", 401) };
  }
  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, response: errorResponse("Server misconfiguration", 500) };
  }
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    return { ok: false, response: errorResponse("Unauthorized", 401) };
  }
  return { ok: true, userId: user.id };
}

/**
 * Verifies the Authorization header contains the CRON_SECRET.
 * Use for cron-triggered Edge Functions to prevent unauthorized execution.
 */
export function verifyCronSecret(req: Request): Response | null {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    return errorResponse("CRON_SECRET is not configured on this server", 500);
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse("Unauthorized", 401);
  }
  return null;
}

export function validateBrowserOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;

  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
  if (!allowedOrigin) {
    return errorResponse("Origin validation is not configured", 500);
  }
  if (origin !== allowedOrigin) {
    return errorResponse("Forbidden origin", 403);
  }
  return null;
}

export { z };
