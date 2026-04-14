/**
 * Utility for Upstash Redis caching via REST API (best for Edge Functions).
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
 */

export async function getCache<T>(key: string): Promise<T | null> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (e) {
    console.error(`[Redis] get error for key ${key}:`, e);
    return null;
  }
}

export async function setCache(key: string, value: any, expireSeconds = 300): Promise<void> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return;

  try {
    const res = await fetch(`${url}/set/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        value: JSON.stringify(value),
        ex: expireSeconds
      }),
    });
    // Note: Upstash SET command format via REST can vary based on version, 
    // but usually it's /set/key with EX as query param or part of body.
    // If using the simple /set/key?ex=... format:
    /*
    await fetch(`${url}/set/${key}?ex=${expireSeconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(value),
    });
    */
  } catch (e) {
    console.error(`[Redis] set error for key ${key}:`, e);
  }
}

/** 
 * Alternative: Simple SET using path params which is very robust on Upstash 
 */
export async function setCacheSimple(key: string, value: any, expireSeconds = 300): Promise<void> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return;

  try {
    await fetch(`${url}/set/${key}/?ex=${expireSeconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(value),
    });
  } catch (e) {
    console.error(`[Redis] set error for key ${key}:`, e);
  }
}
