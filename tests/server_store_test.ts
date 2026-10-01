import { assertEquals } from "jsr:@std/assert";
import { createRuntimeContext } from "../lib/core/context.ts";

Deno.test("server-facing stores persist settings and queue in unified KV", async () => {
  const dir = await Deno.makeTempDir({ prefix: "denovel-v2-server-store-" });
  const ctx = await createRuntimeContext({ dataDir: dir });
  try {
    await ctx.settings.setServerSettings({
      delay: 250,
      outputDir: "./out",
      overwrite: true,
    });
    await ctx.queue.pushDownload("https://example.com/book");

    assertEquals(await ctx.settings.getServerSettings(), {
      delay: 250,
      outputDir: "./out",
      overwrite: true,
    });
    assertEquals(await ctx.queue.listDownloads(), ["https://example.com/book"]);
  } finally {
    ctx.state.close();
    await Deno.remove(dir, { recursive: true });
  }
});
