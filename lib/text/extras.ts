import { ensureDir, walk } from "jsr:@std/fs";
import { basename, dirname, extname, globToRegExp, join } from "jsr:@std/path";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { processContent } from "../core/html.ts";

export interface RetxtResult {
  file: string;
  bytes: number;
}

export async function rewriteHtmlAsTxt(path: string): Promise<RetxtResult> {
  const html = await Deno.readTextFile(path);
  const dom = new DOMParser().parseFromString(html, "text/html");
  const text = processContent(dom.documentElement);
  await Deno.writeTextFile(path, text);
  return { file: path, bytes: text.length };
}

const normalizePattern = /^(?:[【\[].+?[】\]]\s*)?(.+?)⊙(?:([^-]+)-([^（]+))?.*?(（完本）)?\.(txt|epub)$/i;

export interface NormalizeResult {
  removed: string[];
  renamed: Array<{ from: string; to: string }>;
  ignored: string[];
}

export async function normalizeNovelFiles(dir: string): Promise<NormalizeResult> {
  const fileMap: Record<string, Array<{ name: string; size: number }>> = {};
  const ignored: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile) continue;
    const name = entry.name;
    const stat = await Deno.stat(join(dir, name));
    const title = normalizedNovelTitle(name);
    if (!title) {
      ignored.push(name);
      continue;
    }
    fileMap[title] ??= [];
    fileMap[title].push({ name, size: stat.size });
  }

  const result: NormalizeResult = { removed: [], renamed: [], ignored };
  for (const title in fileMap) {
    const entries = fileMap[title].toSorted((a, b) => b.size - a.size);
    const keep = entries[0];
    for (const entry of entries.slice(1)) {
      await Deno.remove(join(dir, entry.name));
      result.removed.push(entry.name);
    }
    const ext = extname(keep.name) || ".txt";
    const targetName = `${title}${ext}`;
    if (keep.name !== targetName) {
      await Deno.rename(join(dir, keep.name), join(dir, targetName));
      result.renamed.push({ from: keep.name, to: targetName });
    }
  }
  return result;
}

function normalizedNovelTitle(name: string): string | undefined {
  const match = name.match(normalizePattern);
  if (match) return match[1].trim().split("⊙")[0];
  if (name.includes("无广告")) return name.split("无广告")[0];
  if (name.endsWith(".txt") || name.endsWith(".epub")) return name.split(".")[0].split("⊙")[0];
  return undefined;
}

export interface FixNameResult {
  scanned: number;
  renamed: number;
  skipped: number;
}

export async function fixTxtNames(dir: string, minSimilarity = 0.6): Promise<FixNameResult> {
  const result: FixNameResult = { scanned: 0, renamed: 0, skipped: 0 };
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".txt")) continue;
    result.scanned++;
    const path = join(dir, entry.name);
    const content = await Deno.readTextFile(path);
    const title = extractTitle(content, basename(entry.name, ".txt"));
    if (!title) {
      result.skipped++;
      continue;
    }
    const currentName = basename(entry.name, ".txt");
    const sim = similarity(currentName, title);
    if (sim === 1 || sim < minSimilarity) {
      result.skipped++;
      continue;
    }
    const newName = `${title}.txt`;
    const target = join(dir, newName);
    const targetStat = await Deno.stat(target).catch(() => undefined);
    if (targetStat && targetStat.size < content.length) {
      result.skipped++;
      continue;
    }
    if (entry.name !== newName) {
      await Deno.rename(path, target);
      result.renamed++;
    }
  }
  return result;
}

function extractTitle(content: string, fileName: string): string | undefined {
  const lines = content.split(/[\r\n]+/);
  const authorIndex = lines.findIndex((line) => line.startsWith("作者"));
  if (authorIndex > 0) {
    const title = lines[authorIndex - 1].trim().replace(/^=+/g, "");
    if (title.length >= 2 && title.length <= 50) return title;
  }
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const trimmed = lines[i].trim();
    if (similarity(trimmed, fileName) > 0.8) return trimmed;
  }
  return undefined;
}

function similarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  if (longer.length === 0) return 1;
  return (longer.length - levenshteinDistance(a, b)) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const costs: number[] = [];
  for (let i = 0; i <= a.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= b.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let value = costs[j - 1];
        if (a.charAt(i - 1) !== b.charAt(j - 1)) value = Math.min(value, lastValue, costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = value;
      }
    }
    if (i > 0) costs[b.length] = lastValue;
  }
  return costs[b.length];
}

export interface RecurseJoinResult {
  moved: number;
  skipped: number;
}

export async function flattenTxtFiles(dir: string): Promise<RecurseJoinResult> {
  const result: RecurseJoinResult = { moved: 0, skipped: 0 };
  for await (const entry of walk(dir, { includeDirs: false, exts: [".txt"] })) {
    const target = join(dir, basename(entry.path));
    if (entry.path === target) continue;
    const sourceStat = await Deno.stat(entry.path);
    const targetStat = await Deno.stat(target).catch(() => undefined);
    if (targetStat && targetStat.size > sourceStat.size) {
      result.skipped++;
      continue;
    }
    await Deno.rename(entry.path, target);
    result.moved++;
  }
  return result;
}

export interface ForFileOptions {
  pattern: string;
  command: string;
  args: string[];
}

export async function runForFiles(options: ForFileOptions): Promise<number> {
  const glob = globToRegExp(basename(options.pattern));
  const dir = dirname(options.pattern);
  let count = 0;
  for await (const file of Deno.readDir(dir)) {
    if (!file.isFile || !glob.test(file.name)) continue;
    const fullPath = join(dir, file.name);
    let hasPlaceholder = false;
    const args = options.args.map((arg) => {
      if (arg.includes("%f") || arg.includes("%b")) {
        hasPlaceholder = true;
        return arg.replaceAll("%f", fullPath).replaceAll("%b", file.name);
      }
      return arg;
    });
    if (!hasPlaceholder) args.push(fullPath);
    const status = await new Deno.Command(options.command, {
      args,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (!status.success) throw new Error(`${options.command} failed for ${fullPath}`);
    count++;
  }
  return count;
}

export async function runBbdownLinks(links: string[], quality: string): Promise<number> {
  let count = 0;
  for (const link of links) {
    const output = await new Deno.Command("BBDown", {
      args: [link, "--download-danmaku", "--dfn-priority", quality],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (!output.success) throw new Error(`BBDown failed: ${link}`);
    count++;
  }
  return count;
}

export async function extractLinksFromFile(path: string): Promise<string[]> {
  const content = await Deno.readTextFile(path);
  return Array.from(content.matchAll(/https?:\/\/([^\s]+)/g)).map((match) => match[0]);
}

const noAdsPatterns = [
  /[\r\n]+\s*本书由【灵梦】[\s\S]+?私聊群主。\s*/g,
  /(?:灵[\/@\-*#^%$&~`!]{1,3}|l[\/@\-*#^%$&~`!]{1,3}i[\/@\-*#^%$&~`!]{1,3}n[\/@\-*#^%$&~`!]{1,3}g[\/@\-*#^%$&~`!]{1,3})(?:梦[\/@\-*#^%$&~`!]{1,3}|m[\/@\-*#^%$&~`!]{1,3}e[\/@\-*#^%$&~`!]{1,3}n[\/@\-*#^%$&~`!]{1,3}g[\/@\-*#^%$&~`!]{1,3})首[\/@\-*#^%$&~`!]{1,3}发/gi,
];

const obfuscatedNumberAdPattern =
  /(?:(?:[\/@\-*#^%$&~`!_+=|\\:;,.，。！？、\s]*)(?:[零一二三四五六七八九十①②③④⑤⑥⑦⑧⑨⑩⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑0-9]|wu|liu|qi|ba|jiu|shi)(?:[\/@\-*#^%$&~`!_+=|\\:;,.，。！？、\s]*)){3,}/giu;

export function filterNoAds(content: string): { content: string; removed: number } {
  let removed = 0;
  for (const pattern of noAdsPatterns) {
    removed += content.match(pattern)?.length ?? 0;
    content = content.replace(pattern, "");
  }
  content = content.replace(obfuscatedNumberAdPattern, (match) => {
    const compact = match.replace(/\s+/g, "");
    if (compact.length < 6) return match;
    removed++;
    return "";
  });
  return { content, removed };
}

export async function filterNoAdsFiles(input: string, output?: string, deleteOriginal = false): Promise<number> {
  const stat = await Deno.stat(input);
  const files: string[] = [];
  if (stat.isDirectory) {
    for await (const entry of Deno.readDir(input)) {
      if (entry.isFile && entry.name.endsWith(".txt")) files.push(join(input, entry.name));
    }
  } else {
    files.push(input);
  }
  const outputDir = output ?? (stat.isDirectory ? input : dirname(input));
  await ensureDir(outputDir);
  let count = 0;
  for (const file of files) {
    if (file.endsWith(".2.txt")) continue;
    const filtered = filterNoAds(await Deno.readTextFile(file));
    const target = deleteOriginal ? file : join(outputDir, `${basename(file)}.2.txt`);
    await Deno.writeTextFile(target, filtered.content);
    count++;
  }
  return count;
}

export interface RenamePatternOptions {
  dir: string;
  pattern: RegExp;
  replace: string;
  ext?: string;
  trashDir?: string;
}

export async function renameByPattern(options: RenamePatternOptions): Promise<{ renamed: number; trashed: number; skipped: number }> {
  const result = { renamed: 0, trashed: 0, skipped: 0 };
  const trashDir = options.trashDir ?? "trash";
  await ensureDir(join(options.dir, trashDir));
  for await (const entry of Deno.readDir(options.dir)) {
    if (!entry.isFile) continue;
    if (options.ext && !entry.name.toLowerCase().endsWith("." + options.ext.toLowerCase())) continue;
    const match = options.pattern.exec(entry.name);
    options.pattern.lastIndex = 0;
    if (!match) {
      result.skipped++;
      continue;
    }
    const nextBase = entry.name.replace(options.pattern, options.replace).trim();
    const nextName = extname(nextBase) ? nextBase : `${nextBase}${extname(entry.name)}`;
    if (!nextName || nextName === entry.name) {
      result.skipped++;
      continue;
    }
    const from = join(options.dir, entry.name);
    const to = join(options.dir, nextName);
    const targetStat = await Deno.stat(to).catch(() => undefined);
    if (targetStat?.isFile) {
      const sourceSize = (await Deno.stat(from)).size;
      if (Math.abs(sourceSize - targetStat.size) < 10 * 1024) {
        await Deno.rename(from, join(options.dir, trashDir, entry.name));
        result.trashed++;
        continue;
      }
    }
    await Deno.rename(from, to);
    result.renamed++;
  }
  return result;
}

export interface WeightedMatchFile {
  name_all?: string;
  _path?: string;
  size?: string;
  [key: string]: unknown;
}

export async function filterFilesWeighted(
  dir: string,
  filesJsonPath: string,
  outputPath: string,
): Promise<number> {
  const filesData = JSON.parse(await Deno.readTextFile(filesJsonPath)) as WeightedMatchFile[];
  const found: Array<WeightedMatchFile & {
    match_similarity: number;
    matched_file: string;
    file_size_bytes: number;
    combined_score: number;
  }> = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile) continue;
    const fileName = entry.name;
    let best: { index: number; similarity: number; sizeScore: number; combinedScore: number } = {
      index: -1,
      similarity: 0,
      sizeScore: 0,
      combinedScore: 0,
    };
    filesData.forEach((file, index) => {
      const targetName = file.name_all || (file._path ? basename(file._path) : "");
      const sim = similarity(fileName, targetName);
      const sizeScore = parseLooseFileSize(file.size || "0");
      const combined = Math.min(sizeScore / (10 * 1024 * 1024), 1) * 0.3 + sim * 0.7;
      if (combined > best.combinedScore) best = { index, similarity: sim, sizeScore, combinedScore: combined };
    });
    if (best.index !== -1 && best.similarity > 0.3) {
      found.push({
        ...filesData[best.index],
        match_similarity: best.similarity,
        matched_file: fileName,
        file_size_bytes: best.sizeScore,
        combined_score: best.combinedScore,
      });
    }
  }
  found.sort((a, b) => b.combined_score - a.combined_score);
  await Deno.writeTextFile(outputPath, JSON.stringify(found, null, 2));
  return found.length;
}

export async function renameContentTxtInDirs(dir: string): Promise<number> {
  let count = 0;
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isDirectory) continue;
    const source = join(dir, entry.name, "content.txt");
    try {
      await Deno.stat(source);
    } catch {
      continue;
    }
    await Deno.rename(source, join(dir, `${entry.name}.txt`));
    count++;
  }
  return count;
}

export async function reorderComicCbz(dir: string): Promise<number> {
  const pattern = /^\d+_(\d+)([\w\W]+)\.cbz$/;
  let count = 0;
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile) continue;
    const match = pattern.exec(entry.name);
    if (!match) continue;
    await Deno.rename(join(dir, entry.name), join(dir, `${match[1]}_${match[2]}.cbz`));
    count++;
  }
  return count;
}

export async function fixMixedCodeFiles(dir: string): Promise<number> {
  let count = 0;
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile) continue;
    const path = join(dir, entry.name);
    const bin = await Deno.readFile(path);
    const text = new TextDecoder().decode(bin.slice(0, 300));
    if (!text.includes("封面：yes")) continue;
    const index = bin.indexOf(0x0A);
    if (index < 0) continue;
    await Deno.writeFile(path, bin.slice(index + 3));
    count++;
  }
  return count;
}

function parseLooseFileSize(sizeStr: string): number {
  const units: Record<string, number> = { B: 1, K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };
  const match = sizeStr.match(/^([\d.]+)\s*([BKMGT])?/i);
  if (!match) return 0;
  return Number.parseFloat(match[1]) * (units[match[2]?.toUpperCase() || "B"] || 1);
}
