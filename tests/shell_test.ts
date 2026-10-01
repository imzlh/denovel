import { assertEquals, assertThrows } from "jsr:@std/assert";
import { splitCommand } from "../src/shell.ts";
import { CommandError } from "../lib/core/errors.ts";

Deno.test("splitCommand preserves quoted arguments", () => {
  assertEquals(splitCommand(`downovel --name "hello world" 'https://example.com/a b'`), [
    "downovel",
    "--name",
    "hello world",
    "https://example.com/a b",
  ]);
});

Deno.test("splitCommand rejects unclosed quotes", () => {
  assertThrows(() => splitCommand(`downovel "missing`), CommandError);
});
