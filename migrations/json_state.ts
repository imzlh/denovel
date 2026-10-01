import { join } from "jsr:@std/path";
import { StateStore } from "../lib/state/store.ts";
import { CacheStore } from "../lib/state/cache_store.ts";
import { CookieStore } from "../lib/state/cookie_store.ts";

interface MigrationOptions {
  fromDir: string;
  toDir: string;
}

interface MigrationResult {
  cookies: number;
  ipCacheEntries: number;
  historyEntries: number;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as T;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return fallback;
    throw error;
  }
}

export async function runJsonStateMigration(options: MigrationOptions): Promise<MigrationResult> {
  const state = await StateStore.open(options.toDir);
  const cookies = new CookieStore(state);
  const cache = new CacheStore(state);
  const result: MigrationResult = {
    cookies: 0,
    ipCacheEntries: 0,
    historyEntries: 0,
  };

  try {
    const legacyCookies = await readJson<Record<string, Record<string, string>>>(
      join(options.fromDir, "cookie.json"),
      {},
    );
    for (const [host, pairs] of Object.entries(legacyCookies)) {
      for (const [name, value] of Object.entries(pairs)) {
        await cookies.setRawCookie(host, `${name}=${value}`);
        result.cookies++;
      }
    }

    const legacyIpCache = await readJson<
      Record<string, { ips?: string[]; fastest?: string; ttl?: number }>
    >(join(options.fromDir, "ip_cache.json"), {});
    for (const [host, value] of Object.entries(legacyIpCache)) {
      if (!value.fastest) continue;
      await cache.setIp(host, {
        ips: value.ips ?? [],
        fastest: value.fastest,
      }, value.ttl ?? 3600_000);
      result.ipCacheEntries++;
    }

    const legacyHistory = await readJson<string[]>(join(options.fromDir, "history.json"), []);
    for (const item of legacyHistory) {
      await state.kv.set(["history", "legacy", item], true);
      result.historyEntries++;
    }
    return result;
  } finally {
    state.close();
  }
}
