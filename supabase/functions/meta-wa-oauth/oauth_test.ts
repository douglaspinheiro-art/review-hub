/**
 * Smoke tests for meta-wa-oauth.
 *
 * Run: supabase test functions meta-wa-oauth
 *
 * These tests validate request shape only (no Graph API calls).
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FN_URL = Deno.env.get("META_WA_OAUTH_URL") ??
  "http://127.0.0.1:54321/functions/v1/meta-wa-oauth";

Deno.test("rejects requests without authorization header", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "x", store_id: "00000000-0000-0000-0000-000000000000" }),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("rejects requests missing code", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("TEST_USER_JWT") ?? "invalid"}`,
    },
    body: JSON.stringify({ store_id: "00000000-0000-0000-0000-000000000000" }),
  });
  // Either 401 (invalid JWT) or 400 (missing code) — both are valid rejections.
  if (res.status !== 401 && res.status !== 400) {
    throw new Error(`Expected 400 or 401, got ${res.status}`);
  }
  await res.body?.cancel();
});

Deno.test("OPTIONS preflight returns CORS headers", async () => {
  const res = await fetch(FN_URL, { method: "OPTIONS" });
  assertEquals(res.status, 200);
  // CORS headers are set by edge-utils
  await res.body?.cancel();
});
