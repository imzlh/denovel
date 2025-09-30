// deno-lint-ignore-file require-await no-explicit-any
// deno-lint-ignore-file require-await no-explicit-any
/**
 * 小说服务器 v3
 * POST /api/settings({"delay":1000,"outputDir":"./downloads"}) - 保存全局设置
   GET /api/settings - 获取全局设置
   POST /api/check-url - (body: {url})检查URL并返回是否需要更多信息
   GET /api/push-download?url=... - 下载接口，不会输出内容，仅仅同步到网页
   GET /api/poll-queue - 从待下载队列中获取下载任务
   GET /api/clear-queue - 清空待下载队列
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

import { checkIsTraditional, downloadNovel, exists, Status, getAppDataDir, defaultGetInfo, traditionalAsyncWrapper, moduleExists, sleep } from "./main.ts";
import mainPage from "./static/server.html" with { type: "text" };
import { render } from "npm:ejs";
import { processTXTContent } from "./2epub.ts";
import { join } from "node:path";

import CHAPTER_TEMPLATE from "./static/chapter.html.ejs" with { type: "text" };
import CONTENTAPI_HOMEPAGE from "./static/contentapi.html" with { type: "text" };
import BOOKSHELF_TEMPLATE from "./static/books.html.ejs" with { type: "text" };
import BATCH_PAGE from "./static/batch.html" with { type: "text" };
import DENOVEI_ICO from './static/denovel.ico' with { type: "bytes" };

type Handler2 = (req: Request, url: URL) => PromiseOrNot<Response>;
interface ServerSettings {
    delay: number;
    outputDir: string;
}

// 使用Deno KV作为缓存和队列存储
const kv = await Deno.openKv(await getAppDataDir() + "/contentcache.db");
let settings = (await kv.get<ServerSettings>(['winb.core.settings'])).value ?? {
    delay: 1000,
    outputDir: "./downloads"
};

// 简单路由系统
const routes: Record<string, Record<string, Handler2>> = {
    // API路由
    '/api/settings': {
        POST: async (req: Request) => {
            const body = await req.json();
            settings = body;
            await kv.set(['winb.core.settings'], settings);
            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        },
        GET: () => {
            return new Response(JSON.stringify(settings), {
                headers: { "Content-Type": "application/json" }
            });
        }
    },

    '/api/check-url': {
        POST: async (req: Request) => {
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
                return new Response((e as Error).message, {
                    status: 400
                });
            }
        }
    },

    '/api/push-download': {
        GET: async (_, url: URL) => {
            const novelUrl = url.searchParams.get("url");
            if (!novelUrl) {
                return new Response("Missing URL parameter", {
                    status: 400
                });
            }

            // 使用KV存储下载队列
            await kv.set(["download_queue", Date.now().toString()], novelUrl);

            return new Response("OK", {
                headers: { "Content-Type": "text/plain; charset=UTF-8" }
            });
        }
    },

    '/api/poll-queue': {
        GET: async () => {
            const entries = kv.list({ prefix: ["download_queue"] });
            const urls: string[] = [];
            for await (const entry of entries) {
                urls.push(entry.value as string);
            }
            return new Response(JSON.stringify(urls), {
                headers: { "Content-Type": "application/json" }
            });
        }
    },

    '/api/clear-queue': {
        GET: async () => {
            const entries = kv.list({ prefix: ["download_queue"] });
            for await (const entry of entries) {
                await kv.delete(entry.key);
            }
            return new Response(null, {
                status: 204
            });
        }
    },

    // 内容路由
    '/content': {
        GET: handleContentRequest
    },

    // 批量下载
    '/utils/batch': {
        GET: () => new Response(BATCH_PAGE, {
            headers: { "Content-Type": "text/html; charset=UTF-8" }
        })
    },

    // 主页路由
    '/': {
        GET: () => new Response(mainPage, {
            headers: { "Content-Type": "text/html" }
        })
    },

    // 书架路由
    '/api/bookshelf': {
        GET: handleBookShelfRequest
    },

    '/api/download': {
        GET: handleDownloadRequest
    }
};

// KV缓存操作
const cache = {
    get: async (key: string): Promise<any> => {
        const result = await kv.get(["cache", key]);
        return result.value;
    },

    set: async (key: string, value: any): Promise<void> => {
        await kv.set(["cache", key], value);
    },

    clear: async (): Promise<void> => {
        const entries = kv.list({ prefix: ["cache"] });
        for await (const entry of entries) {
            await kv.delete(entry.key);
        }
    }
};

// 特殊下载队列处理
const urlRequestMap: Map<string, PromiseWithResolvers<void>[]> = new Map();
let will_run_queued_request_tasks = false;

const runQueuedRequestTasks = () => queueMicrotask(() => {
    for (const [name, tasks] of urlRequestMap) {
        if (tasks.length === 0) {
            urlRequestMap.delete(name);
            continue;
        }

        const task = tasks.shift()!;
        task.resolve();
    }
    will_run_queued_request_tasks = false;
});

const queueRequestTask = (name: string) => {
    const el = Promise.withResolvers<void>();
    urlRequestMap.has(name)
        ? urlRequestMap.get(name)!.push(el)
        : urlRequestMap.set(name, [el]);
    if (!will_run_queued_request_tasks) runQueuedRequestTasks();
    return el.promise;
}

const endRequestTask = () => {
    if (!will_run_queued_request_tasks) {
        setTimeout(runQueuedRequestTasks, 1200);
        will_run_queued_request_tasks = true;
    }
}

async function handleContentRequest(_: Request, url: URL) {
    const _novelURL = url.searchParams.get("url");
    if (!_novelURL) {
        return new Response(CONTENTAPI_HOMEPAGE, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=UTF-8" }
        });
    }
    let novelURL;
    try {
        novelURL = new URL(_novelURL);
    } catch {
        return new Response("无效的URL: 在参数 'url'", {
            status: 400,
            headers: { "Content-Type": "text/plain; charset=UTF-8" }
        });
    }

    let info = {} as Record<string, any>;

    // 使用SQLite缓存
    const cachedInfo = await cache.get(novelURL.href);
    if (cachedInfo) {
        await Deno.stdout.write(new TextEncoder().encode('HIT '));
        info = cachedInfo;
    } else {
        let basicInfo: TraditionalConfig;
        let newModule: { default: Callback, getInfo: (url: URL) => PromiseOrNot<MainInfoResult> }
        let isTraditional = true;

        await queueRequestTask(novelURL.hostname);

        try {
            basicInfo = (await import(`./lib/${new URL(novelURL).hostname}.t.ts`)).default;
        } catch (e) {
            if (await moduleExists(`./lib/${novelURL.hostname}.n.ts`)) {
                newModule = await import(`./lib/${novelURL.hostname}.n.ts`);
                isTraditional = false;
            } else {
                endRequestTask();
                return new Response("站点不受支持: " + (e instanceof Error ? e.message : String(e)), {
                    status: 404,
                    headers: { "Content-Type": "text/plain; charset=UTF-8" }
                });
            }
        }

        if (isTraditional && basicInfo!.mainPageLike && basicInfo!.mainPageLike.test(novelURL.href)) {
            info.isChapterPage = false;
            const infos = await defaultGetInfo(novelURL, basicInfo!);
            info.title = infos?.book_name;
            info.cover = infos?.cover;
            info.author = infos?.author;
            info.summary = infos?.summary;
            info.startOfContent = infos?.firstPage;
            info.jpStyle = basicInfo!.jpStyle;
        } else if (isTraditional) {
            info.isChapterPage = true;

            const data = traditionalAsyncWrapper(novelURL);
            try {
                const { done, value } = await data.next();
                if (done) {
                    endRequestTask();
                    return new Response("页面不存在", {
                        status: 404,
                        headers: { "Content-Type": "text/plain; charset=UTF-8" }
                    });
                }
                const { content, title, next_url } = value;
                info.title = title;
                info.content = content;
                info.nextChapter = next_url?.protocol.startsWith('http') ? next_url.toString() : undefined;
            } catch {
                endRequestTask();
                return new Response("页面不存在", {
                    status: 404,
                    headers: { "Content-Type": "text/plain; charset=UTF-8" }
                });
            }
        } else try {
            const { getInfo, default: _callback } = newModule!;
            const infos = await getInfo(novelURL);
            if (!infos) throw new Error("未获取到信息");
            info.title = infos.book_name;
            info.cover = infos.cover;
            info.author = infos.author;
            info.summary = infos.summary;
            info.startOfContent = infos.firstPage;
            info.jpStyle = infos.jpStyle;
            info.isChapterPage = false;
        } catch {
            try {
                const cb = newModule!.default;
                const data = cb(novelURL);
                const { done, value } = await data.next();
                if (done) {
                    endRequestTask();
                    return new Response("页面不存在", {
                        status: 404,
                        headers: { "Content-Type": "text/plain; charset=UTF-8" }
                    });
                }
                const { content, title, next_link } = value;
                info.title = title;
                info.content = content;
                info.nextChapter = next_link && new URL(next_link).protocol.startsWith('http')
                    ? next_link.toString()
                    : undefined;
                info.isChapterPage = true;
            } catch {
                endRequestTask();
                return new Response("页面不存在", {
                    status: 404,
                    headers: { "Content-Type": "text/plain; charset=UTF-8" }
                });
            }
        }

        endRequestTask();
        await cache.set(novelURL.href, info);
    }

    if (url.searchParams.get('json') !== null) {
        return new Response(JSON.stringify(info, null, 2), {
            headers: { "Content-Type": "application/json" }
        });
    } else if (info.content) {
        info.content = processTXTContent(info.content, info.jpStyle);
    } else if (info.summary) {
        info.summary = processTXTContent(info.summary);
    }

    // render page
    info.currentURL = novelURL.href;
    const html = await render(CHAPTER_TEMPLATE, info, {
        async: true,
    });
    return new Response(html, {
        headers: {
            "Content-Type": "text/html",
            "X-Powered-By": "@imzlh/denovel"
        }
    });
}

async function handleBookShelfRequest() {
    const path = settings.outputDir;
    const files = (await Array.fromAsync(Deno.readDir(path))).filter(f => f.isFile && f.name.endsWith('.epub'))
        .map(i => i.name);
    const res = await render(BOOKSHELF_TEMPLATE, {
        books: files
    }, {
        async: true,
    });
    return new Response(res, {
        headers: { "Content-Type": "text/html" }
    });
}

async function handleDownloadRequest(_req: Request, url: URL) {
    if (!url.searchParams.has('name')) {
        return new Response("缺少参数 'name'", {
            status: 400
        });
    }
    const path = join(settings.outputDir, url.searchParams.get('name')!);
    if (!(await exists(path))) {
        return new Response("文件不存在", {
            status: 404
        });
    }
    const file = await Deno.readFile(path);
    return new Response(file, {
        headers: {
            "Content-Type": "application/epub+zip",
            "Content-Disposition": `attachment; filename="${encodeURI(url.searchParams.get('name')!)}"`,
        }
    });
}

// 路由处理函数
async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    // 查找精确匹配的路由
    const routeHandler = routes[pathname];
    if (routeHandler) {
        const handler = routeHandler[method];
        if (handler && typeof handler === 'function') {
            return handler(req, url);
        }
    }

    return new Response("Not Found", { status: 404 });
}

// 启动服务器
export default async function main() {
    const $s = Deno.serve({
        port: 8000,
    }, async (req) => {
        const url = new URL(req.url);

        // WebSocket处理
        if (url.pathname === "/api/download") {
            console.log(req.url);
            if (req.headers.get("upgrade") === "websocket") {
                const { socket, response } = Deno.upgradeWebSocket(req);
                const novelUrl = url.searchParams.get("url");

                if (!novelUrl) {
                    socket.close(1008, "Missing URL parameter");
                    return response;
                }

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

        // Chrome DevTool
        if (
            url.pathname == '/.well-known/appspecific/com.chrome.devtools.json' &&
            (url.hostname == 'localhost' || url.hostname == '127.0.0.1')
        ) {
            return new Response(JSON.stringify({}), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // favicon
        if (url.pathname == '/favicon.ico') {
            return new Response(DENOVEI_ICO, {
                status: 200,
                headers: { "Content-Type": "image/x-icon" }
            });
        }

        // 普通HTTP请求处理
        const res = await handleRequest(req);
        console.log(req.url);
        return res;
    });

    let $shutting = false;
    Deno.addSignalListener("SIGINT", async () => {
        if($shutting) return console.log("Server is already shutting down...");
        $shutting = true;
        kv.close();
        console.log("Server shutting down...(timeout 3s)");
        await Promise.race([
            $s.shutdown(),
            sleep(3)
        ]);
        console.log("Server stopped");
        Deno.exit(0);
    });
}

if (import.meta.main) main();
