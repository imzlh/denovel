import type { StateStore } from "./store.ts";

export class QueueStore {
  constructor(private readonly store: StateStore) {}

  async pushDownload(url: string): Promise<void> {
    await this.store.kv.set(["queue", "download", Date.now().toString(), crypto.randomUUID()], url);
  }

  async listDownloads(): Promise<string[]> {
    const urls: string[] = [];
    for await (const entry of this.store.kv.list<string>({ prefix: ["queue", "download"] })) {
      urls.push(entry.value);
    }
    return urls;
  }

  async clearDownloads(): Promise<void> {
    for await (const entry of this.store.kv.list({ prefix: ["queue", "download"] })) {
      await this.store.kv.delete(entry.key);
    }
  }
}
