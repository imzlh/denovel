// deno-lint-ignore-file require-await
/**
 * 小说服务器 v3
 * POST /api/settings({"delay":1000,"outputDir":"./downloads"}) - 保存全局设置
   GET /api/settings - 获取全局设置
   POST /api/check-url - (body: {url})检查URL并返回是否需要更多信息
   GET /api/push-download?url=... - 下载接口，不会输出内容，仅仅同步到网页
   GET /api/poll-queue - 从待下载队列中获取下载任务
   WebSocket /api/download?url=... - 下载接口，支持实时消息推送
   第一条消息传输信息：
   { novelName: string, coverUrl: string, options: {
        toEpub: document.getElementById('toEpub').checked,
        translate: document.getElementById('translate').checked,
        autoPart: document.getElementById('autoPart').checked,
        jpFormat: document.getElementById('jpFormat').checked,
        mergeShort: document.getElementById('mergeShort').checked
    }}
    后续服务端传输HTML到前端，直接显示到dialog
 */

import { checkIsTraditional, downloadNovel, exists, Status } from "./main.ts";
import mainPage from "./static/server.html" with { type: "text" };
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";

// 全局设置
let settings = {
    delay: 1000,
    outputDir: "./downloads"
};
if (await exists('server.json')) {
    settings = JSON.parse(await Deno.readTextFile('server.json'));
    await ensureDir(settings.outputDir);
}

// 特殊下载队列：只有前端受理时才取出
const downloadQueue: string[] = [];

// 路由处理函数
async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // API路由
    if (url.pathname === "/api/settings") {
        if (req.method === "POST") {
            const body = await req.json();
            settings = body;
            await Deno.writeTextFile('server.json', JSON.stringify(settings));
            await ensureDir(settings.outputDir);
            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        } else if (req.method === "GET") {
            return new Response(JSON.stringify(settings), {
                headers: { "Content-Type": "application/json" }
            });
        }
    } else if (url.pathname === "/api/check-url") {
        if (req.method === "POST") {
            try {
                const { url: novelUrl } = await req.json();
                const needsMoreInfo = await downloadNovel(novelUrl, {
                    check_needs_more_data: true,
                    traditional: await checkIsTraditional(new URL(novelUrl))
                });
                return new Response(JSON.stringify({ needsInfo: needsMoreInfo }), {
                    headers: { "Content-Type": "application/json" }
                });
            } catch (e) {
                return new Response((e as Error).message , {
                    status: 400
                });
            }
        }
    } else if (url.pathname === "/api/push-download") {
        const novelUrl = url.searchParams.get("url");
        if (!novelUrl) {
            return new Response("Missing URL parameter", {
                status: 400
            });
        }
        downloadQueue.push(novelUrl);
        return new Response("OK", {
            headers: { "Content-Type": "text/plain" }
        });
    } else if (url.pathname == '/api/poll-queue'){
        const resp = new Response(JSON.stringify(downloadQueue), {
            headers: { "Content-Type": "application/json" }
        });
        // downloadQueue.length = 0;
        return resp;
    } else if (url.pathname === "/api/clear-queue") {
        downloadQueue.length = 0;
        return new Response(null, {
            status: 204
        });
    } else if (url.pathname === "/") {
        return new Response(mainPage, {
            headers: { "Content-Type": "text/html" }
        });
    }

    return new Response("Not Found", { status: 404 });
}

// 启动服务器
export default async function main(){
    console.log("Server running on http://localhost:8000");
    Deno.serve({
        port: 8000,
    }, async (req) => {
        const url = new URL(req.url);
        console.log(req.url);

        // WebSocket处理
        if (url.pathname === "/api/download") {
            if (req.headers.get("upgrade") === "websocket") {
                const { socket, response } = Deno.upgradeWebSocket(req);
                const novelUrl = url.searchParams.get("url");

                if (!novelUrl) {
                    socket.close(1008, "Missing URL parameter");
                    return response;
                }

                // 接收第一条消息
                let firstMessageReceived = false;
                let novelOptions: {
                    novelName: string;
                    coverUrl: string;
                    options: {
                        toEpub: boolean;
                        translate: boolean;
                        autoPart: boolean;
                        jpFormat: boolean;
                        mergeShort: boolean;
                    };
                };

                console.log(`[ NEW ] WebSocket连接成功，准备下载 ${novelUrl}`);

                socket.onmessage = async (event) => {
                    if (!firstMessageReceived && typeof event.data === "string") {
                        novelOptions = JSON.parse(event.data);
                        firstMessageReceived = true;
                        console.log(`[ INFO ] 开始下载 ${novelOptions.novelName}`);

                        try {
                            await downloadNovel(novelUrl, {
                                reporter: async (status, message) => {
                                    socket.send(JSON.stringify({
                                        status: Status[status],
                                        log: message
                                    }));
                                },
                                book_name: novelOptions.novelName,
                                cover: novelOptions.coverUrl,
                                sig_abort: new AbortController().signal,
                                disable_parted: !novelOptions.options?.autoPart,
                                to_epub: novelOptions.options?.toEpub,
                                traditional: await checkIsTraditional(new URL(novelUrl)),
                                epub_options: {
                                    thenCB: async () => {
                                        socket.send(JSON.stringify({
                                            status: 'DONE',
                                            log: '转换完成'
                                        }));
                                    },
                                    jpFormat: novelOptions.options?.jpFormat,
                                    merge: novelOptions.options?.mergeShort
                                },
                                info_generated: async (info) => {
                                    socket.send(JSON.stringify({
                                        status: 'sync',
                                        info
                                    }));
                                },
                                sleep_time: settings.delay / 1000,
                                outdir: settings.outputDir,
                                no_input: true,
                                translate: novelOptions.options?.translate
                            });
                            socket.send(JSON.stringify({
                                finalChunk: true
                            }));
                        } catch (error) {
                            socket.send(JSON.stringify({
                                status: 'ERROR',
                                log: error instanceof Error ? error.message : 'Unknown error'
                            }));
                            socket.close();
                        }
                    }
                };

                socket.onclose = () => {
                    console.log('WebSocket连接关闭');
                };

                return response;
            }
        }

        // 普通HTTP请求处理
        return handleRequest(req);
    });
}

if(import.meta.main) main();