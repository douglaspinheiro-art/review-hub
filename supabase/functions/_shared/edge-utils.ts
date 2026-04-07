/**
 * Shared utilities for Supabase Edge Functions:
 * - Zod input validation helper
 * - In-memory rate limiting
 * - Standard CORS headers
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ── CORS ──────────────────────────────────────────────────────────────────────
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

export { z };
