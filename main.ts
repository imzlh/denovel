import { DOMParser, HTMLDocument } from "jsr:@b-fuze/deno-dom";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { toEpub } from "./2epub.ts";
import { Converter } from './t2cn.js';

class NoRetryError extends Error { }

const parser = new DOMParser(),
    utf8decoder = new TextDecoder('utf-8'),
    args = parseArgs(Deno.args, {
        string: ['name', 'outdir', 'charset', 'sleep', 'retry', 'timeout', 'cover'],
        boolean: ['help', 'epub', 'parted', 'translate'],
        alias: {
            h: 'help',
            n: 'name',
            o: 'outdir',
            s: 'sleep',
            r: 'retry',
            c: 'charset',
            t: 'timeout',
            e: 'epub',
            p: 'parted',
            l: 'translate',
            b: 'cover'
        }
    }),
    SLEEP_INTERVAL = parseInt(args.sleep || '0'), // 间隔时间防止DDOS护盾deny
    MAX_RETRY = parseInt(args.retry || '10'); // 最大重试次数

const sleep = (sec = SLEEP_INTERVAL) => new Promise(resolve => setTimeout(resolve, sec * 1000));

function timeout(sec: number, abort?: AbortSignal) {
    const sig = new AbortController();
    setTimeout(() => sig.abort("Fetch timeout"), sec * 1000);
    abort?.addEventListener("abort", () => sig.abort("User abort"));
    return sig.signal;
}

const removeNonVisibleChars = String;

// 用于存储 Cookie 的全局对象
const cookieStore: Record<string, Record<string, string>> =
    await exists('cookie.json') ? JSON.parse(Deno.readTextFileSync('cookie.json')) : {};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0';

// cookie from browser cookie header
function setRawCookie(site: string, cookie: string) {
    cookieStore[site] = {
        ...cookieStore[site],
        ...cookie.split(';').reduce((acc, cur) => {
            const [key, value] = cur.split('=');
            if (key && value) {
                acc[key.trim()] = value.trim();
            }
            return acc;
        }, {} as Record<string, string>)
    }
}

function getSiteCookie(site: string, cookie_name: string) {
    const obj = cookieStore[site] || {};
    for (const key in obj) {
        if (key.toLowerCase() == cookie_name.toLowerCase()) {
            return obj[key];
        }
    }
}

type IPInfo = {
    ips: string[];
    fastest: string;
    updated: number;
    ttl: number;
};

const IP_CACHE_FILE = "ip_cache.json";
const CACHE_TTL = 3600_000; // 1小时缓存

const ipCache: Record<string, IPInfo> = await exists(IP_CACHE_FILE)
    ? JSON.parse(await Deno.readTextFile(IP_CACHE_FILE))
    : {};

// 在onbeforeunload中添加IP缓存保存
const forceSaveConfig = globalThis.onbeforeunload = function () {
    Deno.writeTextFileSync('cookie.json', JSON.stringify(cookieStore, null, 4));
    Deno.writeTextFileSync(IP_CACHE_FILE, JSON.stringify(ipCache, null, 4));
} as () => void;

// 改进后的fetch2函数
async function fetch2(
    url: string | URL,
    options: RequestInit = {},
    measureIP: boolean = false
): Promise<Response> {
    const originalUrl = typeof url === 'string' ? new URL(url) : url;
    let targetUrl = originalUrl;

    // IP测速逻辑
    if (measureIP) {
        const hostname = originalUrl.hostname;

        // 缓存有效检测
        if (!ipCache[hostname] || Date.now() - ipCache[hostname].updated > CACHE_TTL) {
            console.log(`[ INFO ] Measure IP for ${hostname}`);

            const validIPs = (await Deno.resolveDns(hostname, "A").catch(() => [] as string[]))
                .concat(await Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]));
            
            console.log(`[ INFO ] Valid IPs for ${hostname}:`, validIPs);

            if (validIPs.length > 1) try{
                // 并行测试IP速度
                const node = await Promise.any(
                    validIPs.map(async ip => {
                        const start = Date.now();
                        await fetch(`${originalUrl.protocol}//${ip.includes(':') ? `[${ip}]` : ip}/`, {
                            headers: { Host: hostname }
                        });
                        console.log(`[ INFO ] IP ${ip} latency: ${Date.now() - start}ms`);
                        return { ip, latency: Date.now() - start };
                    })
                );

                let fastest = node.ip;
                fastest = fastest.includes(':') ? `[${fastest}]` : fastest; // ipv6格式化
                ipCache[hostname] = {
                    ips: validIPs,
                    fastest,
                    updated: Date.now(),
                    ttl: CACHE_TTL
                };
                targetUrl = new URL(`${originalUrl.protocol}//${fastest}${originalUrl.pathname}`);
                console.log(`[ INFO ] Use fastest IP ${fastest}(${node.latency}) for ${hostname}`);
            }catch(e){
                console.error(e);
                throw new Error(`[ ERROR ] No valid IP for ${hostname}:`);
            }
        } else if (ipCache[hostname]) {
            console.log(`[ INFO ] Use cached IP ${ipCache[hostname].fastest} for ${hostname}`);
            targetUrl = new URL(`${originalUrl.protocol}//${ipCache[hostname].fastest}${originalUrl.pathname}`);
        } else {
            console.log(`[ INFO ] No or only one valid IP for ${hostname}`);
        }
    }

    const host = targetUrl.hostname.split('.').slice(-2).join('.');
    const cookies = Object.entries(cookieStore[host] || {})
        .map(([k, v]) => `${k}=${v}`).join('; ');

    // 确保Host头正确
    const headers = new Headers(options.headers);
    if (measureIP && targetUrl.hostname !== originalUrl.hostname) {
        headers.set('Host', originalUrl.hostname);
    }
    headers.set('Cookie', cookies);
    headers.set('User-Agent', UA);
    headers.set('Origin', originalUrl.origin);

    // 修复请求方法逻辑
    if (options.body && (!options.method || /^get|head$/i.test(options.method))) {
        options.method = 'POST';
    }

    // 重试逻辑（保持原有）
    let response: Response | undefined;
    for (let i = 0; i < 3; i++) {
        try {
            response = await fetch(targetUrl, { ...options, headers, redirect: 'manual' });
            break;
        } catch (e) {
            console.warn(`Fetch failed (attempt ${i + 1}):`, (e as Error).message);
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }

    if (!response) throw new Error(`Fetch failed for ${originalUrl.href}`);

    // 从响应头中提取 Set-Cookie 并更新 cookieStore
    const setCookieHeader = response.headers.getSetCookie();
    const obj = cookieStore[host] || {};
    for (const setCookie of setCookieHeader) {
        const cookie = setCookie.split(';')[0]
        const [key, value] = cookie.split('=');

        // 检查Expire时间
        const expire = setCookie.split(';').find(s => s.trim().toLowerCase().startsWith('expires='))
            ?.trim().split('=')[1];
        if (expire) {
            const exp_date = new Date(expire);
            if (exp_date.getTime() <= Date.now()) {
                delete obj[key];
                continue;
            }
        }

        if (key && value) {
            obj[key.trim()] = value.trim();
        }
    }
    cookieStore[host] = obj;

    if ([301, 302, 303, 307, 308].includes(response.status)) {
        // 重定向
        response = await fetch2(new URL(response.headers.get('location')!), options, measureIP);
    }

    return response;
}

const removeHTMLTags = (str: string) => str.replace(/<\/?[a-z]+(?:\s+[^>]+)?>/gi, '\n')
    .replace(/&nbsp;/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replaceAll(/&#([0-9a-f]+)/gi, (_match, p1) => String.fromCharCode(parseInt(p1, 16)));

const removeIllegalPath = (path: string) => path.replaceAll(/[\/:*?"<>|]/ig, '_');

let charsetRaw = args.charset || 'utf-8';
const t_timeout = parseInt(args.timeout || '10');
async function getDocument(url: URL | string, abort?: AbortSignal, additionalHeaders?: Record<string, string>, ignore_status = false, measureIP = false) {
    url = typeof url === 'string' ? new URL(url) : url;
    const response = await fetch2(url, {
        headers: {
            'Accept-Language': "zh-CN,zh;q=0.9",
            'Accept': 'text/html,application/xhtml+xml',
            ...additionalHeaders
        },
        keepalive: true,
        signal: timeout(t_timeout, abort),
        redirect: 'follow',
        credentials: 'include',
        referrer: url.protocol + '://' + url.host + '/',
        referrerPolicy: 'unsafe-url'
    }, measureIP);
    if (!response.ok && !ignore_status) throw new Error(`Failed to fetch ${url}(status: ${response.status})`);
    const data = new Uint8Array(await response.arrayBuffer());

    // 编码检查
    let charset = charsetRaw;
    if (response.headers.get('Content-Type')?.includes('charset')) {
        charset = response.headers.get('Content-Type')!.match(/charset=(\S+)/)![1];
    } else {
        const utf8_data = utf8decoder.decode(data);
        if (
            /<meta\s+charset="(gb.+)".+>/i.test(utf8_data) ||
            // <meta http-equiv="Content-Type" content="text/html; charset=gbk" />
            /<meta.+content-type.+content=".+charset=(gb.+)".+>/i.test(utf8_data)
        ) charset = (
            utf8_data.match(/<meta.+content-type.+content=".+charset=(gb.+)".+>/i) ||
            utf8_data.match(/<meta\s+charset="(gb.+)".+>/i)
        )![1]
    }

    if (charset != charsetRaw) {
        console.log(`[ INFO ] Document charset: ${charset}`);
        charsetRaw = charset;
    }

    const doc = parser.parseFromString(
        new TextDecoder(charset).decode(data),
        "text/html"
    );
    return doc;
}

function tryReadTextFile(file: string): string {
    const binFile = Deno.readFileSync(file);
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(binFile);
        // }catch{ try{
        //     console.log('try windows-1252(ANSI)')
        //     return new TextDecoder('windows-1252', { fatal: true }).decode(binFile);
    } catch {
        console.log('try gb18030(GBK+)')
        return new TextDecoder('gb18030', { fatal: true }).decode(binFile);
    }
    // }
}

enum Status {
    QUEUED,
    DOWNLOADING,
    CONVERTING,
    DONE,
    ERROR,
    WARNING,
    CANCELLED
}

function similarTitle(title1: string, title2: string) {
    if(title1.trim() == title2.trim()) return true;
    const format = /^(.+?)\s*\(\d\/\d\)$/;
    const t1res = title1.trim().match(format),
        t2res = title2.trim().match(format);
    return t1res && t2res && t1res[1] == t2res[1];
}

export const convert = Converter({ from: 'tw', to: 'cn' });
/**
 * 下载并转换小说
 * @param start_url 起始URL
 * @param isTraditional 是否使用传统模式
 * @param sig_abort 可选的终止信号
 */
async function downloadNovel(
    start_url = '',
    isTraditional: boolean = true,
    report_status: (status: Status, message: string, error?: Error) => void = (status, msg, e) =>
        console.log(`[ ${Status[status]} ] ${msg}`, e?.message),
    book_name: string = args.name!,
    cover?: string,
    sig_abort?: AbortSignal
) {
    book_name || (book_name = prompt("请输入书名 >> ") || '');
    const fpath = (args.outdir || 'out') + '/' + removeIllegalPath(book_name) + '.txt';
    const file = await Deno.open(fpath, {
        create: true, write: true, truncate: true
    });

    let next_url = new URL(start_url!),
        chapter_id = 1;

    const configOrCallback = await import('./lib/' + next_url.hostname + (isTraditional ? '.t.ts' : '.n.ts'));
    const config = (isTraditional ? configOrCallback.default : await configOrCallback.default() as TraditionalConfig | Callback);
    let previous_title = '';

    if(cover){
        file.write(new TextEncoder().encode(`封面: ${cover}\r\n`));
    }

    loop: while (next_url) {
        if (sig_abort?.aborted) {
            report_status(Status.CANCELLED, '下载被用户终止');
            break loop;
        }

        let documentOrData: HTMLDocument | Data, retry = 1;
        while (true) {
            try {
                documentOrData = isTraditional ? await getDocument(next_url, sig_abort) : await config(next_url);
                if (!documentOrData) {
                    report_status(Status.ERROR, `ID: ${chapter_id} 内未找到内容`);
                    break loop;
                }
                break;
            } catch (e) {
                if (e instanceof NoRetryError) {
                    report_status(Status.DOWNLOADING, `获取页面 ${retry++} 次尝试重新获取`, e as Error);
                    continue loop;
                }
                if (retry > MAX_RETRY) {
                    report_status(Status.ERROR, `获取页面失败，重试次数过多，终止程序`);
                    break loop;
                }
                report_status(Status.DOWNLOADING, `获取页面 ${retry++} 次尝试重新获取`, e as Error);
                continue;
            }
        }

        let content: string | undefined, title: string | undefined, next_link: string | URL;

        if (isTraditional) {
            const document = documentOrData as HTMLDocument;
            const ctx = document.querySelector((config as TraditionalConfig).content);

            // image（for epub）
            const imgs = ctx ? Array.from(ctx?.querySelectorAll('img')).map(img => `<img src="${img.getAttribute('src')}" />`) : [];

            const data: Data & { url: URL } = {
                title: document.querySelector((config as TraditionalConfig).title)?.innerText!,
                content: ctx?.innerText ? ctx.innerText! + imgs.join('\n') : '',
                next_link: document.querySelector((config as TraditionalConfig).next_link)?.getAttribute('href') || '',
                url: next_url
            }
            if ((config as TraditionalConfig).filter) try {
                (config as TraditionalConfig).filter!(document, data);
            } catch (e) {
                report_status(Status.WARNING, "filter函数执行失败", e as Error);
            }
            content = data.content;
            title = data.title?.trim();
            next_link = data.next_link;
        } else {
            const data = documentOrData as Data;
            content = data.content;
            title = data.title?.trim();
            next_link = data.next_link;
        }

        if (!content || !content.trim() || content.length < 200){
            if (previous_title.trim() == '上架感言') {
                report_status(Status.WARNING, '小说到这里免费部分已经结束了');
                break;
            }else{
                report_status(Status.ERROR, `ID: ${chapter_id} 内未找到内容`);
            }
        }

        if (content) {
            // 移除HTML标签
            content = removeHTMLTags(content);
            // 移除不可见字符
            // content = removeNonVisibleChars(content);
            // 翻译
            if (args.translate) content = convert(content);
            // 移除空格
            content = content.trim();
        }

        // 章节分卷？
        let text = '';
        if (!args.parted && previous_title && title && similarTitle(title, previous_title)) {
            // 直接写入
            text += '\n' + content;
        } else {
            text = (args.parted ? '' : (`第${chapter_id++}章 ${title || ''}\r\n`))
                + (content || '[ERROR: 内容获取失败]') + '\r\n\r\n';
            previous_title = title;
        }

        report_status(Status.DOWNLOADING, `第 ${chapter_id - 1} 章  ${title || ''} (${text.length})`);

        if (next_link) {
            next_url = new URL(next_link, next_url);
        } else {
            report_status(Status.DONE, `下载完成`);
            break;
        }

        await Promise.all([
            file.write(new TextEncoder().encode(args.parted ? text.trim() : text)),
            sleep(Math.random() * SLEEP_INTERVAL),
        ]);

        if (sig_abort?.aborted) {
            report_status(Status.CANCELLED, '下载被用户终止');
            break loop;
        }
    }

    await file.sync();
    file.close();

    if (!sig_abort?.aborted && args.epub) {
        const text = await Deno.readTextFile(fpath);
        toEpub(text, fpath, fpath.replace('.txt', '.epub'));
    }
}

async function exists(file: string): Promise<boolean> {
    try {
        await Deno.stat(file);
        return true;
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            return false;
        }
        throw e;
    }
}

function existsSync(file: string): boolean {
    try {
        Deno.statSync(file);
        return true;
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            return false;
        }
        throw e;
    }
}

if (import.meta.main) {
    if (args._.includes('h') || args.help) {
        console.log(`用法: main.ts [options] [url]
参数:
    -h, --help          显示帮助信息
    -n, --name          输出文件名，默认为index.html
    -o, --outdir        输出目录，默认为当前目录
    -s, --sleep         间隔时间防止DDOS护盾deny，单位秒，默认0
    -r, --retry         最大重试次数，默认10
    -c, --charset       网页编码，默认从网站中获取
    -t, --timeout       超时时间，单位秒，默认30
    -p, --parted        指定输入源为分完页的文本，这时不会输出自动生成的标题
    -e, --epub          输出epub文件
    -t, --translate     翻译模式，将输出的繁体翻译为简体中文
    -b, --cover         封面URL，默认为空

示例:
    main.ts -n test.html -o /path/to/output -s 5 -r 10 -c utf-8 -t -u https://www.baidu.com -t 60
`);
        Deno.exit(0);
    }

    let start_url;
    let cover: string | null = null;
    const logs = [];
    if (args.epub) logs.push('epub模式');
    if (args.translate) logs.push('翻译模式');
    if (!args.parted) logs.push('分页模式');
    if(!args.sleep) console.warn('警告：缺少-s参数，可能导致DDOS防护拦截');
    console.log.apply(console, logs);

    if (Deno.stdin.isTerminal()){
        start_url = args._[0] || prompt("请输入起始URL >> ") || '';
        cover = args.cover || prompt("请输入封面URL(可选) >> ");
    } else {
        start_url = JSON.parse(Deno.readTextFileSync('debug.json')).url;
        console.log('从debug.json中读取url:', start_url);
    }
    if (!start_url) Deno.exit(1);

    const host = new URL(start_url).hostname;
    if (await exists('lib/' + host + '.t.ts'))
        downloadNovel(start_url, true, undefined, undefined, cover || undefined);
    else if (await exists('lib/' + host + '.n.ts'))
        downloadNovel(start_url, false, undefined, undefined, cover || undefined);
    else
        console.error('未找到' + host + '的配置，站点不受支持');
}

export { 
    NoRetryError, timeout, similarTitle, tryReadTextFile, getDocument, removeIllegalPath, exists, existsSync, 
    args, downloadNovel, fetch2, getSiteCookie, setRawCookie, removeHTMLTags, removeNonVisibleChars, Status, sleep,
    forceSaveConfig
 };