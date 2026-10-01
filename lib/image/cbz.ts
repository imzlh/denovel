import { extract } from "jsr:@quentinadam/zip";
import { basename, join } from "jsr:@std/path";
import { mergeImagesVertically } from "./merge.ts";

export async function convertCbzFile(file: string): Promise<string[]> {
  const outputBase = file.replace(/\.cbz?$/i, "");
  const entries = await extract(await Deno.readFile(file));
  return await mergeImagesVertically(entries, { outputBase, format: "jpeg" });
}

export async function convertCbzPath(path: string): Promise<string[]> {
  const stat = await Deno.stat(path).catch(() => undefined);
  if (!stat) throw new Error(`File or directory not found: ${path}`);
  if (stat.isFile) return await convertCbzFile(path);

  const outputs: string[] = [];
  for await (const entry of Deno.readDir(path)) {
    if (!entry.isFile || !entry.name.toLowerCase().endsWith(".cbz")) continue;
    const file = join(path, entry.name);
    const output = join(path, basename(entry.name).replace(/\.cbz?$/i, ".jpg"));
    if (await exists(output)) continue;
    outputs.push(...await convertCbzFile(file));
  }
  return outputs;
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
