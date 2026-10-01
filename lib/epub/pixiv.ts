import { basename, dirname, join } from "jsr:@std/path";
import { exists } from "../core/fs.ts";
import { generateEpub, type EpubContentOptions, type EpubOptions } from "./generate.ts";

interface PixivNovelFile {
  id: number;
  title: string;
  filename: string;
  content: string;
  coverImage?: string;
}

export interface PixivEpubOptions {
  inputDir: string;
  output?: string;
  author?: string;
  cover?: string;
  force?: boolean;
}

export async function pixivToEpub(options: PixivEpubOptions): Promise<{ output: string; novels: number }> {
  const novels = await loadNovelFiles(options.inputDir);
  if (novels.length === 0) throw new Error("No Pixiv txt files found. Expected filename format: ID-title.txt");

  let output = options.output ??
    join(dirname(options.inputDir) === "." ? "." : dirname(options.inputDir), `${safeFileName(novels[0].title.slice(0, 50))}.epub`);
  if (!output.endsWith(".epub")) output += ".epub";
  if (await exists(output) && !options.force) throw new Error(`Output exists: ${output}`);

  const content: EpubContentOptions[] = novels.map((novel, index) => ({
    title: novels.length > 1 ? `${index + 1}. ${novel.title}` : novel.title,
    data: novel.content,
    author: options.author || "Pixiv作者",
  }));

  let coverPath: string | undefined;
  if (options.cover && await exists(options.cover)) coverPath = options.cover;
  else if (novels[0].coverImage) coverPath = novels[0].coverImage;

  const epubOptions: EpubOptions = {
    title: novels.length > 1 ? `${novels[0].title}（共${novels.length}篇）` : novels[0].title,
    description: "来自Pixiv的系列小说",
    author: options.author || "Pixiv作者",
    publisher: "Pixiv",
    lang: "zh-CN",
    content,
    cover: coverPath,
    version: 3,
    downloadAudioVideoFiles: false,
  };

  await generateEpub(epubOptions, output);
  return { output, novels: novels.length };
}

async function loadNovelFiles(inputDir: string): Promise<PixivNovelFile[]> {
  const novels: PixivNovelFile[] = [];
  for await (const entry of Deno.readDir(inputDir)) {
    if (!entry.isFile || !entry.name.endsWith(".txt")) continue;
    const parsed = parseFilename(entry.name);
    if (!parsed) continue;
    const content = await Deno.readTextFile(join(inputDir, entry.name));
    novels.push({
      id: parsed.id,
      title: parsed.title,
      filename: entry.name,
      coverImage: await findCoverImage(inputDir, parsed.id, parsed.title),
      content: textToHtml(processImages(content, inputDir, parsed.id, parsed.title)),
    });
  }
  return novels.toSorted((a, b) => a.id - b.id);
}

function parseFilename(filename: string): { id: number; title: string } | undefined {
  const match = filename.match(/^(\d+)-(.+)\.txt$/);
  if (!match) return undefined;
  return { id: Number.parseInt(match[1], 10), title: match[2] };
}

async function findCoverImage(inputDir: string, id: number, title: string): Promise<string | undefined> {
  const base = `${id}-${title}`;
  for (const ext of ["jpg", "jpeg", "png", "gif", "webp"]) {
    const coverPath = join(inputDir, `${base}.${ext}`);
    if (await exists(coverPath)) return coverPath;
  }
  return undefined;
}

function processImages(content: string, inputDir: string, baseId: number, title: string): string {
  return content.replace(/\[uploadedimage:(\d+)\]/g, (_match, imageId) => {
    const imageBase = `${baseId}-${title}-${imageId}`;
    for (const ext of ["jpg", "jpeg", "png", "gif", "webp"]) {
      const path = join(inputDir, `${imageBase}.${ext}`);
      try {
        Deno.statSync(path);
        return `<img src="file://${encodeURI(path)}" alt="image-${imageId}" />`;
      } catch {
        // try next extension
      }
    }
    return `<img src="file://${imageBase}.png" alt="image-${imageId}" />`;
  });
}

function textToHtml(text: string): string {
  return text.trim().split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
      return lines.length === 1 ? `<p>${lines[0]}</p>` : `<p>${lines.join("<br/>\n")}</p>`;
    })
    .join("\n");
}

function safeFileName(input: string): string {
  return basename(input).replace(/[<>:"/\\|?*]/g, "_");
}
