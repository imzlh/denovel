import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { join } from "jsr:@std/path";
import type { RuntimeContext } from "../core/context.ts";
import { fetchWithContext } from "../core/fetch.ts";
import { getDocumentWithContext } from "../core/html.ts";
import { removeIllegalPath } from "../core/fs.ts";

const ENTRY_LINK = "https://17c.com";
const APP_ENTRY_LINK = "https://www.17capp2.com:6688/100.html";
const SEARCH_PATH = "/search/0.html?keyword={search}&page={page}";

const DECODE_MAPPER: Record<string, string> = {
  e: "P",
  w: "D",
  T: "y",
  "+": "J",
  l: "!",
  t: "L",
  E: "E",
  "@": "2",
  d: "a",
  b: "%",
  q: "l",
  X: "v",
  "~": "R",
  "\x05": "r",
  "&": "X",
  C: "j",
  "]": "F",
  a: ")",
  "^": "m",
  ",": "~",
  "}": "1",
  x: "C",
  c: "(",
  G: "@",
  h: "h",
  ".": "*",
  L: "s",
  "=": ",",
  p: "g",
  I: "Q",
  "\x01": "7",
  _: "u",
  K: "6",
  F: "t",
  "\x02": "n",
  "\x08": "=",
  k: "G",
  Z: "]",
  ")": "b",
  P: "}",
  B: "U",
  S: "k",
  "\x06": "i",
  g: ":",
  N: "N",
  i: "S",
  "%": "+",
  "-": "Y",
  "?": "|",
  "\x04": "z",
  "*": "-",
  "\x03": "^",
  "[": "{",
  "(": "c",
  u: "B",
  y: "M",
  U: "Z",
  H: "[",
  z: "K",
  "\x09": "H",
  "\x07": "f",
  R: "x",
  v: "&",
  "!": ";",
  M: "_",
  Q: "9",
  Y: "e",
  o: "4",
  r: "A",
  m: ".",
  O: "o",
  V: "W",
  J: "p",
  f: "d",
  ":": "q",
  "{": "8",
  W: "I",
  j: "?",
  n: "5",
  s: "3",
  "|": "T",
  A: "V",
  D: "w",
  ";": "O",
};

export interface SeventeenSession {
  baseUrl: URL;
  rawHost: string;
}

export interface SeventeenVideo {
  id: string;
  title: string;
  m3u8: string;
  thumbnail: string;
}

export async function createSeventeenSession(ctx: RuntimeContext, baseOverride?: string): Promise<SeventeenSession> {
  if (baseOverride) {
    const baseUrl = new URL(baseOverride);
    return { baseUrl, rawHost: baseUrl.hostname };
  }

  try {
    const doc = await getDocumentWithContext(ctx, APP_ENTRY_LINK);
    const addr = doc.querySelector("iframe[src]")?.getAttribute("src");
    if (addr) {
      const baseUrl = new URL(addr, APP_ENTRY_LINK);
      await fetchWithContext(ctx, baseUrl, { maxRetries: 3, timeoutSec: 2, ignoreStatus: true });
      return { baseUrl, rawHost: baseUrl.hostname };
    }
  } catch {
    // Fall through to redirect chain.
  }

  const addr0 = await handleRedirect((await getDocumentWithContext(ctx, ENTRY_LINK)).getElementsByTagName("script")[0].innerHTML);
  const addr1 = (await getDocumentWithContext(ctx, addr0)).querySelector("a[href]")?.getAttribute("href");
  if (!addr1) throw new Error("Cannot resolve 17c app link");
  const addr2 = (await getDocumentWithContext(ctx, addr1)).querySelector("body > div:nth-child(2) > div > b:nth-child(2)")?.innerHTML;
  if (!addr2) throw new Error("Cannot resolve 17c redirect page");
  const script = (await getDocumentWithContext(ctx, addr2)).querySelector("script")?.innerHTML;
  if (!script) throw new Error("Cannot resolve 17c final redirect script");
  const baseUrl = new URL(await handleRedirect(script));
  try {
    await fetchWithContext(ctx, baseUrl, { maxRetries: 3, timeoutSec: 2, ignoreStatus: true });
  } catch {
    baseUrl.hostname = (await Deno.resolveDns(baseUrl.hostname, "A"))[0];
  }
  return { baseUrl, rawHost: baseUrl.hostname };
}

export async function listSeventeenVideos(
  ctx: RuntimeContext,
  session: SeventeenSession,
  page: string | URL = session.baseUrl,
): Promise<{ videos: URL[]; totalPages: number }> {
  const doc = await getDocumentWithContext(ctx, page, {
    additionalHeaders: { host: session.rawHost },
    ignoreStatus: true,
  });
  const total = doc.querySelector("body > div.content-box > div > div > div.ran-box > div.pagination-box > ul > li:last-child > div")
    ?.textContent.split("/")[1]?.trim();
  const videos = Array.from(doc.querySelectorAll("div.content-box div.ran-box div a[href]"))
    .filter((element) => element.getAttribute("target") !== "_blank" && element.getAttribute("href")?.includes("videoplay"))
    .map((element) => new URL(element.getAttribute("href")!, page));
  return { videos, totalPages: total ? Number.parseInt(total, 10) : 1 };
}

export async function searchSeventeen(
  ctx: RuntimeContext,
  session: SeventeenSession,
  keywords: string,
  page = "0",
): Promise<{ videos: URL[]; totalPages: number }> {
  const url = new URL(SEARCH_PATH.replace("{search}", encodeURIComponent(keywords)).replace("{page}", page), session.baseUrl);
  return await listSeventeenVideos(ctx, session, url);
}

export async function getSeventeenVideoInfo(ctx: RuntimeContext, session: SeventeenSession, play: string | URL): Promise<SeventeenVideo> {
  const document = await getDocumentWithContext(ctx, play, {
    additionalHeaders: { Host: session.rawHost },
    ignoreStatus: true,
  });
  const script = document.getElementsByTagName("script")
    .filter((item) => item.innerHTML.includes("m3u8") && item.innerHTML.includes("getFileIds()"))[0]?.innerText;
  if (!script) throw new Error("Cannot find video script");
  const sl = script.match(/sl\s*:\s*"(.+)"/)?.[1];
  const encryptUrl = script.match(/encryptUrl\s*:\s*"(.+)"\s*/)?.[1];
  if (!sl || !encryptUrl) throw new Error("Cannot parse video m3u8 metadata");
  const url = new URL(play);
  const id = url.searchParams.get("vid") ?? url.pathname.split("/").filter(Boolean).at(-1) ?? crypto.randomUUID();
  return {
    id,
    title: document.querySelector("body > div.content-box > div:nth-child(1) > div.ran-box > div.video-title")?.textContent.trim() || id,
    m3u8: decodeURIComponent(sl.split("").map((char) => DECODE_MAPPER[char] ?? char).join("")).trim(),
    thumbnail: new URL(encryptUrl, play).href,
  };
}

export async function downloadSeventeenVideo(
  ctx: RuntimeContext,
  session: SeventeenSession,
  play: string | URL,
  outputDir: string,
  options: { force?: boolean } = {},
): Promise<string> {
  const info = await getSeventeenVideoInfo(ctx, session, play);
  if (!options.force && await hasSeventeenHistory(ctx, info.m3u8)) {
    throw new Error(`Already downloaded: ${info.title}`);
  }
  await ensureDir(outputDir);
  const outputPath = join(outputDir, `${removeIllegalPath(info.title)}.mp4`);
  await runFfmpeg(["-n", "-i", info.m3u8, "-c:a", "copy", "-c:v", "copy", outputPath]);
  await markSeventeenHistory(ctx, info.m3u8);
  return outputPath;
}

export function decodeSeventeenImage(input: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) output[i] = input[i] ^ 0x88;
  return output;
}

export function createSeventeenApiHandler(ctx: RuntimeContext, session: SeventeenSession, outputDir: string): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/search") {
        const q = url.searchParams.get("q");
        if (!q) return json({ error: "missing q" }, 400);
        const page = url.searchParams.get("p") ?? "1";
        const result = await searchSeventeen(ctx, session, q, page);
        const videos = await Promise.all(result.videos.map((video) => getSeventeenVideoInfo(ctx, session, video)));
        return json({ videos, total: videos.length, totalPages: result.totalPages, currentPage: Number.parseInt(page, 10) });
      }
      if (url.pathname === "/api/videos") {
        const result = await listSeventeenVideos(ctx, session);
        const videos = await Promise.all(result.videos.map((video) => getSeventeenVideoInfo(ctx, session, video)));
        return json({ videos, total: videos.length, totalPages: result.totalPages, currentPage: 1 });
      }
      if (url.pathname === "/api/thumb") {
        const src = url.searchParams.get("src");
        if (!src) return json({ error: "missing src" }, 400);
        const data = decodeSeventeenImage(await (await fetchWithContext(ctx, decodeURIComponent(src))).bytes());
        return new Response(data.buffer as ArrayBuffer, {
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000" },
        });
      }
      if (url.pathname === "/api/download") {
        const src = url.searchParams.get("src");
        if (!src) return json({ error: "missing src" }, 400);
        const output = await downloadSeventeenVideo(ctx, session, decodeURIComponent(src), outputDir);
        return json({ output });
      }
      return new Response(simplePage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  };
}

async function hasSeventeenHistory(ctx: RuntimeContext, m3u8: string): Promise<boolean> {
  return (await ctx.state.kv.get(["history", "17c", await digest(m3u8)])).value !== null;
}

async function markSeventeenHistory(ctx: RuntimeContext, m3u8: string): Promise<void> {
  await ctx.state.kv.set(["history", "17c", await digest(m3u8)], { url: m3u8, updatedAt: Date.now() });
}

async function digest(input: string): Promise<string> {
  const data = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(data)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function handleRedirect(code: string): Promise<string> {
  let resolve!: (value: string) => void;
  const location = {
    set href(value: string) {
      resolve(value);
    },
    replace(value: string) {
      resolve(value);
    },
  };
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  new Function("window", "location", code)({ location }, location);
  return promise;
}

async function runFfmpeg(args: string[]): Promise<void> {
  const status = await new Deno.Command("ffmpeg", { args, stdout: "inherit", stderr: "inherit", stdin: "null" }).output();
  if (!status.success) throw new Error("ffmpeg failed");
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function simplePage(): string {
  return `<!DOCTYPE html>
<html>
<head><title>17c v2</title></head>
<body>
  <h1>17c v2</h1>
  <ul>
    <li><a href="/api/videos">/api/videos</a></li>
    <li>/api/search?q=keyword</li>
    <li>/api/thumb?src=url</li>
  </ul>
</body>
</html>`;
}
