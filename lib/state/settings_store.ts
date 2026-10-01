import type { StateStore } from "./store.ts";

export interface ServerSettings {
  delay: number;
  outputDir: string;
  overwrite: boolean;
}

const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  delay: 1000,
  outputDir: "./downloads",
  overwrite: false,
};

export class SettingsStore {
  constructor(private readonly store: StateStore) {}

  async getServerSettings(): Promise<ServerSettings> {
    return (await this.store.kv.get<ServerSettings>(["settings", "server"])).value ??
      { ...DEFAULT_SERVER_SETTINGS };
  }

  async setServerSettings(settings: ServerSettings): Promise<void> {
    await this.store.kv.set(["settings", "server"], settings);
  }

  async getSiteCredential(scope: string, name: string): Promise<string | undefined> {
    return (await this.store.kv.get<string>(["settings", "site-credential", normalizeScope(scope), name])).value ??
      undefined;
  }

  async setSiteCredential(scope: string, name: string, value: string): Promise<void> {
    await this.store.kv.set(["settings", "site-credential", normalizeScope(scope), name], value);
  }

  async deleteSiteCredential(scope: string, name: string): Promise<void> {
    await this.store.kv.delete(["settings", "site-credential", normalizeScope(scope), name]);
  }
}

function normalizeScope(scope: string): string {
  try {
    return new URL(scope).hostname.toLowerCase();
  } catch {
    return scope.toLowerCase().replace(/^\./, "");
  }
}
