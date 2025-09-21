#!/usr/bin/env -S deno run --allow-net --allow-read
/**
 * M3U8代理重写服务器 - 简化版
 * 专注于正确处理嵌套m3u8文件
 */

const HOST = "localhost";
const PORT = 12345;
const SERVER_URL = `http://${HOST}:${PORT}`;

// 存储原始M3U8 URL
let originalM3U8Url: string | null = null;

// 缓存处理过的m3u8内容
const m3u8Cache = new Map<string, string>();

/**
 * 构建代理URL
 */
function buildProxyUrl(originalUrl: string, name = "index.ts"): string {
    const encodedUrl = encodeURIComponent(originalUrl);
    return `${SERVER_URL}/proxy/${encodedUrl}/${name}`;
}

/**
 * 从代理URL提取原始URL
 */
function extractOriginalUrl(proxyUrl: string): string | null {
    if (!proxyUrl.includes('/proxy/')) return null;

    const parts = proxyUrl.split('/proxy/');
    if (parts.length < 2) return null;

    return decodeURIComponent(parts[1]);
}

/**
 * 判断URL是否指向代理服务器
 */
function isProxyUrl(url: string): boolean {
    return url.includes(`${HOST}:${PORT}/proxy/`);
}

/**
 * 重写m3u8内容，将所有URL改为通过代理服务器
 */
async function rewriteM3U8(content: string, baseUrl: string): Promise<string> {
    const lines = content.split('\n');
    const base = new URL(baseUrl);
    const basePath = base.pathname.split('/').slice(0, -1).join('/');

    const rewrittenLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmedLine = line.trim();

        // 跳过空行和注释行（除了EXTINF）
        if (trimmedLine === '') {
            rewrittenLines.push(line);
            continue;
        }

        // 处理EXTINF行
        if (trimmedLine.startsWith('#EXTINF:')) {
            rewrittenLines.push(line);
            continue;
        }

        // 处理EXT-X-STREAM-INF（嵌套m3u8）
        if (trimmedLine.startsWith('#EXT-X-STREAM-INF:')) {
            rewrittenLines.push(line);

            // 下一行应该是嵌套m3u8的URL
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1].trim();
                if (nextLine && !nextLine.startsWith('#')) {
                    let nestedUrl: string;

                    if (nextLine.startsWith('http')) {
                        nestedUrl = nextLine;
                    } else if (nextLine.startsWith('/')) {
                        nestedUrl = `${base.origin}${nextLine}`;
                    } else {
                        nestedUrl = `${base.origin}${basePath}/${nextLine}`;
                    }

                    rewrittenLines.push(buildProxyUrl(nestedUrl, 'index.m3u8'));
                    i++; // 跳过下一行
                }
            }
            continue;
        }

        // 处理EXT-X-KEY
        if (trimmedLine.startsWith('#EXT-X-KEY:')) {
            const uriMatch = trimmedLine.match(/URI="([^"]+)"/);
            if (uriMatch) {
                const keyUrl = uriMatch[1];
                const fullKeyUrl: string = new URL(keyUrl, baseUrl).href;
                line = line.replace(keyUrl, buildProxyUrl(fullKeyUrl, 'index.key'));
            }
            rewrittenLines.push(line);
            continue;
        }

        // 处理普通URL行
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            let fullUrl: string;

            if (trimmedLine.startsWith('http')) {
                fullUrl = trimmedLine;
            } else if (trimmedLine.startsWith('/')) {
                fullUrl = `${base.origin}${trimmedLine}`;
            } else {
                fullUrl = `${base.origin}${basePath}/${trimmedLine}`;
            }

            rewrittenLines.push(buildProxyUrl(fullUrl, 'index.ts'));
            continue;
        }
            
        rewrittenLines.push(line);
    }

    return rewrittenLines.join('\n');
}

function fixTSStream(content: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
    const data = new Uint8Array(content);

    // TS: 0x47, 0x40, 0x00, 0x10
    for(let left = 0; left < data.length -4; left++){
        if(
            [0x47, 0x40, 0x00, 0x10].every((v, i) => data[left + i] === v)
        ){
            console.log('CORRECT ts stream, offset: 0x' + left.toString(16));
            return data.slice(left);
        }
    }

    return data;    // not found
}

/**
 * 处理代理请求
 */
async function handleProxyRequest(url: URL): Promise<Response> {
    const pathParts = url.pathname.split('/');
    if (pathParts.length < 3) {
        return new Response("无效的代理URL", { status: 400 });
    }

    const encodedUrl = pathParts[2];
    if (!encodedUrl) {
        return new Response("无效的代理URL", { status: 400 });
    }

    try {
        const originalUrl = decodeURIComponent(encodedUrl),
            fname = pathParts[3] || 'index.ts';

        // 设置适当的Content-Type
        let contentType = "application/octet-stream";
        const isExt = (extension: string) => fname.endsWith(extension);
        if (isExt('.ts')) {
            contentType = "video/mp2t";
        } else if (isExt('.m3u8')) {
            contentType = url.searchParams.has('text') ? "text/plain" : "application/vnd.apple.mpegurl";
        } else if (isExt('.key')) {
            contentType = "application/octet-stream";
        }

        // 对于m3u8文件，需要特殊处理
        if (isExt('.m3u8')) {
            // 检查缓存
            if (m3u8Cache.has(originalUrl)) {
                return new Response(m3u8Cache.get(originalUrl), {
                    headers: {
                        "Content-Type": contentType,
                        "Access-Control-Allow-Origin": "*",
                    },
                });
            }

            // 获取并重写m3u8内容
            const response = await fetch(originalUrl);
            if (!response.ok) {
                return new Response(`获取M3U8失败: ${response.status}`, {
                    status: response.status,
                    headers: { "Access-Control-Allow-Origin": "*" }
                });
            }

            const content = await response.text();
            const rewrittenContent = await rewriteM3U8(content, originalUrl);

            // 缓存结果
            m3u8Cache.set(originalUrl, rewrittenContent);

            return new Response(rewrittenContent, {
                headers: {
                    "Content-Type": contentType,
                    "Access-Control-Allow-Origin": "*",
                },
            });
        }

        // 对于其他文件类型，直接代理
        const response = await fetch(originalUrl);
        if (!response.ok) {
            return new Response(`代理请求失败: ${response.status}`, {
                status: response.status,
                headers: { "Access-Control-Allow-Origin": "*" }
            });
        }

        const content = fixTSStream(await response.arrayBuffer());

        return new Response(content, {
            headers: {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*"
            },
        });
    } catch (error) {
        const err = error as Error;
        return new Response(`代理请求失败: ${err.message}`, {
            status: 500,
            headers: { "Access-Control-Allow-Origin": "*" }
        });
    }
}

/**
 * 处理主m3u8请求
 */
async function handleMainM3U8Request(): Promise<Response> {
    if (!originalM3U8Url) {
        return new Response("M3U8 URL未设置", { status: 400 });
    }

    try {
        // 检查缓存
        if (m3u8Cache.has(originalM3U8Url)) {
            return new Response(m3u8Cache.get(originalM3U8Url), {
                headers: {
                    "Content-Type": "application/vnd.apple.mpegurl",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        }

        // 获取原始m3u8内容
        const response = await fetch(originalM3U8Url);
        if (!response.ok) {
            return new Response(`获取M3U8失败: ${response.status}`, {
                status: response.status,
                headers: { "Access-Control-Allow-Origin": "*" }
            });
        }

        const content = await response.text();
        const rewrittenContent = await rewriteM3U8(content, originalM3U8Url);

        // 缓存结果
        m3u8Cache.set(originalM3U8Url, rewrittenContent);

        return new Response(rewrittenContent, {
            headers: {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (error) {
        const err = error as Error;
        return new Response(`处理M3U8失败: ${err.message}`, {
            status: 500,
            headers: { "Access-Control-Allow-Origin": "*" }
        });
    }
}

/**
 * 主请求处理函数
 */
async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);

    console.log(request.method, request.url);

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

    // 处理主m3u8请求
    if (url.pathname === "/index.m3u8") {
        return handleMainM3U8Request();
    }

    // 显示使用说明
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>M3U8代理服务器</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .code { background: #f4f4f4; padding: 10px; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>M3U8代理服务器</h1>
    <p>服务器运行在: ${SERVER_URL}</p>
    
    <h2>使用方法:</h2>
    <ol>
        <li>启动服务器: <code>deno run --allow-net specialm3u8.ts https://example.com/video.m3u8</code></li>
        <li>访问: <code>${SERVER_URL}/index.m3u8</code></li>
        <li>ffmpeg使用: <code>ffmpeg -i "${SERVER_URL}/index.m3u8" output.mp4</code></li>
    </ol>
    
    <h2>当前状态:</h2>
    <p>原始M3U8 URL: ${originalM3U8Url || "未设置"}</p>
    <p>预览M3U8内容: <a href="${SERVER_URL}/index.m3u8?text" target="_blank">${SERVER_URL}/index.m3u8</a></p>
</body>
</html>
`;
    return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

/**
 * 主函数
 */
async function main() {
    // 获取命令行参数
    const args = Deno.args;

    if (args.length === 0) {
        originalM3U8Url = prompt("请输入原始M3U8 URL:") ?? Deno.exit(1);
    } else {
        originalM3U8Url = args[0];
    }

    // 验证URL格式
    try {
        new URL(originalM3U8Url);
        console.log(`原始M3U8 URL: ${originalM3U8Url}`);
    } catch {
        console.error(`错误: 无效的URL格式 - ${originalM3U8Url}`);
        Deno.exit(1);
    }

    console.log(`启动M3U8代理服务器在 ${SERVER_URL}`);
    console.log(`访问 ${SERVER_URL}/index.m3u8 获取代理后的m3u8`);
    console.log(`访问 ${SERVER_URL}/help 查看使用说明`);

    // 启动服务器
    Deno.serve({ hostname: HOST, port: PORT }, handler);
}

// 运行主函数
if (import.meta.main) {
    main();
}