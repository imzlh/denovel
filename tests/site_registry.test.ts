import { assertEquals } from "jsr:@std/assert";
import { ComicSiteRegistry, SiteRegistry } from "../lib/core/site_registry.ts";

Deno.test("SiteRegistry resolves real adapter modules only when default exists", async () => {
  const registry = new SiteRegistry(new URL("../lib/core/novel.ts", import.meta.url).href);
  assertEquals(await registry.hasTraditional("www.qidian.com"), true);
  assertEquals(await registry.hasNative("fanqienovel.com"), true);
  assertEquals(await registry.hasTraditional("missing.example.com"), false);
});

Deno.test("ComicSiteRegistry resolves short host names", async () => {
  const registry = new ComicSiteRegistry(new URL("../lib/core/comic.ts", import.meta.url).href);
  assertEquals(await registry.resolve("www.mangacopy.com"), "mangacopy.com");
});
