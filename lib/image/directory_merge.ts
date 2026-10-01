import { basename, join, relative } from "jsr:@std/path";
import { mergeImagesVertically } from "./merge.ts";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

export async function mergeImageDirectories(root: string, outputRoot = "dist"): Promise<string[]> {
  const stat = await Deno.stat(root).catch(() => undefined);
  if (!stat?.isDirectory) throw new Error(`Directory not found: ${root}`);
  const dirs = await collectImageDirs(root);
  const targets = dirs.length > 0 ? dirs : [root];
  const outputs: string[] = [];
  for (const dir of targets) {
    const rel = relative(root, dir);
    const outputBase = rel ? join(outputRoot, rel) : join(outputRoot, basename(root));
    const files = [];
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !isImageFile(entry.name)) continue;
      files.push({ name: entry.name, data: await Deno.readFile(join(dir, entry.name)) });
    }
    if (files.length === 0) continue;
    files.sort((a, b) => a.name.localeCompare(b.name));
    outputs.push(...await mergeImagesVertically(files, { outputBase, format: "png" }));
  }
  return outputs;
}

async function collectImageDirs(root: string): Promise<string[]> {
  const dirs: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    if (!entry.isDirectory) continue;
    const dir = join(root, entry.name);
    if (await hasImages(dir)) dirs.push(dir);
    dirs.push(...await collectImageDirs(dir));
  }
  return dirs;
}

async function hasImages(dir: string): Promise<boolean> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && isImageFile(entry.name)) return true;
  }
  return false;
}

function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(name.toLowerCase().split(".").at(-1) ?? "");
}
