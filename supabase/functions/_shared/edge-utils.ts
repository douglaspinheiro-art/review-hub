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
const _allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
if (!_allowedOrigin) {
  // Log to Supabase Function logs so ops can detect misconfiguration.
  // In production, set ALLOWED_ORIGIN to your app domain (e.g. https://app.ltvboost.com.br).
  // Webhook-facing functions (webhook-cart, integration-gateway) intentionally
  // don't use corsHeaders — they manage their own CORS to allow platform origins.
  console.warn("[edge-utils] ALLOWED_ORIGIN não está configurado — usando wildcard '*'. Defina ALLOWED_ORIGIN em produção para funções browser-facing.");
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": _allowedOrigin ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Rate Limiting (in-memory, per-instance) ───────────────────────────────────
// ⚠️  ATENÇÃO: Este limite é por instância Deno. Em funções serverless que escalam
// horizontalmente, cada cold-start cria um mapa vazio — o limite NÃO é partilhado
// entre instâncias. Use `checkDistributedRateLimit` para limite consistente em
// multi-instância. Mantenha `checkRateLimit` apenas como guard rápido local
// (ex.: burst protection dentro de uma mesma instância).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
let _rateLimitCallCount = 0;

export function checkRateLimit(
  key: string,
  maxRequests = 30,
  windowMs = 60_000
): boolean {
  const now = Date.now();

  // Sweep expired entries every 500 calls to prevent unbounded Map growth.
  if (++_rateLimitCallCount % 500 === 0) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }

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

/**
 * Atomic distributed rate limit backed by `check_rate_limit_atomic` Postgres RPC.
 *
 * Uses a transaction-level advisory lock in Postgres to serialize concurrent
 * requests for the same key — eliminating the TOCTOU race condition of the
 * previous read-then-insert pattern.
 *
 * Requires migration: 20260421120000_atomic_rate_limit_rpc.sql
 */
export async function checkDistributedRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const retryAfterSeconds = Math.ceil(windowMs / 1000);
  const failOpen =
    String(Deno.env.get("DISTRIBUTED_RATE_LIMIT_FAIL_OPEN") ?? "").toLowerCase() === "true" ||
    String(Deno.env.get("DISTRIBUTED_RATE_LIMIT_FAIL_OPEN") ?? "") === "1";

  try {
    const { data: allowed, error } = await supabase.rpc("check_rate_limit_atomic", {
      p_key: key,
      p_max: maxRequests,
      p_window_ms: windowMs,
    });

    if (error) {
      console.error("[checkDistributedRateLimit] rpc error — fail-closed unless DISTRIBUTED_RATE_LIMIT_FAIL_OPEN:", error.message);
      return { allowed: failOpen, retryAfterSeconds };
    }

    return { allowed: !!allowed, retryAfterSeconds };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[checkDistributedRateLimit] unexpected error — fail-closed unless DISTRIBUTED_RATE_LIMIT_FAIL_OPEN:", msg);
    return { allowed: failOpen, retryAfterSeconds };
  }
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

/** Log estruturado para alertas de cron / jobs internos (filtrar no agregador por `tag`). */
export function logCronAlert(payload: Record<string, unknown>) {
  console.error(JSON.stringify({ tag: "CRON_ALERT", ts: new Date().toISOString(), ...payload }));
}

/**
 * Verifies the Authorization header contains the CRON_SECRET.
 * Use for cron-triggered Edge Functions to prevent unauthorized execution.
 */
export function verifyCronSecret(req: Request): Response | null {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    logCronAlert({ component: "verifyCronSecret", error: "CRON_SECRET_missing" });
    return errorResponse("CRON_SECRET is not configured on this server", 500);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!timingSafeEqual(providedToken, cronSecret)) {
    logCronAlert({ component: "verifyCronSecret", error: "unauthorized_cron_invocation" });
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

// ── Anthropic API fetch with timeout ─────────────────────────────────────────
/**
 * Wraps fetch to the Anthropic Messages API with a 25-second timeout.
 * Prevents edge function slots from hanging indefinitely on slow AI responses.
 */
export async function anthropicFetch(
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs = 25_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Constant-time string comparison to prevent timing-based brute-force on secrets.
 * Uses `crypto.subtle.timingSafeEqual` (available in Deno) which does not
 * short-circuit on the first differing byte.
 * Returns false immediately when lengths differ (length leakage is acceptable
 * because secret lengths are fixed and publicly known from config).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  // @ts-expect-error Deno runtime expõe timingSafeEqual em crypto.subtle.
  return crypto.subtle.timingSafeEqual(ab, bb);
}

export { z };
