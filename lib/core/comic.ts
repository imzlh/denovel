import { create } from "jsr:@quentinadam/zip";
import { ensureDir } from "jsr:@std/fs";
import { join } from "jsr:@std/path";
import type { RuntimeContext } from "./context.ts";
import { fetchWithContext, type FetchOptions } from "./fetch.ts";
import { removeIllegalPath } from "./fs.ts";
import { setDefaultRuntimeContext } from "./runtime_api.ts";
import { ComicSiteRegistry } from "./site_registry.ts";
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
  const outdir = options.outdir ?? ctx.outputDir;
  await ensureDir(outdir);
  let url = new URL(startUrl);
  const originSite = await comicSiteRegistry.resolve(url.hostname);
  const mod = await comicSiteRegistry.load(originSite);
  if (typeof mod.default !== "function") throw new Error(`Comic adapter has no default downloader: ${originSite}`);
  const next = mod.default as (url: string) => AsyncGenerator<string, [string, string | undefined] | undefined, string>;
  const fetcher = createSiteFetcher(ctx, mod.networkHandler);
  const meta: ComicMeta = {
    title: nonEmpty(options.name) ?? new Date().toISOString(),
    cover: nonEmpty(options.cover),
    originSite,
  };

  if (typeof mod.getInfo === "function") {
    const info = await mod.getInfo(url) as ComicMainInfo | null | undefined;
    if (info) {
      meta.title = nonEmpty(options.name) ?? nonEmpty(info.title) ?? meta.title;
      meta.cover = nonEmpty(options.cover) ?? nonEmpty(info.cover);
      meta.tags = info.tags;
      meta.summary = info.summary;
      meta.author = info.author;
      if (info.firstPage) url = new URL(String(info.firstPage), url);
    }
  }

  const folder = join(outdir, removeIllegalPath(meta.title));
  await ensureDir(folder);
  const sleepSec = Math.max(0, options.sleepSec ?? ctx.sleepSec);
  let chapterCount = 0;
  for await (const chapter of collectChapters(next, url.href, sleepSec)) {
    chapterCount++;
    const cbz = await buildCbz(fetcher, chapter, meta, options.noMulti === true);
    const title = removeIllegalPath(chapter.title) || `chapter-${chapterCount}`;
    await Deno.writeFile(join(folder, `${String(chapterCount).padStart(3, "0")}_${title}.cbz`), cbz);
  }
  if (chapterCount === 0) throw new Error(`Comic adapter returned no images for ${startUrl}`);
  if (meta.cover) await downloadCover(fetcher, meta.cover, folder);
  return folder;
}

async function* collectChapters(
  next: (url: string) => AsyncGenerator<string, [string, string | undefined] | undefined, string>,
  startUrl: string,
  sleepSec: number,
): AsyncGenerator<Chapter> {
  let url = startUrl;
  const visited = new Set<string>();
  while (url) {
    if (visited.has(url)) throw new Error(`Comic adapter entered a URL loop at ${url}`);
    visited.add(url);
    const pageUrl = url;
    const iter = next(pageUrl);
    const pageImages: string[] = [];
    let title = "";
    let nextUrl = "";
    while (true) {
      const item = await iter.next();
      if (item.done) {
        const result = item.value ?? ["", ""];
        title = String(result[0] ?? "").trim();
        const rawNext = result[1] == null ? "" : String(result[1]).trim();
        nextUrl = rawNext ? new URL(rawNext, pageUrl).href : "";
        break;
      }
      if (typeof item.value === "string" && item.value.trim()) {
        pageImages.push(new URL(item.value, pageUrl).href);
      }
    }
    // An adapter invocation represents one chapter. Adapters that paginate
    // a chapter already yield all pages before returning its next URL.
    if (pageImages.length > 0) {
      yield { title: title || "", images: pageImages };
    }
    url = nextUrl ? new URL(nextUrl, pageUrl).href : "";
    if (sleepSec > 0) await new Promise((resolve) => setTimeout(resolve, sleepSec * 1000 * Math.random()));
  }
}

async function buildCbz(
  fetcher: SiteFetcher,
  chapter: Chapter,
  meta: ComicMeta,
  noMulti: boolean,
): Promise<Uint8Array> {
  const downloaded = new Array<Uint8Array<ArrayBuffer>>(chapter.images.length);
  const workerCount = noMulti ? 1 : Math.min(8, Math.max(1, chapter.images.length));
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= chapter.images.length) return;
      const imageUrl = chapter.images[index];
      const response = await fetcher(imageUrl);
      if (!response.ok) {
        throw new Error(`Comic image request failed (HTTP ${response.status}): ${imageUrl}`);
      }
      downloaded[index] = new Uint8Array(await response.arrayBuffer());
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const images = chapter.images.map((imageUrl, index) => ({
    name: `${String(index + 1).padStart(3, "0")}.${imageExtension(imageUrl)}`,
    data: downloaded[index],
    lastModification: new Date(),
  }));
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
    if (!response.ok) throw new Error(`Cover request failed (HTTP ${response.status})`);
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
  const handler = custom as (input: string | URL | Request, options?: RequestInit) => Promise<Response | undefined>;
  return async (input, options) => {
    // Preserve the Request object for adapters that inspect its method/body,
    // while still accepting the older URL-only networkHandler signature.
    const requestInput = input instanceof Request ? input.clone() : input;
    const response = await handler(requestInput, options);
    const url = input instanceof Request ? input.url : String(input);
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
  <Summary>${xmlEncode(meta.summary ?? "")}</Summary>
  <PageCount>${chapter.images.length}</PageCount>
  <Tags>${xmlEncode(meta.tags?.join(", ") ?? "漫画")}</Tags>
  <LanguageISO>zh</LanguageISO>
  <Manga>Yes</Manga>
</ComicInfo>`.trim();
}

function xmlEncode(input: string): string {
  return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}


function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
