export interface RetryPolicy {
  maxAttempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULTS: Required<RetryPolicy> = {
  maxAttempts: 3,
  baseDelayMs: 250,
  timeoutMs: 10_000,
};

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  policy: RetryPolicy = {},
): Promise<Response> {
  const p = { ...DEFAULTS, ...policy };
  let lastError: unknown;

  for (let attempt = 1; attempt <= p.maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), p.timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;

    try {
      const res = await fetch(input, { ...init, signal });
      clearTimeout(timeoutId);

      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable || attempt === p.maxAttempts) return res;

      const retryAfter = res.headers.get("retry-after");
      const delay = retryAfter
        ? Math.min(Number(retryAfter) * 1000, 30_000)
        : jitter(p.baseDelayMs * 2 ** (attempt - 1));
      console.warn(`[http] retry`, {
        url: String(input),
        attempt,
        status: res.status,
        delayMs: Math.round(delay),
      });
      await sleep(delay);
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (attempt === p.maxAttempts) break;
      const delay = jitter(p.baseDelayMs * 2 ** (attempt - 1));
      console.warn(`[http] retry`, {
        url: String(input),
        attempt,
        error: (err as Error).message,
        delayMs: Math.round(delay),
      });
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("fetchWithRetry: exhausted attempts with no response");
}

function jitter(ms: number): number {
  return ms + Math.random() * ms * 0.3;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
