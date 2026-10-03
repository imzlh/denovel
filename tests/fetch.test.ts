import { assertEquals } from "jsr:@std/assert";
import { fetchWithContext } from "../lib/core/fetch.ts";

function testContext() {
  return {
    userAgent: "denovel-test",
    retry: 2,
    timeoutSec: 2,
    cookies: {
      getCookieHeader: async () => "",
      setSetCookieHeaders: async () => undefined,
    },
  } as never;
}

Deno.test("fetchWithContext retries a one-shot request body", async () => {
  let attempts = 0;
  const server = Deno.serve({ port: 0 }, async (request) => {
    attempts++;
    const body = await request.text();
    if (attempts === 1) return new Response("retry", { status: 503 });
    return new Response(body, { status: 200 });
  });
  try {
    const address = server.addr as Deno.NetAddr;
    const url = `http://127.0.0.1:${address.port}/retry`;
    const request = new Request(url, {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("one-shot"));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await fetchWithContext(testContext(), request, {
      maxRetries: 2,
      timeoutSec: 2,
    });
    assertEquals(await response.text(), "one-shot");
    assertEquals(attempts, 2);
  } finally {
    await server.shutdown();
  }
});
