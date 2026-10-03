import type { StateStore } from "./store.ts";

export interface CacheEntry<T> {
  value: T;
  updatedAt: number;
  ttlMs?: number;
}

export interface IpCacheValue {
  ips: string[];
  fastest: string;
}

export class CacheStore {
  constructor(private readonly store: StateStore) {}

  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    const result = await this.store.kv.get<CacheEntry<T>>(["cache", namespace, key]);
    const entry = result.value;
    if (!entry) return undefined;
    if (entry.ttlMs !== undefined && Date.now() - entry.updatedAt > entry.ttlMs) {
      await this.store.kv.delete(["cache", namespace, key]);
      return undefined;
    }
    return entry.value;
  }

  async set<T>(namespace: string, key: string, value: T, ttlMs?: number): Promise<void> {
    await this.store.kv.set(["cache", namespace, key], {
      value,
      ttlMs,
      updatedAt: Date.now(),
    } satisfies CacheEntry<T>);
  }

  getIp(host: string): Promise<IpCacheValue | undefined> {
    return this.get<IpCacheValue>("ip", host);
  }

  setIp(host: string, value: IpCacheValue, ttlMs: number): Promise<void> {
    return this.set("ip", host, value, ttlMs);
  }
}
