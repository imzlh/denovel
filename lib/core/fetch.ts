import type { RuntimeContext } from "./context.ts";
import { NoRetryError } from "./errors.ts";

export interface FetchOptions extends RequestInit {
  timeoutSec?: number;
  maxRetries?: number;
  ignoreStatus?: boolean;
}

function timeoutSignal(timeoutSec: number, parent?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("Fetch timeout"), timeoutSec * 1000);
  parent?.addEventListener("abort", () => controller.abort(parent.reason ?? "Aborted"), { once: true });
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}

export async function fetchWithContext(
  ctx: RuntimeContext,
  input: string | URL | Request,
  options: FetchOptions = {},
): Promise<Response> {
  const url = input instanceof Request ? new URL(input.url) : new URL(input);
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
    signal: timeoutSignal(options.timeoutSec ?? ctx.timeoutSec, options.signal ?? undefined),
  };
  if (init.body && (!init.method || /^(get|head)$/i.test(init.method))) init.method = "POST";

  let lastError: unknown;
  const retries = options.maxRetries ?? ctx.retry;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(input, init);
      const setCookie = response.headers.getSetCookie?.() ?? [];
      if (setCookie.length > 0) await ctx.cookies.setSetCookieHeaders(url.hostname, setCookie);
      if (!options.ignoreStatus && !response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${url.href}`);
      }
      return response;
    } catch (error) {
      if (error instanceof NoRetryError) throw error;
      lastError = error;
      if (options.signal?.aborted) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
