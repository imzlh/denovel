import { basename, join } from "jsr:@std/path";
import { copy, ensureDir, move, walk } from "jsr:@std/fs";

export async function splitTxtFilesIntoFolders(
  sourceDir: string,
  filesPerFolder = 60,
): Promise<{ files: number; folders: number }> {
  const stat = await Deno.stat(sourceDir).catch(() => undefined);
  if (!stat?.isDirectory) throw new Error(`Directory not found: ${sourceDir}`);

  const files: string[] = [];
  for await (const entry of Deno.readDir(sourceDir)) {
    if (entry.isFile && entry.name.toLowerCase().endsWith(".txt")) files.push(entry.name);
  }
  files.sort((a, b) => a.localeCompare(b));

  const folderCount = Math.ceil(files.length / filesPerFolder);
  for (let i = 1; i <= folderCount; i++) {
    const folderName = i.toString();
    const folderPath = join(sourceDir, folderName);
    await ensureDir(folderPath);
    const start = (i - 1) * filesPerFolder;
    const end = Math.min(i * filesPerFolder, files.length);
    for (let j = start; j < end; j++) {
      const fileName = files[j];
      await move(join(sourceDir, fileName), join(folderPath, fileName), { overwrite: false });
    }
  }

  return { files: files.length, folders: folderCount };
}

export interface KeywordMatch {
  file: string;
  appearances: number;
}

export async function findKeywordInTxtFiles(
  dir: string,
  keyword: string,
  minAppearances: number,
): Promise<KeywordMatch[]> {
  const matches: KeywordMatch[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".txt")) continue;
    const content = await Deno.readTextFile(join(dir, entry.name));
    if (content.includes(".xhtml") && countOccurrences(content, ".xhtml") >= 10) continue;
    const appearances = countOccurrences(content, keyword);
    if (appearances >= minAppearances) matches.push({ file: entry.name, appearances });
  }
  return matches;
}

export async function linkMatches(dir: string, matches: KeywordMatch[], outputDir = "matched"): Promise<void> {
  const targetDir = join(dir, outputDir);
  await ensureDir(targetDir);
  for (const match of matches) {
    const target = join(targetDir, basename(match.file));
    try {
      await Deno.link(join(dir, match.file), target);
    } catch (error) {
      if (error instanceof Deno.errors.AlreadyExists) continue;
      throw error;
    }
  }
}

export interface MoveTxtOptions {
  sourceDir: string;
  targetDir: string;
  sizeThresholdBytes: number;
}

export interface MoveTxtResult {
  moved: number;
  copied: number;
  skipped: number;
  failed: number;
}

export async function moveTxtFiles(options: MoveTxtOptions): Promise<MoveTxtResult> {
  const result: MoveTxtResult = { moved: 0, copied: 0, skipped: 0, failed: 0 };
  await ensureDir(options.targetDir);
  for await (const entry of walk(options.sourceDir, { exts: [".txt"], includeDirs: false })) {
    const sourcePath = entry.path;
    const targetPath = join(options.targetDir, basename(sourcePath));
    try {
      const sourceSize = (await Deno.stat(sourcePath)).size;
      const targetStat = await Deno.stat(targetPath).catch(() => undefined);
      if (targetStat) {
        const diff = Math.abs(sourceSize - targetStat.size);
        if (diff <= options.sizeThresholdBytes) {
          if (targetStat.size > sourceSize) {
            await copy(sourcePath, targetPath, { overwrite: true });
            result.copied++;
          } else {
            result.skipped++;
          }
          continue;
        }
      }
      await move(sourcePath, targetPath, { overwrite: true });
      result.moved++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

function countOccurrences(content: string, keyword: string): number {
  if (!keyword) return 0;
  let count = 0;
  let pos = -1;
  while ((pos = content.indexOf(keyword, pos + 1)) !== -1) count++;
  return count;
}
