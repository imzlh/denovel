import { walk } from "jsr:@std/fs";

export interface UnescapeOptions {
  noBackup?: boolean;
  recursive?: boolean;
}

export interface UnescapeResult {
  file: string;
  entityCount: number;
  changed: boolean;
}

export async function unescapeHtmlEntities(paths: string[], options: UnescapeOptions = {}): Promise<UnescapeResult[]> {
  const files = options.recursive ? await collectTxtFiles(paths) : paths;
  const results: UnescapeResult[] = [];
  for (const file of files) {
    const content = await Deno.readTextFile(file);
    const entityCount = countHtmlEntities(content);
    if (entityCount === 0) {
      results.push({ file, entityCount, changed: false });
      continue;
    }
    if (!options.noBackup) await Deno.writeTextFile(`${file}.bak`, content);
    await Deno.writeTextFile(file, decodeHtmlEntities(content));
    results.push({ file, entityCount, changed: true });
  }
  return results;
}

async function collectTxtFiles(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const path of paths) {
    const stat = await Deno.stat(path);
    if (stat.isFile) {
      if (path.toLowerCase().endsWith(".txt")) files.push(path);
    } else if (stat.isDirectory) {
      for await (const entry of walk(path, { exts: [".txt"], includeDirs: false })) {
        files.push(entry.path);
      }
    }
  }
  return files;
}

function countHtmlEntities(content: string): number {
  return content.match(/&#?[a-zA-Z0-9]+;/g)?.length ?? 0;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: "\"",
};

function decodeHtmlEntities(content: string): string {
  return content.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]+);/g, (full, body: string) => {
    if (body.startsWith("#x")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return NAMED_ENTITIES[body] ?? full;
  });
}
