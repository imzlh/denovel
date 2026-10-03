import { assertEquals, assertExists } from "jsr:@std/assert";
import { getCommand } from "../src/commands/mod.ts";

Deno.test("legacy script names resolve to v2 commands", () => {
  assertEquals(getCommand("ddxs")?.name, "uc");
  assertEquals(getCommand("genepub")?.name, "2epub");
  assertEquals(getCommand("comic")?.name, "downcomic");
  assertEquals(getCommand("lanzoudl")?.name, "lanzou");
  assertEquals(getCommand("specialm3u8")?.name, "m3u8");
  assertExists(getCommand("neast"));
  assertExists(getCommand("kugou"));
});
