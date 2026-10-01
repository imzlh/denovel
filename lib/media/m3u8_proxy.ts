import { basename } from "jsr:@std/path";

export interface M3u8ProxyOptions {
  host?: string;
  port?: number;
  sourceUrl: string;
  fetcher?: typeof fetch;
  logger?: Pick<Console, "log" | "warn" | "error">;
}

export interface M3u8ProxyServer {
  serverUrl: string;
  sourceUrl: string;
  handler(request: Request): Promise<Response>;
}

export function createM3u8ProxyServer(options: M3u8ProxyOptions): M3u8ProxyServer {
  const host = options.host ?? "localhost";
  const port = options.port ?? 12345;
  const serverUrl = `http://${host}:${port}`;
  const sourceUrl = new URL(options.sourceUrl).href;
  const cache = new Map<string, string>();
  const fetcher = options.fetcher ?? fetch;
  const logger = options.logger ?? console;

  const buildProxyUrl = (originalUrl: string, name = "index.ts") =>
    `${serverUrl}/proxy/${encodeURIComponent(originalUrl)}/${name}`;

  async function rewriteM3u8(content: string, baseUrl: string): Promise<string> {
    const lines = content.split("\n");
    const base = new URL(baseUrl);
    const basePath = base.pathname.split("/").slice(0, -1).join("/");
    const rewritten: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#EXTINF:")) {
        rewritten.push(line);
        continue;
      }

      if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
        rewritten.push(line);
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && !nextLine.startsWith("#")) {
          rewritten.push(buildProxyUrl(resolveMediaUrl(nextLine, base, basePath), "index.m3u8"));
          i++;
        }
        continue;
      }

      if (trimmed.startsWith("#EXT-X-KEY:")) {
        const uriMatch = trimmed.match(/URI="([^"]+)"/);
        if (uriMatch) {
          line = line.replace(uriMatch[1], buildProxyUrl(new URL(uriMatch[1], baseUrl).href, "index.key"));
        }
        rewritten.push(line);
        continue;
      }

      if (!trimmed.startsWith("#")) {
        rewritten.push(buildProxyUrl(resolveMediaUrl(trimmed, base, basePath), "index.ts"));
        continue;
      }
      rewritten.push(line);
    }

    return rewritten.join("\n");
  }

  async function proxiedM3u8(originalUrl: string, contentType: string): Promise<Response> {
    if (cache.has(originalUrl)) return corsText(cache.get(originalUrl)!, contentType);
    const response = await fetcher(originalUrl);
    if (!response.ok) {
      return corsText(`M3U8 fetch failed: ${response.status}`, "text/plain", response.status);
    }
    const rewritten = await rewriteM3u8(await response.text(), originalUrl);
    cache.set(originalUrl, rewritten);
    return corsText(rewritten, contentType);
  }

  async function handleProxyRequest(url: URL): Promise<Response> {
    const pathParts = url.pathname.split("/");
    const encodedUrl = pathParts[2];
    if (!encodedUrl) return corsText("Invalid proxy URL", "text/plain", 400);
    const originalUrl = decodeURIComponent(encodedUrl);
    const filename = pathParts[3] || "index.ts";
    const isExt = (extension: string) => filename.endsWith(extension);
    let contentType = "application/octet-stream";
    if (isExt(".ts")) contentType = "video/mp2t";
    else if (isExt(".m3u8")) contentType = url.searchParams.has("text") ? "text/plain" : "application/vnd.apple.mpegurl";

    try {
      if (isExt(".m3u8")) return await proxiedM3u8(originalUrl, contentType);
      const response = await fetcher(originalUrl);
      if (!response.ok) return corsText(`Proxy request failed: ${response.status}`, "text/plain", response.status);
      return new Response(fixTsStream(await response.arrayBuffer()), {
        headers: corsHeaders({ "Content-Type": contentType }),
      });
    } catch (error) {
      return corsText(`Proxy request failed: ${error instanceof Error ? error.message : String(error)}`, "text/plain", 500);
    }
  }

  async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    logger.log(request.method, request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    if (url.pathname.startsWith("/@")) {
      const realUrl = url.pathname.slice(2);
      return new Response(null, {
        status: 302,
        headers: corsHeaders({ Location: `/proxy/${encodeURIComponent(realUrl)}/${basename(realUrl)}` }),
      });
    }

    if (url.pathname.startsWith("/proxy/")) return await handleProxyRequest(url);
    if (url.pathname === "/index.m3u8") {
      return await proxiedM3u8(sourceUrl, url.searchParams.has("text") ? "text/plain" : "application/vnd.apple.mpegurl");
    }

    return new Response(renderHelp(serverUrl, sourceUrl), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return { serverUrl, sourceUrl, handler };
}

export function fixTsStream(content: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(content);
  for (let left = 0; left < data.length - 4; left++) {
    if ([0x47, 0x40, 0x00, 0x10].every((value, index) => data[left + index] === value)) {
      return data.slice(left);
    }
  }
  return data;
}

function resolveMediaUrl(input: string, base: URL, basePath: string): string {
  if (input.startsWith("http")) return input;
  if (input.startsWith("//")) return `http:${input}`;
  if (input.startsWith("/")) return `${base.origin}${input}`;
  return `${base.origin}${basePath}/${input}`;
}

function corsHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return headers;
}

function corsText(body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: corsHeaders({ "Content-Type": contentType }),
  });
}

function renderHelp(serverUrl: string, sourceUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>M3U8 Proxy</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    code { background: #f4f4f4; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>M3U8 Proxy</h1>
  <p>Server: ${serverUrl}</p>
  <p>Source: ${sourceUrl}</p>
  <p>Playlist: <a href="${serverUrl}/index.m3u8?text">${serverUrl}/index.m3u8</a></p>
  <p>ffmpeg: <code>ffmpeg -i "${serverUrl}/index.m3u8" output.mp4</code></p>
</body>
</html>`;
}
