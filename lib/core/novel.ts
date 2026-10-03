import { ensureDir } from "jsr:@std/fs";
import { basename, dirname, extname, join } from "jsr:@std/path";
import type { RuntimeContext } from "./context.ts";
import { fromHTML, getDocumentWithContext, processContent } from "./html.ts";
import type { FetchOptions } from "./fetch.ts";
import { removeIllegalPath } from "./fs.ts";
import { setDefaultRuntimeContext } from "./runtime_api.ts";
import { SiteRegistry } from "./site_registry.ts";
import { Status } from "./status.ts";
import { similarTitle } from "./title.ts";
import type { Callback, Data, MainInfoResult, TraditionalConfig } from "./types.ts";
import { traditionalToSimplified } from "../text/t2cn.ts";

const META_HEADER = ":: org.imzlh.denovel.meta";
const siteRegistry = new SiteRegistry(import.meta.url);

export interface DownloadNovelOptions {
  traditional?: boolean;
  reporter?: (status: Status, message: string, error?: Error) => void;
  bookName?: string;
  /** Explicit output file path, primarily used by resume operations. */
  outputPath?: string;
  cover?: string;
  outdir?: string;
  translate?: boolean;
  disableParted?: boolean;
  sleepTime?: number;
  noInput?: boolean;
  author?: string;
  summary?: string;
  previousTitle?: string;
  chapterId?: number;
  lastChapterUrl?: string;
  hideMeta?: boolean;
  skipFirstChapter?: boolean;
  disableOverwrite?: boolean;
  /** Keep an existing output file when a resume run finds no new chapter. */
  preserveOnEmpty?: boolean;
  /** Disable automatic continuation from an existing TXT metadata block. */
  noContinue?: boolean;
  signal?: AbortSignal;
}

export interface NovelInspection {
  isChapterPage: boolean;
  title?: string;
  cover?: string;
  author?: string;
  summary?: string;
  startOfContent?: string;
  jpStyle?: boolean;
  content?: string;
  nextChapter?: string;
  currentURL: string;
}

interface LoadedCallbacks {
  default: Callback;
  getInfo?: (url: URL) => Promise<MainInfoResult | null>;
}

export async function checkIsTraditional(url: URL): Promise<boolean> {
  if (await siteRegistry.hasTraditional(url.hostname)) return true;
  if (await siteRegistry.hasNative(url.hostname)) return false;
  throw new Error(`No site adapter found for ${url.hostname}`);
}

export async function downloadNovel(
  ctx: RuntimeContext,
  startUrl: string,
  options: DownloadNovelOptions = {},
): Promise<string | undefined> {
  setDefaultRuntimeContext(ctx);
  const reporter = options.reporter ?? ((status, message, error) => {
    console.log(`[ ${Status[status]} ] ${message}`, error?.message ?? "");
  });
  const outdir = options.outdir ?? ctx.outputDir;
  await ensureDir(outdir);
  const start = new URL(startUrl);
  const traditional = options.traditional ?? await checkIsTraditional(start);
  const callbacks = await loadCallbacks(ctx, start, traditional);
  const info = options.hideMeta ? undefined : await callbacks.getInfo?.(start);
  let url = info?.firstPage ?? start;

  const bookName = options.bookName ?? info?.book_name;
  if (!bookName) throw new Error("Missing book name. Pass --name for adapters that cannot infer it.");
  const author = options.author ?? info?.author;
  const summary = options.summary ?? info?.summary;
  const cover = options.cover ?? info?.cover;
  const fpath = options.outputPath ?? join(outdir, `${removeIllegalPath(bookName)}.txt`);
  await ensureDir(dirname(fpath));
  if (!options.noContinue && !options.outputPath) {
    const existing = await readFileIfPresent(fpath);
    if (existing) {
      const saved = parseNovelMetadata(new TextDecoder().decode(existing));
      if (saved?.options.lastChapterUrl) {
        reporter(Status.QUEUED, `继续断点下载, start=${saved.options.lastChapterUrl}`);
        return await resumeNovelFromFile(ctx, fpath, { ...options, noContinue: true });
      }
    }
  }
  const file = await Deno.open(fpath, {
    create: true,
    append: options.disableOverwrite,
    write: !options.disableOverwrite,
    truncate: !options.disableOverwrite,
  });

  try {
    if (!options.hideMeta) {
      await write(file, `${bookName}\r\n`);
      if (author) await write(file, `作者: ${author}\r\n`);
      if (summary) await write(file, `简介:\r\n${summary}\r\n${"-".repeat(20)}\r\n`);
      if (cover) await write(file, `封面: ${cover}\r\n`);
    }

    let chapterId = options.chapterId ?? 1;
    let previousTitle = options.previousTitle ?? "";
    let currentUrl: string | undefined = url.href;
    const visitedUrls = new Set<string>();
    let written = 0;
    let errors = 0;

    for await (const chapter of callbacks.default(url)) {
      const chapterUrl: string | undefined = currentUrl;
      if (currentUrl) {
        if (visitedUrls.has(currentUrl)) {
          reporter(Status.ERROR, `Adapter returned a repeated chapter URL: ${currentUrl}`);
          break;
        }
        visitedUrls.add(currentUrl);
      }
      const nextChapterUrl: string | undefined = chapter.next_link
        ? new URL(String(chapter.next_link), chapterUrl ?? start.href).href
        : undefined;
      if (options.skipFirstChapter) {
        options.skipFirstChapter = false;
        // Resume starts at the last chapter that was already written. Advance
        // the cursor before skipping it so the following chapter is fetched.
        currentUrl = nextChapterUrl;
        continue;
      }
      // Advance the cursor even when this chapter is malformed. Adapters can
      // yield several chapters from one generator; keeping the old URL here
      // would make the next item look like a URL loop after a short chapter.
      currentUrl = nextChapterUrl;
      const content = normalizeChapterContent(chapter.content, !!options.translate);
      if (!content || content.length < 20) {
        errors++;
        reporter(Status.ERROR, `Chapter ${chapterId} has too little content`);
        if (errors >= 3) break;
        continue;
      }
      errors = 0;
      const title = options.translate ? traditionalToSimplified(chapter.title ?? "") : chapter.title;
      let text = "";
      if (options.disableParted || !title || similarTitle(previousTitle, title, true)) {
        text += `\n${content}`;
      } else {
        text += `\r\n第${chapterId++}章 ${title}\r\n${content}\r\n`;
      }
      previousTitle = title ?? previousTitle;
      options.lastChapterUrl = chapterUrl;
      await write(file, text);
      written++;
      reporter(Status.DOWNLOADING, `Chapter ${chapterId - 1} ${title ?? ""} (${text.length})`);
      if (options.signal?.aborted) break;
      await sleepSeconds(options.sleepTime ?? ctx.sleepSec);
    }

    if (written > 0) {
      await write(file, `\r\n[comment]\r\n${META_HEADER}\r\n${JSON.stringify({
        ...options,
        bookName,
        previousTitle,
        chapterId,
      }, null, 2)}\r\n[/comment]`);
      reporter(Status.DONE, fpath);
      return fpath;
    }
    if (!options.preserveOnEmpty) await Deno.remove(fpath).catch(() => undefined);
    reporter(Status.ERROR, "Download failed: no chapter was written");
    return undefined;
  } finally {
    file.close();
  }
}

/**
 * Resume a v2 novel download from the metadata appended to a previous TXT.
 *
 * The saved URL points at the last chapter that was written, so the first
 * chapter returned by the adapter is skipped before appending new chapters.
 * The old metadata block is removed while downloading and restored if the
 * request fails or no new chapter is available.
 */
export async function resumeNovelFromFile(
  ctx: RuntimeContext,
  filePath: string,
  overrides: DownloadNovelOptions = {},
): Promise<string | undefined> {
  const original = await Deno.readFile(filePath);
  const text = new TextDecoder().decode(original);
  const parsed = parseNovelMetadata(text);
  if (!parsed) throw new Error("Cannot find denovel metadata in TXT file");
  const saved = parsed.options;
  if (!saved.lastChapterUrl) throw new Error("Novel metadata is missing lastChapterUrl");

  const content = text.slice(0, parsed.blockStart).replace(/[\r\n]+$/u, "") + "\r\n";
  await Deno.writeTextFile(filePath, content);
  const options: DownloadNovelOptions = {
    ...saved,
    ...overrides,
    outdir: overrides.outdir ?? dirname(filePath),
    outputPath: filePath,
    bookName: overrides.bookName ?? saved.bookName ?? basename(filePath, extname(filePath)),
    hideMeta: true,
    skipFirstChapter: true,
    disableOverwrite: true,
    preserveOnEmpty: true,
    noContinue: true,
  };

  try {
    const output = await downloadNovel(ctx, saved.lastChapterUrl, options);
    if (!output) await Deno.writeFile(filePath, original);
    return output ?? filePath;
  } catch (error) {
    await Deno.writeFile(filePath, original);
    throw error;
  }
}

interface NovelMetadata {
  blockStart: number;
  options: DownloadNovelOptions;
}

function parseNovelMetadata(text: string): NovelMetadata | undefined {
  const marker = text.lastIndexOf(META_HEADER);
  if (marker < 0) return undefined;
  const blockStart = text.lastIndexOf("[comment]", marker);
  if (blockStart < 0) return undefined;
  const blockEnd = text.indexOf("[/comment]", marker + META_HEADER.length);
  if (blockEnd < 0) return undefined;
  const json = text.slice(marker + META_HEADER.length, blockEnd).trim();
  if (!json) return undefined;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return undefined;
    // v1 stored snake_case option names. Normalize them here so a TXT made by
    // the old CLI can be resumed by the v2 downloader.
    const options: DownloadNovelOptions = {
      traditional: asBoolean(raw.traditional),
      bookName: asString(raw.bookName ?? raw.book_name),
      cover: asString(raw.cover),
      outdir: asString(raw.outdir),
      translate: asBoolean(raw.translate),
      disableParted: asBoolean(raw.disableParted ?? raw.disable_parted),
      sleepTime: asNumber(raw.sleepTime ?? raw.sleep_time),
      author: asString(raw.author),
      summary: asString(raw.summary),
      previousTitle: asString(raw.previousTitle ?? raw.previous_title),
      chapterId: asNumber(raw.chapterId ?? raw.chapter_id),
      lastChapterUrl: asString(raw.lastChapterUrl ?? raw.last_chapter_url),
    };
    return { blockStart, options };
  } catch {
    return undefined;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

async function readFileIfPresent(path: string): Promise<Uint8Array | undefined> {
  try {
    const stat = await Deno.stat(path);
    if (!stat.isFile || stat.size === 0) return undefined;
    return await Deno.readFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

export async function inspectNovel(ctx: RuntimeContext, target: string | URL): Promise<NovelInspection> {
  setDefaultRuntimeContext(ctx);
  const url = new URL(target);
  const traditional = await checkIsTraditional(url);
  const callbacks = await loadCallbacks(ctx, url, traditional);
  const info = await callbacks.getInfo?.(url).catch(() => null);

  if (info) {
    return {
      isChapterPage: false,
      title: info.book_name,
      cover: info.cover,
      author: info.author,
      summary: info.summary,
      startOfContent: info.firstPage?.href,
      jpStyle: info.jpStyle,
      currentURL: url.href,
    };
  }

  const chapter = await callbacks.default(url).next();
  if (chapter.done || !chapter.value) throw new Error("Page not found or adapter returned no chapter");
  const next = chapter.value.next_link ? new URL(String(chapter.value.next_link), url) : undefined;
  return {
    isChapterPage: true,
    title: chapter.value.title,
    content: normalizeChapterContent(chapter.value.content, false),
    nextChapter: next?.protocol.startsWith("http") ? next.href : undefined,
    currentURL: url.href,
  };
}

async function loadCallbacks(ctx: RuntimeContext, url: URL, traditional: boolean): Promise<LoadedCallbacks> {
  if (traditional) {
    const cfg = (await siteRegistry.loadTraditional(url.hostname)).default as TraditionalConfig;
    return {
      default: traditionalWrapper(ctx, url, cfg),
      getInfo: (page) => defaultTraditionalInfo(ctx, page, cfg),
    };
  }
  const mod = await siteRegistry.loadNative(url.hostname);
  return {
    default: mod.default as Callback,
    getInfo: mod.getInfo as LoadedCallbacks["getInfo"],
  };
}

function traditionalWrapper(ctx: RuntimeContext, _url: URL, config: TraditionalConfig): Callback {
  return async function* wrap(start: URL | string): AsyncGenerator<Data> {
    let nextUrl: URL | undefined = new URL(start);
    while (nextUrl && nextUrl.protocol.startsWith("http")) {
      const document = config.request
        ? await config.request(nextUrl)
        : await getDocumentWithContext(ctx, nextUrl, {
          networkOverride: config.networkHandler as ((url: string | URL, options?: FetchOptions) => Promise<Response>) | undefined,
        });
      const contentEl = document.querySelector(config.content);
      const data: Data & { url: URL } = {
        title: document.querySelector(config.title)?.textContent ?? "",
        content: contentEl ? processContent(contentEl, {}, nextUrl) : "",
        next_link: document.querySelector(config.next_link)?.getAttribute("href") || undefined,
        url: nextUrl,
      };
      if (config.filter) await config.filter(document, data);
      nextUrl = data.next_link ? new URL(data.next_link, nextUrl) : undefined;
      yield {
        title: data.title?.trim(),
        content: data.content?.trim(),
        next_link: nextUrl,
      };
    }
  };
}

async function defaultTraditionalInfo(
  ctx: RuntimeContext,
  page: URL,
  cfg: TraditionalConfig,
): Promise<MainInfoResult | null> {
  if (!cfg.mainPageLike || !cfg.mainPageLike.test(page.href)) return null;
  const mainPage = await getDocumentWithContext(ctx, page, {
    networkOverride: cfg.networkHandler as ((url: string | URL, options?: FetchOptions) => Promise<Response>) | undefined,
  });
  const firstPage = cfg.mainPageFirstChapter
    ? mainPage.querySelector(cfg.mainPageFirstChapter)?.getAttribute("href")
    : page.href;
  const cover = cfg.mainPageCover ? mainPage.querySelector(cfg.mainPageCover)?.getAttribute("src") : undefined;
  const info: MainInfoResult = {
    firstPage: firstPage ? new URL(firstPage, page) : page,
    cover: cover ? new URL(cover, page).href : undefined,
    book_name: cfg.mainPageTitle ? mainPage.querySelector(cfg.mainPageTitle)?.textContent?.trim() : undefined,
    summary: cfg.mainPageSummary ? processContent(mainPage.querySelector(cfg.mainPageSummary), {}, page) : undefined,
    jpStyle: cfg.jpStyle,
    author: cfg.mainPageAuthor ? mainPage.querySelector(cfg.mainPageAuthor)?.textContent?.trim() : undefined,
  };
  if (cfg.mainPageFilter) await cfg.mainPageFilter(page, mainPage, info);
  if (cfg.infoFilter) await cfg.infoFilter(page, info);
  return info;
}

function normalizeChapterContent(content: string | undefined, translate: boolean): string {
  if (!content) return "";
  content = fromHTML(content).trim();
  return translate ? traditionalToSimplified(content) : content;
}

function write(file: Deno.FsFile, text: string): Promise<number> {
  return file.write(new TextEncoder().encode(text));
}

function sleepSeconds(sec: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, sec) * 1000));
}
