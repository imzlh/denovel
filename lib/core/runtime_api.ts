import { createRuntimeContext, type RuntimeContext } from "./context.ts";
import { fetchWithContext, type FetchOptions } from "./fetch.ts";
import { getDocumentWithContext, processContent } from "./html.ts";
import type { MainInfo, MainInfoResult } from "./types.ts";

let defaultContext: Promise<RuntimeContext> | undefined;
const cookieMirror = new Map<string, Map<string, string>>();

export function setDefaultRuntimeContext(ctx: RuntimeContext): void {
  defaultContext = Promise.resolve(ctx);
}

export function getDefaultRuntimeContext(): Promise<RuntimeContext> {
  defaultContext ??= createRuntimeContext();
  return defaultContext;
}

export async function fetch2(url: string | URL | Request, options?: FetchOptions): Promise<Response> {
  return await fetchWithContext(await getDefaultRuntimeContext(), url, options);
}

export async function getDocument(
  url: URL | string,
  options?: Parameters<typeof getDocumentWithContext>[2],
) {
  return await getDocumentWithContext(await getDefaultRuntimeContext(), url, options);
}

/** Compatibility helpers used by older site adapters migrated from v1. */
export async function getSiteCookie(host: string, name?: string): Promise<string | undefined> {
  if (name) return await getSiteCredential(host, name);
  return (await getDefaultRuntimeContext()).cookies.getCookieHeader(host);
}

export async function setRawCookie(host: string, cookie: string): Promise<void> {
  const ctx = await getDefaultRuntimeContext();
  await ctx.cookies.setRawCookie(host, cookie);
  mirrorRawCookie(host, cookie);
}

export async function forceSaveConfig(): Promise<void> {
  // v2 writes every state mutation immediately; this is retained as a no-op
  // for adapters that used the old JSON config flush hook.
}

export function openFile(path: string): void {
  const command = Deno.build.os === "windows" ? ["cmd", "/c", "start", "", path] :
    Deno.build.os === "darwin" ? ["open", path] : ["xdg-open", path];
  try {
    new Deno.Command(command[0], { args: command.slice(1), stdin: "null", stdout: "null", stderr: "null" }).spawn();
  } catch {
    // Opening a captcha is optional; headless environments may not provide a GUI.
  }
}

export async function readline(promptText: string): Promise<string | undefined> {
  await Deno.stdout.write(new TextEncoder().encode(`${promptText} `));
  const chunks: Uint8Array[] = [];
  const buffer = new Uint8Array(1024);
  while (true) {
    const count = await Deno.stdin.read(buffer);
    if (count === null) return undefined;
    const chunk = buffer.slice(0, count);
    chunks.push(chunk);
    const text = new TextDecoder().decode(concatBytes(chunks));
    const end = text.search(/[\r\n]/u);
    if (end >= 0) return text.slice(0, end);
  }
}

export async function rpcNodeModule(_name: string, _payload: unknown): Promise<Response> {
  throw new Error("External RPC modules are not configured in denovel v2");
}

function mirrorRawCookie(host: string, cookie: string): void {
  const normalizedHost = normalizeHost(host);
  const hostCookies = cookieMirror.get(normalizedHost) ?? new Map<string, string>();
  for (const part of cookie.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    hostCookies.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  cookieMirror.set(normalizedHost, hostCookies);
}

function getMirroredCookie(host: string, name?: string): string | undefined {
  const hostCookies = cookieMirror.get(normalizeHost(host));
  if (!hostCookies) return undefined;
  if (name) {
    for (const [key, value] of hostCookies) {
      if (key.toLowerCase() === name.toLowerCase()) return value;
    }
    return undefined;
  }
  return Array.from(hostCookies.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
}

export async function getSiteCredential(host: string, name: string): Promise<string | undefined> {
  const normalizedHost = normalizeHost(host);
  const mirrored = getMirroredCookie(normalizedHost, name);
  if (mirrored !== undefined) return mirrored;

  const ctx = await getDefaultRuntimeContext();
  const setting = await ctx.settings.getSiteCredential(normalizedHost, name);
  if (setting !== undefined) return setting;

  const cookie = await ctx.cookies.getCookie(normalizedHost, name);
  if (cookie !== undefined) {
    const hostCookies = cookieMirror.get(normalizedHost) ?? new Map<string, string>();
    hostCookies.set(name, cookie);
    cookieMirror.set(normalizedHost, hostCookies);
  }
  return cookie;
}

export async function setSiteCredential(host: string, name: string, value: string): Promise<void> {
  const normalizedHost = normalizeHost(host);
  const ctx = await getDefaultRuntimeContext();
  await ctx.settings.setSiteCredential(normalizedHost, name, value);
  mirrorRawCookie(normalizedHost, `${name}=${value}`);
}

export async function requireSiteCredential(
  host: string,
  name: string,
  hint?: string,
): Promise<string> {
  const value = await getSiteCredential(host, name);
  if (value) return value;
  const suffix = hint ? ` ${hint}` : "";
  throw new Error(`Missing credential ${host}:${name}.${suffix}`);
}

export function sleep(sec = 1): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

export async function defaultGetInfo(
  page: URL,
  cfg: Partial<MainInfo & { networkHandler?: typeof fetch }>,
): Promise<MainInfoResult | null> {
  if (!cfg.mainPageLike || !cfg.mainPageLike.test(page.href)) return null;
  const mainPage = await getDocument(page);
  const firstPage = cfg.mainPageFirstChapter
    ? mainPage.querySelector(cfg.mainPageFirstChapter)?.getAttribute("href")
    : page.href;
  const coverEl = cfg.mainPageCover ? mainPage.querySelector(cfg.mainPageCover) : undefined;
  const cover = coverEl?.getAttribute("src") ?? undefined;
  const info: MainInfoResult = {
    firstPage: firstPage ? new URL(firstPage, page) : page,
    cover: cover ? new URL(cover, page).href : undefined,
    book_name: cfg.mainPageTitle ? mainPage.querySelector(cfg.mainPageTitle)?.textContent ?? "" : "",
    summary: cfg.mainPageSummary
      ? processContent(mainPage.querySelector(cfg.mainPageSummary), {}, firstPage ? new URL(firstPage, page) : page)
      : undefined,
    jpStyle: cfg.jpStyle,
    author: cfg.mainPageAuthor ? mainPage.querySelector(cfg.mainPageAuthor)?.textContent ?? undefined : undefined,
  };
  if (cfg.mainPageFilter) await cfg.mainPageFilter(page, mainPage, info);
  return info;
}

function normalizeHost(host: string): string {
  try {
    return new URL(host).hostname.toLowerCase();
  } catch {
    return host.toLowerCase().replace(/^\./, "");
  }
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
