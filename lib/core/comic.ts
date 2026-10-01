import { create } from "jsr:@quentinadam/zip";
import { ensureDir } from "jsr:@std/fs";
import { join } from "jsr:@std/path";
import type { RuntimeContext } from "./context.ts";
import { fetchWithContext, type FetchOptions } from "./fetch.ts";
import { removeIllegalPath } from "./fs.ts";
import { setDefaultRuntimeContext } from "./runtime_api.ts";
import { ComicSiteRegistry } from "./site_registry.ts";
import { similarTitle } from "./title.ts";
import type { ComicMainInfo } from "./types.ts";

export interface DownloadComicOptions {
  name?: string;
  outdir?: string;
  cover?: string;
  sleepSec?: number;
  noMulti?: boolean;
}

interface ComicMeta {
  title: string;
  cover?: string;
  originSite: string;
  tags?: string[];
  summary?: string;
  author?: string;
}

interface Chapter {
  title: string;
  images: string[];
}

type SiteFetcher = (input: string | URL | Request, options?: FetchOptions) => Promise<Response>;

const comicSiteRegistry = new ComicSiteRegistry(import.meta.url);

export async function downloadComic(
  ctx: RuntimeContext,
  startUrl: string,
  options: DownloadComicOptions = {},
): Promise<string> {
  setDefaultRuntimeContext(ctx);
  const outdir = options.outdir ?? "out";
  await ensureDir(outdir);
  let url = new URL(startUrl);
  const originSite = await comicSiteRegistry.resolve(url.hostname);
  const mod = await comicSiteRegistry.load(originSite);
  const next = mod.default as (url: string) => AsyncGenerator<string, [string, string], string>;
  const fetcher = createSiteFetcher(ctx, mod.networkHandler);
  const meta: ComicMeta = {
    title: options.name ?? new Date().toISOString(),
    cover: options.cover,
    originSite,
  };

  if (typeof mod.getInfo === "function") {
    const info = await mod.getInfo(startUrl) as ComicMainInfo;
    meta.title = options.name ?? info.title?.trim() ?? meta.title;
    meta.cover = options.cover ?? info.cover?.trim();
    meta.tags = info.tags;
    meta.summary = info.summary;
    meta.author = info.author;
    url = new URL(String(info.firstPage), url);
  }

  const chapters = await collectChapters(next, url.href, options.sleepSec ?? ctx.sleepSec);
  const folder = join(outdir, removeIllegalPath(meta.title));
  await ensureDir(folder);
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const cbz = await buildCbz(fetcher, chapter, meta);
    await Deno.writeFile(join(folder, `${String(i + 1).padStart(3, "0")}_${removeIllegalPath(chapter.title)}.cbz`), cbz);
  }
  if (meta.cover) await downloadCover(fetcher, meta.cover, folder);
  return folder;
}

async function collectChapters(
  next: (url: string) => AsyncGenerator<string, [string, string], string>,
  startUrl: string,
  sleepSec: number,
): Promise<Chapter[]> {
  const chapters: Chapter[] = [];
  let url = startUrl;
  let previousTitle = "";
  let currentImages: string[] = [];
  const visited = new Set<string>();
  while (url) {
    if (visited.has(url)) throw new Error(`Comic adapter entered a URL loop at ${url}`);
    visited.add(url);
    const iter = next(url);
    let title = "";
    let nextUrl = "";
    while (true) {
      const item = await iter.next();
      if (item.done) {
        [title, nextUrl] = item.value;
        break;
      }
      if (item.value) currentImages.push(item.value);
    }
    if (!similarTitle(previousTitle, title, false) && currentImages.length > 0) {
      chapters.push({ title: title || `chapter-${chapters.length + 1}`, images: currentImages });
      currentImages = [];
    }
    previousTitle = title;
    url = nextUrl;
    if (sleepSec > 0) await new Promise((resolve) => setTimeout(resolve, sleepSec * 1000 * Math.random()));
  }
  if (currentImages.length > 0) chapters.push({ title: previousTitle || `chapter-${chapters.length + 1}`, images: currentImages });
  return chapters;
}

async function buildCbz(fetcher: SiteFetcher, chapter: Chapter, meta: ComicMeta): Promise<Uint8Array> {
  const images = [];
  for (let i = 0; i < chapter.images.length; i++) {
    const imageUrl = chapter.images[i];
    const response = await fetcher(imageUrl);
    const ext = imageExtension(imageUrl);
    images.push({
      name: `${String(i + 1).padStart(3, "0")}.${ext}`,
      data: new Uint8Array(await response.arrayBuffer()),
      lastModification: new Date(),
    });
  }
  images.push({
    name: "ComicInfo.xml",
    data: new TextEncoder().encode(comicInfoXml(chapter, meta)),
    lastModification: new Date(),
  });
  return await create(images);
}

async function downloadCover(fetcher: SiteFetcher, cover: string, folder: string): Promise<void> {
  try {
    const response = await fetcher(cover);
    const ext = imageExtension(cover);
    await Deno.writeFile(join(folder, `cover.${ext}`), new Uint8Array(await response.arrayBuffer()));
  } catch {
    // Cover is optional.
  }
}

function createSiteFetcher(ctx: RuntimeContext, custom: unknown): SiteFetcher {
  if (typeof custom !== "function") {
    return (input, options) => fetchWithContext(ctx, input, options);
  }
  const handler = custom as (input: string | URL, options?: RequestInit) => Promise<Response | undefined>;
  return async (input, options) => {
    const url = input instanceof Request ? new URL(input.url) : input;
    const response = await handler(url, options);
    if (!response) throw new Error(`Comic image request failed: ${String(url)}`);
    return response;
  };
}

function imageExtension(input: string): string {
  try {
    const ext = new URL(input).pathname.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext === "jpeg" ? "jpg" : ext;
  } catch {
    // Fall back to a common image extension for malformed adapter output.
  }
  return "jpg";
}

function comicInfoXml(chapter: Chapter, meta: ComicMeta): string {
  return `
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Title>${xmlEncode(chapter.title)}</Title>
  <Series>${xmlEncode(meta.title)}</Series>
  <Web>${xmlEncode(meta.originSite)}</Web>
  <Author>${xmlEncode(meta.author ?? "unknown")}</Author>
  <PageCount>${chapter.images.length}</PageCount>
  <Tags>${xmlEncode(meta.tags?.join(", ") ?? "漫画")}</Tags>
  <LanguageISO>zh</LanguageISO>
  <Manga>Yes</Manga>
</ComicInfo>`.trim();
}

function xmlEncode(input: string): string {
  return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}
