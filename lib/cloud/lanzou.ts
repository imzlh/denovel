import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { basename, dirname, join } from "jsr:@std/path";
import { Document, DOMParser } from "jsr:@b-fuze/deno-dom";
import type { RuntimeContext } from "../core/context.ts";
import { fetchWithContext, type FetchOptions } from "../core/fetch.ts";
import { exists, removeIllegalPath } from "../core/fs.ts";

export interface LanzouFile {
  icon: string;
  t: number;
  id: string;
  name_all: string;
  size: string;
  time: string;
  duan: string;
  p_ico: number;
  _link: string;
  _path: string;
}

export interface LanzouOptions {
  outputDir: string;
  concurrency?: number;
  logger?: Pick<Console, "log" | "warn" | "error">;
}

const DEFAULT_CONCURRENCY = 8;

export async function listLanzouFiles(ctx: RuntimeContext, page: string, logger: Pick<Console, "log" | "warn" | "error"> = console): Promise<LanzouFile[]> {
  const files: LanzouFile[] = [];
  await collectFiles(ctx, page, "", files, logger);
  return files;
}

export async function downloadLanzou(ctx: RuntimeContext, page: string, options: LanzouOptions): Promise<{ files: number; bytes: number }> {
  const logger = options.logger ?? console;
  const files = await listLanzouFiles(ctx, page, logger);
  await ensureDir(options.outputDir);
  let bytes = 0;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  for (let i = 0; i < files.length; i += concurrency) {
    await Promise.all(files.slice(i, i + concurrency).map(async (file) => {
      bytes += await downloadOne(ctx, file, options.outputDir, logger);
    }));
  }
  return { files: files.length, bytes };
}

async function collectFiles(
  ctx: RuntimeContext,
  page: string,
  parentPath: string,
  files: LanzouFile[],
  logger: Pick<Console, "log" | "warn" | "error">,
): Promise<LanzouFile[]> {
  const doc = await fetchLanzou(ctx, page, {}, "document") as Document;
  const script = doc.getElementsByTagName("script").find((item) => item.innerHTML.includes("$.ajax"));
  if (!script) throw new Error("Cannot find Lanzou file list script");

  const data = extractFunctionByName(script.innerHTML, "file");
  if (!data) throw new Error("Cannot extract Lanzou file list function");
  const ajax = sandboxEval(data, script.innerHTML);
  const formData = objectToFormData(ajax.data);

  let pageNumber = 1;
  let lastCount = 50;
  while (lastCount === 50) {
    formData.set("pg", pageNumber.toString());
    const list = await fetchLanzou(ctx, new URL(ajax.url, page), {
      method: "POST",
      body: formData,
    }, "json") as { info: string; text: LanzouFile[] };
    if (list.info !== "sucess") {
      if (typeof list.info === "string" && list.info.includes("重试")) {
        logger.warn(`Lanzou page ${pageNumber} is rate-limited, retrying`);
        await sleep(1.2);
        continue;
      }
      logger.warn(`Failed to list Lanzou page ${pageNumber}: ${list.info}`);
      break;
    }
    lastCount = list.text.length;
    files.push(...list.text.map((file) => ({
      ...file,
      _link: new URL("/" + file.id, page).href,
      _path: parentPath + "/" + removeIllegalPath(file.name_all),
    })));
    pageNumber++;
    await sleep(0.8);
  }

  for (const dirElement of doc.querySelectorAll("#folder a")) {
    try {
      dirElement.querySelector("div.filesize")?.remove();
      const dirUrl = new URL(dirElement.getAttribute("href")!, page);
      logger.log(`Lanzou folder: ${dirUrl.href}`);
      await collectFiles(ctx, dirUrl.href, parentPath + "/" + removeIllegalPath(dirElement.textContent), files, logger);
      await sleep(0.5);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
    }
  }

  return files;
}

async function downloadOne(
  ctx: RuntimeContext,
  file: LanzouFile,
  outputDir: string,
  logger: Pick<Console, "log" | "warn" | "error">,
): Promise<number> {
  const outputPath = join(outputDir, file._path);
  if (await exists(outputPath)) {
    logger.log(`skip existing ${file._path}`);
    return 0;
  }
  await ensureDir(join(outputDir, dirname(file._path)));
  let response: Response | undefined;
  do {
    if (response) logger.warn(`retry ${basename(file._path)}`);
    response = await resolveDownload(ctx, file._link);
  } while (!response.ok);
  if (!response.body) throw new Error(`Download failed: ${file._path}`);
  await Deno.writeFile(outputPath, response.body);
  const size = parseFileSize(file.size);
  logger.log(`downloaded ${file._path}`);
  return size;
}

async function resolveDownload(ctx: RuntimeContext, docUrl: string): Promise<Response> {
  const document1 = await getDocument(ctx, docUrl);
  for (const iframe of document1.getElementsByTagName("iframe")) {
    await sleep(0.5);
    const iframeUrl = new URL(iframe.getAttribute("src")!, docUrl);
    const document = await getDocument(ctx, iframeUrl.href);
    const code = document.getElementsByTagName("script").at(-1)!.innerHTML;
    const ajax = sandboxEval(code, code);
    const file = await fetchLanzou(ctx, new URL(ajax.url, docUrl), {
      body: objectToFormData(ajax.data),
      method: "POST",
      referrer: iframeUrl.href,
      headers: {
        Origin: iframeUrl.origin,
        "X-Requested-With": "XMLHttpRequest",
      },
    }, "json") as { zt: number; name: string; dom: string; url: string };
    if (file.zt !== 1) throw new Error(`Download ${file.name} failed: link timeout`);
    await sleep(0.5);
    return await fetchLanzou(ctx, new URL(file.dom + "/file/" + file.url, docUrl), {}, "binary") as Response;
  }
  throw new Error(`Download ${docUrl} failed: no iframe link`);
}

async function fetchLanzou(
  ctx: RuntimeContext,
  urlRaw: URL | string,
  fetchOptions: FetchOptions = {},
  expect: "document" | "binary" | "json" = "json",
): Promise<Response | Document | unknown> {
  const url = new URL(urlRaw);
  let response = await fetchWithContext(ctx, url, fetchOptions);
  while (true) {
    let document: Document;
    if (expect === "binary") {
      if (!response.headers.get("Content-Type")?.startsWith("text/html")) return response;
      document = new DOMParser().parseFromString(await response.text(), "text/html");
    } else {
      const text = await response.text();
      document = new DOMParser().parseFromString(text, "text/html");
      if (document.body.innerText.trim()) {
        return expect === "json" ? JSON.parse(text) : document;
      }
    }

    const script = document.getElementsByTagName("script").at(-1);
    if (!script) throw new Error(`Unexpected Lanzou response: ${url.href}`);
    if (script.innerHTML.includes("acw_sc")) {
      await setCookieEval(ctx, script.innerHTML, url.href);
      response = await fetchWithContext(ctx, url, fetchOptions);
      continue;
    }

    const func = extractFunctionByName(script.innerHTML, "down_r");
    if (!func) throw new Error("Cannot extract Lanzou down_r function");
    const ajax = sandboxEval(func, "var el = 2;\n" + script.innerHTML);
    await sleep(1.2);
    const file = await fetchWithContext(ctx, new URL(ajax.url, url), {
      body: objectToFormData(ajax.data),
      method: "POST",
      referrer: url.href,
      headers: {
        Origin: url.origin,
        "X-Requested-With": "XMLHttpRequest",
      },
    }).then((item) => item.json());
    if (file.zt !== 1) throw new Error("Lanzou verification timeout");
    await sleep(0.8);
    return await fetchWithContext(ctx, new URL(file.url, url));
  }
}

async function getDocument(ctx: RuntimeContext, url: string | URL): Promise<Document> {
  return await fetchLanzou(ctx, url, {}, "document") as Document;
}

function extractFunctionByName(source: string, functionName: string): string | null {
  const startIndex = source.indexOf(`function ${functionName}(`);
  if (startIndex === -1) return null;
  let braceCount = 0;
  let position = startIndex;
  let inString: "'" | '"' | "`" | null = null;
  let inComment: "//" | "/*" | null = null;
  while (position < source.length) {
    const char = source[position];
    const next = source[position + 1];
    if (!inString && !inComment && char === "/" && next === "/") {
      inComment = "//";
      position += 2;
      continue;
    }
    if (!inString && !inComment && char === "/" && next === "*") {
      inComment = "/*";
      position += 2;
      continue;
    }
    if (inComment === "//" && char === "\n") inComment = null;
    if (inComment === "/*" && char === "*" && next === "/") {
      inComment = null;
      position += 2;
      continue;
    }
    if (!inComment && (char === "\"" || char === "'" || char === "`")) {
      if (inString === char && source[position - 1] !== "\\") inString = null;
      else if (!inString) inString = char;
    }
    if (!inString && !inComment && char === "{") {
      braceCount++;
      position++;
      break;
    }
    position++;
  }
  const codeStart = position;
  let codeEnd = codeStart;
  while (position < source.length && braceCount > 0) {
    const char = source[position];
    const next = source[position + 1];
    if (!inString && !inComment && char === "/" && next === "/") {
      inComment = "//";
      position += 2;
      continue;
    }
    if (!inString && !inComment && char === "/" && next === "*") {
      inComment = "/*";
      position += 2;
      continue;
    }
    if (inComment === "//" && char === "\n") inComment = null;
    if (inComment === "/*" && char === "*" && next === "/") {
      inComment = null;
      position += 2;
      continue;
    }
    if (!inComment && char === "\\" && inString) {
      position += 2;
      continue;
    }
    if (!inComment && (char === "\"" || char === "'" || char === "`") && (!inString || inString === char)) {
      inString = inString ? null : char;
    }
    if (!inString && !inComment) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
    }
    codeEnd = position;
    position++;
  }
  return braceCount === 0 ? source.slice(codeStart, codeEnd).trim() : null;
}

function sandboxEval(code: string, predef: string): { url: string; data: Record<string, unknown> } {
  const env = "let res; const $ = { ajax: d => res = d };";
  let definitions = "";
  for (const line of predef.split("\n")) {
    if (!line.trim()) continue;
    if (line.trimStart().match(/\(.+\)/)) break;
    definitions += line + "\n";
  }
  const ajaxIndex = code.indexOf("$.ajax(");
  if (ajaxIndex !== -1) code = code.substring(ajaxIndex);
  return new Function(env + "\n" + definitions + "\n" + code + "\nreturn res;")();
}

async function setCookieEval(ctx: RuntimeContext, script: string, site: string): Promise<void> {
  const document = new Document();
  const cookieHost = new URL(site).hostname.split(".").slice(-2).join(".");
  let rawCookie = await ctx.cookies.getCookieHeader(cookieHost);
  Object.defineProperty(document, "cookie", {
    get: () => rawCookie,
    set: (value) => {
      rawCookie = rawCookie ? `${rawCookie}; ${value}` : value;
    },
  });
  const url = new URL(site);
  Object.defineProperty(url, "reload", { value: () => undefined });
  Object.defineProperty(document, "location", { value: url });
  new Function("window", "document", "location", script)({ document, location: url, atob, btoa }, document, url);
  await ctx.cookies.setRawCookie(cookieHost, rawCookie);
  if (!await ctx.cookies.getCookie(cookieHost, "acw_sc__v2")) throw new Error("failed to set Lanzou cookie");
}

function objectToFormData(data: Record<string, unknown>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) formData.append(key, String(value));
  return formData;
}

export function parseFileSize(sizeStr: string): number {
  const units: Record<string, number> = { B: 1, K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };
  const match = sizeStr.match(/^([\d.]+)\s*([BKMGT])?/i);
  if (!match) return 0;
  return Number.parseFloat(match[1]) * (units[match[2]?.toUpperCase() || "B"] || 1);
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
