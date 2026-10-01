import { join } from "jsr:@std/path";

export interface CopyOptions {
  keywords?: string[];
  maxTotalSize?: number;
  minFileSize?: number;
  maxFileCount?: number;
  random?: boolean;
  sortName?: "asc" | "desc";
  sortTime?: "asc" | "desc";
}

export interface CopyResult {
  copied: number;
  totalSize: number;
  files: string[];
}

export async function copyFiles(srcDir: string, destDir: string, options: CopyOptions = {}): Promise<CopyResult> {
  await Deno.mkdir(destDir, { recursive: true });
  let entries = Array.from(Deno.readDirSync(srcDir)).filter((entry) => entry.isFile);
  if (options.sortName) entries = entries.sort((a, b) => order(options.sortName!) * a.name.localeCompare(b.name));
  if (options.sortTime) {
    entries = entries.sort((a, b) => {
      const at = Deno.statSync(join(srcDir, a.name)).mtime?.getTime() ?? 0;
      const bt = Deno.statSync(join(srcDir, b.name)).mtime?.getTime() ?? 0;
      return order(options.sortTime!) * (at - bt);
    });
  }

  const result: CopyResult = { copied: 0, totalSize: 0, files: [] };
  while (entries.length > 0) {
    const index = options.random ? Math.floor(Math.random() * entries.length) : 0;
    const entry = entries.splice(index, 1)[0];
    if (options.keywords?.length && !options.keywords.some((keyword) => entry.name.includes(keyword))) continue;
    const src = join(srcDir, entry.name);
    const stat = await Deno.stat(src);
    if (options.minFileSize && stat.size < options.minFileSize) continue;
    if (options.maxTotalSize && result.totalSize + stat.size > options.maxTotalSize) break;
    if (options.maxFileCount && result.copied >= options.maxFileCount) break;
    await Deno.copyFile(src, join(destDir, entry.name));
    result.copied++;
    result.totalSize += stat.size;
    result.files.push(entry.name);
  }
  return result;
}

export function parseSize(input: string): number {
  const match = input.match(/^(\d+)([kmg])?$/i);
  if (!match) throw new Error(`Invalid size: ${input}`);
  const value = Number.parseInt(match[1], 10);
  switch ((match[2] ?? "b").toLowerCase()) {
    case "k":
      return value * 1024;
    case "m":
      return value * 1024 * 1024;
    case "g":
      return value * 1024 * 1024 * 1024;
    default:
      return value;
  }
}

function order(value: "asc" | "desc"): number {
  return value === "asc" ? 1 : -1;
}
