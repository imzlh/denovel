#!/usr/bin/env -S deno run --allow-net --allow-read
/**
 * M3U8代理重写服务器
 * 将m3u8内的所有URL重写为通过代理服务器访问
 */

// 服务器配置
const HOST = "localhost";
const PORT = 8000;
const SERVER_URL = `http://${HOST}:${PORT}`;

// 全局变量存储原始m3u8 URL
let originalM3U8Url: string | null = null;

/**
 * 重写m3u8内容，将所有URL改为通过代理服务器
 */
function rewriteM3U8(content: string, m3u8Url: string): string {
    const lines = content.split('\n');
    const baseUrl = new URL(m3u8Url);
    const basePath = baseUrl.pathname.split('/').slice(0, -1).join('/');

    const rewrittenLines = lines.map(line => {
        const trimmedLine = line.trim();

        // 跳过注释行和空行（除了EXTINF）
        if ((trimmedLine.startsWith('#') && !trimmedLine.startsWith('#EXTINF')) || trimmedLine === '') {
            return line;
        }

        // 处理EXTINF行（包含时长信息）
        if (trimmedLine.startsWith('#EXTINF:')) {
            return line;
        }

        // 处理URL行 - 重写为代理服务器URL
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            // 如果是完整URL
            if (trimmedLine.startsWith('http')) {
                const url = new URL(trimmedLine);
                return `${SERVER_URL}/proxy/${encodeURIComponent(trimmedLine)}/index.ts`;
            }

            // 如果是绝对路径
            if (trimmedLine.startsWith('/')) {
                const fullUrl = `${baseUrl.protocol}//${baseUrl.host}${trimmedLine}`;
                return `${SERVER_URL}/proxy/${encodeURIComponent(fullUrl)}/index.ts`;
            }

            // 如果是相对路径
            const fullUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}/${trimmedLine}`;
            return `${SERVER_URL}/proxy/${encodeURIComponent(fullUrl)}/index.ts`;
        }

        return line;
    });

    return rewrittenLines.join('\n');
}

/**
 * 代理文件请求
 */
async function handleProxyRequest(url: URL): Promise<Response> {
    const encodedUrl = url.pathname.split('/proxy/')[1].split('/')[0];
    if (!encodedUrl) {
        return new Response("无效的代理URL", { status: 400 });
    }

    try {
        const originalUrl = decodeURIComponent(encodedUrl);

        // 根据文件类型设置Content-Type
        let contentType = "application/octet-stream";
        if (originalUrl.endsWith('.ts')) {
            contentType = "video/mp2t";
        } else if (originalUrl.endsWith('.m3u8')) {
            contentType = "application/vnd.apple.mpegurl";
        } else if (originalUrl.endsWith('.png') || originalUrl.endsWith('.jpg') || originalUrl.endsWith('.jpeg')) {
            contentType = "image/" + originalUrl.split('.').pop();
        }

        // 代理请求到原始服务器
        const response = await fetch(originalUrl);
        if (!response.ok) {
            return new Response(`代理请求失败: ${response.status}`, {
                status: response.status,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "text/plain"
                }
            });
        }

        const content = await response.arrayBuffer();

        return new Response(content, {
            headers: {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*",
                ...Object.fromEntries(response.headers.entries()),
            },
        });
    } catch (error) {
        const err = error as Error;
        return new Response(`代理请求失败: ${err.message}`, {
            status: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "text/plain"
            }
        });
    }
}

/**
 * 处理m3u8文件请求
 */
async function handleM3U8Request(): Promise<Response> {
    if (!originalM3U8Url) {
        return new Response("M3U8 URL未设置", { status: 400 });
    }

    try {
        // 下载原始m3u8文件
        const response = await fetch(originalM3U8Url);
        if (!response.ok) {
            return new Response(`下载M3U8文件失败: ${response.status}`, { status: 500 });
        }

        const content = await response.text();
        const rewrittenContent = rewriteM3U8(content, originalM3U8Url);

        return new Response(rewrittenContent, {
            headers: {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (error) {
        const err = error as Error;
        return new Response(`处理M3U8文件失败: ${err.message}`, { status: 500 });
    }
}

/**
 * 主请求处理函数
 */
async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    console.log(request.method, url.pathname);

    // 设置CORS头
    if (request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }

    // 处理代理请求
    if (url.pathname.startsWith("/proxy/")) {
        return handleProxyRequest(url);
    }

    // 处理m3u8文件请求
    if (url.pathname.endsWith(".m3u8")) {
        return handleM3U8Request();
    }

    // 根路径显示使用说明
    if (url.pathname === "/") {
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>M3U8代理重写服务器</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .code { background: #f4f4f4; padding: 10px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>M3U8代理重写服务器</h1>
        <p>服务器运行在: ${SERVER_URL}</p>
        
        <h2>使用方法:</h2>
        <ol>
          <li>启动服务器: <code>deno run --allow-net specialm3u8.ts https://example.com/video.m3u8</code></li>
          <li>访问: <code>${SERVER_URL}/video.m3u8</code></li>
          <li>ffmpeg使用: <code>ffmpeg -i "${SERVER_URL}/video.m3u8" output.mp4</code></li>
        </ol>
        
        <h2>功能特点:</h2>
        <ul>
          <li>自动重写m3u8内所有URL通过代理服务器</li>
          <li>支持各种文件类型（ts、m3u8、图片等）</li>
          <li>完整的CORS支持</li>
          <li>智能URL路径处理</li>
        </ul>
        
        <h2>当前状态:</h2>
        <p>原始M3U8 URL: ${originalM3U8Url || "未设置"}</p>
      </body>
      </html>
    `;

        return new Response(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    }

    return new Response("未找到", { status: 404 });
}

/**
 * 主函数
 */
async function main() {
    // 获取命令行参数
    const args = Deno.args;

    if (args.length === 0) {
        // @ts-ignore
        args[0] = prompt("请输入原始M3U8 URL:");
        if(!args[0]) throw new Error("未输入原始M3U8 URL");
    }

    originalM3U8Url = args[0];

    // 验证URL格式
    try {
        new URL(originalM3U8Url);
        console.log(`原始M3U8 URL: ${originalM3U8Url}`);
    } catch {
        console.error(`错误: 无效的URL格式 - ${originalM3U8Url}`);
        Deno.exit(1);
    }

    console.log(`启动M3U8代理重写服务器在 ${SERVER_URL}`);
    console.log(`访问 ${SERVER_URL} 查看使用说明`);
    console.log(`代理后的m3u8: ${SERVER_URL}/${originalM3U8Url.split('/').pop()}`);

    // 启动服务器
    Deno.serve({ hostname: HOST, port: PORT }, handler);
}

// 运行主函数
if (import.meta.main) {
    main();
}
