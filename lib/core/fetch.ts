import type { RuntimeContext } from "./context.ts";
import { NoRetryError } from "./errors.ts";

export interface FetchOptions extends RequestInit {
  timeoutSec?: number;
  maxRetries?: number;
  ignoreStatus?: boolean;
}

interface AttemptSignal {
  signal: AbortSignal;
  dispose(): void;
}

function timeoutSignal(timeoutSec: number, parents: Array<AbortSignal | null | undefined>): AttemptSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("Fetch timeout"), timeoutSec * 1000);
  const activeParents = parents.filter((signal): signal is AbortSignal => Boolean(signal));
  const onParentAbort = (event: Event) => {
    const signal = event.target as AbortSignal;
    controller.abort(signal.reason ?? "Aborted");
  };
  const abortedParent = activeParents.find((signal) => signal.aborted);
  if (abortedParent) controller.abort(abortedParent.reason ?? "Aborted");
  else for (const parent of activeParents) parent.addEventListener("abort", onParentAbort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      for (const parent of activeParents) parent.removeEventListener("abort", onParentAbort);
    },
  };
}

export async function fetchWithContext(
  ctx: RuntimeContext,
  input: string | URL | Request,
  options: FetchOptions = {},
): Promise<Response> {
  const sourceRequest = input instanceof Request ? input : undefined;
  const url = sourceRequest ? new URL(sourceRequest.url) : new URL(input as string | URL);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));

  const cookieHeader = await ctx.cookies.getCookieHeader(url.hostname);
  const explicitCookie = headers.get("Cookie");
  if (cookieHeader || explicitCookie) {
    headers.set("Cookie", [cookieHeader, explicitCookie].filter(Boolean).join("; "));
  }
  if (!headers.has("User-Agent")) headers.set("User-Agent", ctx.userAgent);
  if (options.referrer) headers.set("Referer", options.referrer);

  const init: RequestInit = {
    ...options,
    headers,
  };
  if (init.body && (!init.method || /^(get|head)$/i.test(init.method))) init.method = "POST";

  // Materialize one reusable request template. This also makes a
  // one-shot ReadableStream body retryable: each attempt receives a clone of
  // the template instead of trying to reuse an already-consumed stream.
  const templateInit: RequestInit = { ...init, signal: undefined };
  const requestTemplate = sourceRequest
    ? new Request(sourceRequest, templateInit)
    : new Request(url, templateInit);

  // A Request may carry its own abort signal. Preserve it while layering the
  // per-attempt timeout and the explicit options.signal.
  const parentSignals = [sourceRequest?.signal, options.signal];
  let lastError: unknown;
  const configuredRetries = options.maxRetries ?? ctx.retry;
  const retries = Number.isFinite(configuredRetries) ? Math.max(1, Math.floor(configuredRetries)) : 1;
  const configuredTimeout = options.timeoutSec ?? ctx.timeoutSec;
  const timeoutSec = Number.isFinite(configuredTimeout) ? Math.max(0.001, configuredTimeout) : 10;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // A Request can carry a one-shot body. Clone it before every attempt;
      // fetch consumes the clone while the caller's Request remains reusable.
      const request = requestTemplate.clone();
      const attemptSignal = timeoutSignal(timeoutSec, parentSignals);
      try {
        // The request template already contains method, headers, and body.
        // Passing init again here could reattach a one-shot body on retries.
        const response = await fetch(request, { signal: attemptSignal.signal });
        const setCookie = response.headers.getSetCookie?.() ?? [];
        if (setCookie.length > 0) await ctx.cookies.setSetCookieHeaders(url.hostname, setCookie);
        if (!options.ignoreStatus && !response.ok) {
          // Release the body before retrying a failed HTTP response.
          await response.body?.cancel();
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${url.href}`);
        }
        return response;
      } finally {
        attemptSignal.dispose();
      }
    } catch (error) {
      if (error instanceof NoRetryError) throw error;
      lastError = error;
      if (parentSignals.some((signal) => signal?.aborted)) throw error;
      if (attempt + 1 < retries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 5000)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
