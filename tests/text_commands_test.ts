import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { splitTxtFilesIntoFolders } from "../lib/text/file_ops.ts";
import { unescapeHtmlEntities } from "../lib/text/html_entities.ts";
import { traditionalToSimplified } from "../lib/text/t2cn.ts";

Deno.test("splitTxtFilesIntoFolders moves txt files into numbered folders", async () => {
  const dir = await Deno.makeTempDir({ prefix: "denovel-v2-part-" });
  try {
    await Deno.writeTextFile(join(dir, "b.txt"), "b");
    await Deno.writeTextFile(join(dir, "a.txt"), "a");
    await Deno.writeTextFile(join(dir, "ignore.md"), "x");
    const result = await splitTxtFilesIntoFolders(dir, 1);
    assertEquals(result, { files: 2, folders: 2 });
    assertEquals(await Deno.readTextFile(join(dir, "1", "a.txt")), "a");
    assertEquals(await Deno.readTextFile(join(dir, "2", "b.txt")), "b");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("unescapeHtmlEntities decodes named and numeric entities", async () => {
  const dir = await Deno.makeTempDir({ prefix: "denovel-v2-unescape-" });
  try {
    const file = join(dir, "a.txt");
    await Deno.writeTextFile(file, "a&amp;b &#x4F60;&#22909;");
    const result = await unescapeHtmlEntities([file], { noBackup: true });
    assertEquals(result, [{ file, entityCount: 3, changed: true }]);
    assertEquals(await Deno.readTextFile(file), "a&b 你好");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("traditionalToSimplified converts common traditional text", () => {
  assertEquals(traditionalToSimplified("臺灣軟體"), "台湾软体");
});
