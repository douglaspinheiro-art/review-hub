/**
 * Circuit Breaker for external API calls (Meta, Anthropic, etc.)
 * Prevents cascading failures by short-circuiting when an API is unhealthy.
 *
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)
 */

type CircuitState = "closed" | "open" | "half_open";

interface CircuitBreakerOptions {
  /** Failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before moving from OPEN → HALF_OPEN (default: 30s) */
  resetTimeoutMs?: number;
  /** Number of successes in HALF_OPEN before closing (default: 2) */
  halfOpenSuccessThreshold?: number;
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  halfOpenSuccesses: number;
}

const circuits = new Map<string, CircuitStats>();

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 2,
};

function getCircuit(name: string): CircuitStats {
  let c = circuits.get(name);
  if (!c) {
    c = { state: "closed", failures: 0, lastFailureAt: 0, halfOpenSuccesses: 0 };
    circuits.set(name, c);
  }
  return c;
}

export class CircuitOpenError extends Error {
  retryAfterMs: number;
  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker "${name}" is OPEN. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = "CircuitOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Wrap an async function with a circuit breaker.
 *
 * ```ts
 * const result = await withCircuitBreaker("anthropic", () => fetchFromAnthropic(payload));
 * ```
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  opts?: CircuitBreakerOptions
): Promise<T> {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const circuit = getCircuit(name);
  const now = Date.now();

  // Check if open circuit should transition to half_open
  if (circuit.state === "open") {
    const elapsed = now - circuit.lastFailureAt;
    if (elapsed >= options.resetTimeoutMs) {
      circuit.state = "half_open";
      circuit.halfOpenSuccesses = 0;
    } else {
      throw new CircuitOpenError(name, options.resetTimeoutMs - elapsed);
    }
  }

  try {
    const result = await fn();

    // On success
    if (circuit.state === "half_open") {
      circuit.halfOpenSuccesses++;
      if (circuit.halfOpenSuccesses >= options.halfOpenSuccessThreshold) {
        circuit.state = "closed";
        circuit.failures = 0;
      }
    } else {
      circuit.failures = 0;
    }

    return result;
  } catch (err) {
    circuit.failures++;
    circuit.lastFailureAt = now;

    if (circuit.state === "half_open" || circuit.failures >= options.failureThreshold) {
      circuit.state = "open";
    }

    throw err;
  }
}

/** Reset a circuit (useful for testing or manual recovery) */
export function resetCircuit(name: string): void {
  circuits.delete(name);
}
