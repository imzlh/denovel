import { assertEquals } from "jsr:@std/assert";
import { CookieStore, StateStore } from "../lib/state/mod.ts";

async function withCookieStore(fn: (store: CookieStore) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "denovel-v2-cookie-test-" });
  const state = await StateStore.open(dir);
  try {
    await fn(new CookieStore(state));
  } finally {
    state.close();
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("CookieStore imports raw cookie headers", async () => {
  await withCookieStore(async (cookies) => {
    await cookies.setRawCookie("example.com", "a=1; b=two");
    assertEquals(await cookies.getCookie("example.com", "a"), "1");
    assertEquals(await cookies.getCookieHeader("example.com"), "a=1; b=two");
  });
});

Deno.test("CookieStore deletes expired Set-Cookie values", async () => {
  await withCookieStore(async (cookies) => {
    await cookies.setRawCookie("example.com", "sid=live");
    await cookies.setSetCookieHeaders("example.com", [
      "sid=dead; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
    assertEquals(await cookies.getCookie("example.com", "sid"), undefined);
    assertEquals(await cookies.getCookieHeader("example.com"), "");
  });
});
