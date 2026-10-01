import { basename, extname, join } from "jsr:@std/path";
import type { RuntimeContext } from "./context.ts";
import { exists } from "./fs.ts";
import { fetchWithContext } from "./fetch.ts";
import { checkIsTraditional, downloadNovel, inspectNovel, type NovelInspection } from "./novel.ts";
import { Status } from "./status.ts";
import { txtToEpub } from "../epub/txt.ts";

type Handler = (req: Request, url: URL) => Promise<Response> | Response;

export interface ServerOptions {
  port?: number;
}

interface DownloadStartMessage {
  novelName?: string;
  coverUrl?: string;
  options?: {
    toEpub?: boolean;
    translate?: boolean;
    autoPart?: boolean;
    jpFormat?: boolean;
    mergeShort?: boolean;
  };
}

const STATIC_ROOT = new URL("../../src/assets/static/", import.meta.url);

export function serveDenovel(ctx: RuntimeContext, options: ServerOptions = {}): Deno.HttpServer<Deno.NetAddr> {
  const routes: Record<string, Record<string, Handler>> = {
    "/api/settings": {
      GET: async () => json(await ctx.settings.getServerSettings()),
      POST: async (req) => {
        await ctx.settings.setServerSettings(await req.json());
        return json({ success: true });
      },
    },
    "/api/check-url": {
      POST: async (req) => handleCheckUrl(ctx, req),
    },
    "/api/push-download": {
      GET: async (_req, url) => {
        const target = url.searchParams.get("url");
        if (!target) return text("Missing url", 400);
        await ctx.queue.pushDownload(target);
        return text("OK");
      },
    },
    "/api/poll-queue": {
      GET: async () => json(await ctx.queue.listDownloads()),
    },
    "/api/clear-queue": {
      GET: async () => {
        await ctx.queue.clearDownloads();
        return new Response(null, { status: 204 });
      },
    },
    "/api/download": {
      GET: (req, url) =>
        req.headers.get("upgrade") === "websocket"
          ? handleDownloadWebSocket(ctx, req, url)
          : handleBookDownload(ctx, url),
    },
    "/api/bookshelf": {
      GET: () => handleBookshelf(ctx),
    },
    "/content": {
      GET: (_req, url) => handleContent(ctx, url),
    },
    "/utils/batch": {
      GET: () => serveStatic("batch.html"),
    },
    "/": {
      GET: () => serveStatic("server.html"),
    },
  };

  return Deno.serve({ port: options.port ?? 7383 }, (req) => {
    const url = new URL(req.url);
    const handler = routes[url.pathname]?.[req.method];
    if (handler) return handler(req, url);
    if (req.method === "GET") return serveStaticPath(url.pathname);
    return text("Not found", 404);
  });
}

async function handleCheckUrl(ctx: RuntimeContext, req: Request): Promise<Response> {
  try {
    const { url } = await req.json() as { url?: string };
    if (!url) return text("Missing url", 400);
    const info = await cachedInspection(ctx, new URL(url));
    return json({
      needsInfo: info.isChapterPage || !info.title,
      suggestedName: info.title ?? "",
      suggestedCover: info.cover ?? "",
      info,
    });
  } catch (error) {
    return text(error instanceof Error ? error.message : String(error), 400);
  }
}

async function handleContent(ctx: RuntimeContext, url: URL): Promise<Response> {
  const raw = url.searchParams.get("url");
  if (!raw) return await serveStatic("contentapi.html");

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return text("无效的URL: 在参数 'url'", 400);
  }

  try {
    const info = await cachedInspection(ctx, target);
    if (url.searchParams.has("json")) return json(info, 200, 2);

    const { processTXTContent } = await import("../epub/txt.ts");
    const pageInfo: Record<string, unknown> = { ...info };
    if (typeof pageInfo.content === "string") {
      pageInfo.content = processTXTContent(pageInfo.content, Boolean(pageInfo.jpStyle));
    }
    if (typeof pageInfo.summary === "string") {
      pageInfo.summary = processTXTContent(pageInfo.summary);
    }
    const template = await Deno.readTextFile(new URL("chapter.html.ejs", STATIC_ROOT));
    return html(renderTemplate(template, pageInfo), {
      "X-Powered-By": "@imzlh/denovel",
    });
  } catch (error) {
    return text(error instanceof Error ? error.message : String(error), 404);
  }
}

async function handleBookshelf(ctx: RuntimeContext): Promise<Response> {
  const settings = await ctx.settings.getServerSettings();
  const books: string[] = [];
  try {
    for await (const entry of Deno.readDir(settings.outputDir)) {
      if (entry.isFile && entry.name.toLowerCase().endsWith(".epub")) books.push(entry.name);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const template = await Deno.readTextFile(new URL("books.html.ejs", STATIC_ROOT));
  return html(renderTemplate(template, { books: books.toSorted() }));
}

async function handleBookDownload(ctx: RuntimeContext, url: URL): Promise<Response> {
  const name = url.searchParams.get("name");
  if (!name) return text("缺少参数 'name'", 400);
  if (name.includes("/") || name.includes("\\")) return text("无效文件名", 400);

  const settings = await ctx.settings.getServerSettings();
  const path = join(settings.outputDir, name);
  if (!await exists(path)) return text("文件不存在", 404);
  return new Response(await Deno.readFile(path), {
    headers: {
      "Content-Type": extname(name).toLowerCase() === ".epub" ? "application/epub+zip" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURI(name)}"`,
    },
  });
}

function handleDownloadWebSocket(ctx: RuntimeContext, req: Request, url: URL): Response {
  const target = url.searchParams.get("url");
  if (!target) return text("Missing url", 400);
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onmessage = (event) => {
    const start = parseStartMessage(event.data);
    runDownload(ctx, socket, target, start).catch((error) => {
      send(socket, {
        status: "ERROR",
        log: error instanceof Error ? error.message : String(error),
      });
      socket.close(1011);
    });
  };

  return response;
}

async function runDownload(
  ctx: RuntimeContext,
  socket: WebSocket,
  target: string,
  start: DownloadStartMessage,
): Promise<void> {
  const settings = await ctx.settings.getServerSettings();
  const targetUrl = new URL(target);
  const info = await cachedInspection(ctx, targetUrl).catch(() => undefined);
  if (info) {
    send(socket, {
      status: "sync",
      info: {
        book_name: info.title,
        cover: info.cover,
        author: info.author,
        summary: info.summary,
        firstPage: info.startOfContent,
        jpStyle: info.jpStyle,
      },
    });
  }
  const traditional = await checkIsTraditional(targetUrl);
  const output = await downloadNovel(ctx, target, {
    traditional,
    bookName: nonEmpty(start.novelName) ?? info?.title,
    cover: nonEmpty(start.coverUrl) ?? info?.cover,
    outdir: settings.outputDir,
    translate: !!start.options?.translate,
    disableParted: start.options?.autoPart === false,
    sleepTime: settings.delay / 1000,
    disableOverwrite: !settings.overwrite,
    reporter: (status, message, error) => {
      send(socket, {
        status: Status[status],
        log: error ? `${message}: ${error.message}` : message,
      });
    },
  });

  let finalOutput = output;
  if (output && start.options?.toEpub) {
    const epubOutput = output.replace(/\.txt$/i, ".epub");
    const ok = await txtToEpub(await Deno.readTextFile(output), output, epubOutput, {
      jpFormat: !!start.options.jpFormat,
      merge: !!start.options.mergeShort,
      networkHandler(input, init) {
        if (input instanceof Request) return fetchWithContext(ctx, input, init);
        return fetchWithContext(ctx, input instanceof URL ? input : new URL(String(input)), init);
      },
      reporter: (status, message) => {
        send(socket, {
          status: Status[status],
          log: message,
        });
      },
    });
    if (ok) finalOutput = epubOutput;
  }

  send(socket, {
    status: finalOutput ? "DONE" : "ERROR",
    log: finalOutput ? `Saved ${finalOutput}` : "Download produced no output",
    finalChunk: true,
  });
  socket.close(1000);
}

function parseStartMessage(data: unknown): DownloadStartMessage {
  if (typeof data !== "string") return {};
  try {
    return JSON.parse(data) as DownloadStartMessage;
  } catch {
    return {};
  }
}

function send(socket: WebSocket, value: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

async function cachedInspection(ctx: RuntimeContext, url: URL): Promise<NovelInspection> {
  const key = url.href;
  const cached = await ctx.cache.get<NovelInspection>("content", key);
  if (cached) return cached;
  const info = await inspectNovel(ctx, url);
  await ctx.cache.set("content", key, info, 12 * 60 * 60 * 1000);
  return info;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function serveStaticPath(pathname: string): Promise<Response> {
  const name = basename(decodeURIComponent(pathname));
  if (!name || name === "." || name.includes("..")) return text("Not found", 404);
  return await serveStatic(name);
}

async function serveStatic(name: string): Promise<Response> {
  try {
    const file = await Deno.readFile(new URL(name, STATIC_ROOT));
    return new Response(file, {
      headers: { "Content-Type": contentType(name) },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return text("Not found", 404);
    throw error;
  }
}

function json(value: unknown, status = 200, spaces = 0): Response {
  return new Response(JSON.stringify(value, null, spaces), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function html(value: string, extraHeaders: HeadersInit = {}): Response {
  return new Response(value, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function text(value: string, status = 200): Response {
  return new Response(value, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
    case ".ejs":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function renderTemplate(template: string, data: Record<string, unknown>): string {
  let code = "let __out = \"\";\n";
  let cursor = 0;
  const pattern = /<%([=-]?)([\s\S]*?)%>/g;
  for (const match of template.matchAll(pattern)) {
    code += `__out += ${JSON.stringify(template.slice(cursor, match.index))};\n`;
    const mode = match[1];
    const body = match[2];
    if (mode === "=") code += `__out += escapeHtml(${body});\n`;
    else if (mode === "-") code += `__out += (${body});\n`;
    else code += `${body}\n`;
    cursor = (match.index ?? 0) + match[0].length;
  }
  code += `__out += ${JSON.stringify(template.slice(cursor))};\nreturn __out;`;
  const fn = new Function("scope", "escapeHtml", `with (scope) { ${code} }`);
  return String(fn({ ...data, locals: data }, escapeHtml));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
