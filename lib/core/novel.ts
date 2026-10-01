import { ensureDir } from "jsr:@std/fs";
import { join } from "jsr:@std/path";
import type { RuntimeContext } from "./context.ts";
import { fromHTML, getDocumentWithContext, processContent } from "./html.ts";
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
  const fpath = join(outdir, `${removeIllegalPath(bookName)}.txt`);
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
    let written = 0;
    let errors = 0;

    for await (const chapter of callbacks.default(url)) {
      if (options.skipFirstChapter) {
        options.skipFirstChapter = false;
        continue;
      }
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
      options.lastChapterUrl = currentUrl;
      currentUrl = chapter.next_link ? String(chapter.next_link) : undefined;
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
    await Deno.remove(fpath).catch(() => undefined);
    reporter(Status.ERROR, "Download failed: no chapter was written");
    return undefined;
  } finally {
    file.close();
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
        : await getDocumentWithContext(ctx, nextUrl);
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
  const mainPage = await getDocumentWithContext(ctx, page);
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
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}
