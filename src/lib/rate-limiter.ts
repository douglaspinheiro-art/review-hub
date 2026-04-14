/**
 * Client-side rate limiter to prevent excessive API calls (e.g. AI endpoints).
 * Uses a sliding-window token bucket approach stored in memory.
 */

interface RateLimiterConfig {
  /** Maximum number of calls allowed within the window */
  maxCalls: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface RateLimiterState {
  timestamps: number[];
}

const buckets = new Map<string, RateLimiterState>();

/**
 * Check whether a call is allowed for the given key.
 * If allowed, records the call and returns `{ allowed: true }`.
 * Otherwise returns `{ allowed: false, retryAfterMs }`.
 */
export function checkRateLimit(
  key: string,
  config: RateLimiterConfig
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  let state = buckets.get(key);
  if (!state) {
    state = { timestamps: [] };
    buckets.set(key, state);
  }

  // Evict expired timestamps
  const cutoff = now - config.windowMs;
  state.timestamps = state.timestamps.filter((t) => t > cutoff);

  if (state.timestamps.length >= config.maxCalls) {
    const oldest = state.timestamps[0];
    const retryAfterMs = oldest + config.windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  state.timestamps.push(now);
  return { allowed: true };
}

// ── Preset limiters ──────────────────────────────────────────────────────────

/** AI endpoints: max 5 calls per 60s */
export const AI_RATE_LIMIT: RateLimiterConfig = { maxCalls: 5, windowMs: 60_000 };

/** General API: max 30 calls per 60s */
export const API_RATE_LIMIT: RateLimiterConfig = { maxCalls: 30, windowMs: 60_000 };

/**
 * Convenience wrapper: checks the AI rate limit and throws if exceeded.
 */
export function assertAiRateLimit(userId: string): void {
  const result = checkRateLimit(`ai:${userId}`, AI_RATE_LIMIT);
  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${seconds}s.`,
      result.retryAfterMs
    );
  }
}

export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}
