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
