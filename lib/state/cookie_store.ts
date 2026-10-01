import type { StateStore } from "./store.ts";

export interface StoredCookie {
  host: string;
  name: string;
  value: string;
  expiresAt?: number;
  updatedAt: number;
}

function normalizeHost(host: string): string {
  try {
    return new URL(host).hostname.toLowerCase();
  } catch {
    return host.toLowerCase().replace(/^\./, "");
  }
}

function parseCookiePair(pair: string): { name: string; value: string } | undefined {
  const idx = pair.indexOf("=");
  if (idx <= 0) return undefined;
  const name = pair.slice(0, idx).trim();
  const value = pair.slice(idx + 1).trim();
  if (!name) return undefined;
  return { name, value };
}

function parseExpires(setCookie: string): number | undefined {
  const part = setCookie.split(";")
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith("expires="));
  if (!part) return undefined;
  const time = new Date(part.slice("expires=".length)).getTime();
  return Number.isFinite(time) ? time : undefined;
}

export class CookieStore {
  constructor(private readonly store: StateStore) {}

  async setRawCookie(host: string, cookieHeader: string): Promise<void> {
    const normalizedHost = normalizeHost(host);
    const parts = cookieHeader.split(";").map((item) => item.trim()).filter(Boolean);
    for (const part of parts) {
      const pair = parseCookiePair(part);
      if (!pair) continue;
      await this.setCookie(normalizedHost, pair.name, pair.value);
    }
  }

  async setSetCookieHeaders(host: string, headers: Iterable<string>): Promise<void> {
    const normalizedHost = normalizeHost(host);
    for (const header of headers) {
      const pair = parseCookiePair(header.split(";")[0] ?? "");
      if (!pair) continue;
      const expiresAt = parseExpires(header);
      if (expiresAt !== undefined && expiresAt <= Date.now()) {
        await this.deleteCookie(normalizedHost, pair.name);
        continue;
      }
      await this.setCookie(normalizedHost, pair.name, pair.value, expiresAt);
    }
  }

  async getCookieHeader(host: string): Promise<string> {
    const normalizedHost = normalizeHost(host);
    const now = Date.now();
    const cookies: string[] = [];
    const expired: Deno.KvKey[] = [];

    for await (const entry of this.store.kv.list<StoredCookie>({ prefix: ["cookie", normalizedHost] })) {
      const cookie = entry.value;
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
        expired.push(entry.key);
        continue;
      }
      cookies.push(`${cookie.name}=${cookie.value}`);
    }

    await Promise.all(expired.map((key) => this.store.kv.delete(key)));
    return cookies.join("; ");
  }

  async getCookie(host: string, name: string): Promise<string | undefined> {
    const normalizedHost = normalizeHost(host);
    const result = await this.store.kv.get<StoredCookie>(["cookie", normalizedHost, name]);
    const cookie = result.value;
    if (!cookie) return undefined;
    if (cookie.expiresAt !== undefined && cookie.expiresAt <= Date.now()) {
      await this.deleteCookie(normalizedHost, name);
      return undefined;
    }
    return cookie.value;
  }

  private async setCookie(
    host: string,
    name: string,
    value: string,
    expiresAt?: number,
  ): Promise<void> {
    const cookie: StoredCookie = {
      host,
      name,
      value,
      expiresAt,
      updatedAt: Date.now(),
    };
    await this.store.kv.set(["cookie", host, name], cookie);
  }

  private async deleteCookie(host: string, name: string): Promise<void> {
    await this.store.kv.delete(["cookie", host, name]);
  }
}
