import { join } from "jsr:@std/path";
import { CacheStore, CookieStore, QueueStore, SettingsStore, StateStore } from "../state/mod.ts";

export interface RuntimeOptions {
  dataDir?: string;
  outputDir?: string;
  userAgent?: string;
  retry?: number;
  timeoutSec?: number;
  sleepSec?: number;
}

export interface RuntimeContext {
  dataDir: string;
  outputDir: string;
  userAgent: string;
  retry: number;
  timeoutSec: number;
  sleepSec: number;
  state: StateStore;
  cookies: CookieStore;
  cache: CacheStore;
  settings: SettingsStore;
  queue: QueueStore;
}

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export function defaultDataDir(): string {
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
  switch (Deno.build.os) {
    case "windows":
      return join(Deno.env.get("APPDATA") || home, "denovel");
    case "darwin":
      return join(home, "Library", "Application Support", "denovel");
    default:
      return join(Deno.env.get("XDG_DATA_HOME") || join(home, ".local", "share"), "denovel");
  }
}

export async function createRuntimeContext(options: RuntimeOptions = {}): Promise<RuntimeContext> {
  const dataDir = options.dataDir ?? defaultDataDir();
  await Deno.mkdir(dataDir, { recursive: true });
  const state = await StateStore.open(dataDir);
  return {
    dataDir,
    outputDir: options.outputDir ?? "./downloads",
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    retry: options.retry ?? 3,
    timeoutSec: options.timeoutSec ?? 10,
    sleepSec: options.sleepSec ?? 1,
    state,
    cookies: new CookieStore(state),
    cache: new CacheStore(state),
    settings: new SettingsStore(state),
    queue: new QueueStore(state),
  };
}

export function sleepWithContext(ctx: Pick<RuntimeContext, "sleepSec">, sec = ctx.sleepSec): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}
