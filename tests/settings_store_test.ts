import { assertEquals } from "jsr:@std/assert";
import { SettingsStore, StateStore } from "../lib/state/mod.ts";

async function withSettingsStore(fn: (settings: SettingsStore) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "denovel-v2-settings-test-" });
  const state = await StateStore.open(dir);
  try {
    await fn(new SettingsStore(state));
  } finally {
    state.close();
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("SettingsStore stores site credentials by normalized scope", async () => {
  await withSettingsStore(async (settings) => {
    await settings.setSiteCredential("https://Example.COM/path", "apikey", "secret");
    assertEquals(await settings.getSiteCredential("example.com", "apikey"), "secret");
  });
});

Deno.test("SettingsStore deletes site credentials", async () => {
  await withSettingsStore(async (settings) => {
    await settings.setSiteCredential(".example.com", "token", "abc");
    await settings.deleteSiteCredential("example.com", "token");
    assertEquals(await settings.getSiteCredential("example.com", "token"), undefined);
  });
});
