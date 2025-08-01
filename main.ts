import { DOMParser, Element, HTMLDocument } from "jsr:@b-fuze/deno-dom";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { toEpub } from "./2epub.ts";
import { Converter } from './t2cn.js';
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { readline } from "./exe.ts";

class NoRetryError extends Error { }

const parser = new DOMParser(),
    utf8decoder = new TextDecoder('utf-8'),
    args = parseArgs(Deno.args, {
        string: ['name', 'outdir', 'charset', 'sleep', 'retry', 'timeout', 'cover', 'error-count'],
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
    SLEEP_INTERVAL = parseInt(args.sleep || '0'),               // 间隔时间防止DDOS护盾deny
    MAX_RETRY = parseInt(args.retry ?? '10'),                   // 最大重试次数
    MAX_ERROR_COUNT = parseInt(args["error-count"] ?? '10');    // 最大错误计数

const sleep = (sec = SLEEP_INTERVAL) => new Promise(resolve => setTimeout(resolve, sec * 1000));

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

const LOOKUP_API = 'https://www.nslookup.io/api/v1/records';
async function lookupIP(domain: string) {
    // {"domain":"google.com","dnsServer":"cloudflare"}
    const fe = await fetch2(LOOKUP_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            domain,
            dnsServer: 'cloudflare'
        })
    });
    if(!fe.ok) throw new Error(`Lookup IP failed for ${domain}`);
    const data = await fe.json();
    const ips = (data.records.a.response.answer.map((i: any) => i.ipInfo.query) as string[])
        .concat(data.records.aaaa.response.answer.map((i: any) => '[' + i.ipInfo.query + ']') as string[]);
    return ips;
}

class BatchDownloader {
    // running coruntines
    private promises: Promise<void>[] = [];
    private queued: Parameters<typeof fetch2>[] = [];
    private queuedPromise: PromiseWithResolvers<Response>[] = [];

    constructor(
        private maxCo: number = 10,
        private timeoutSec = 10,
        private fetchProxy = fetch2,
        private debugLogger = (_: string) => void(0),
        private timeLogger = (_param: Parameters<typeof fetch2>, _timeStart: number, _timeEnd: number) => void(0)
    ){}

    fetch(...opts: Parameters<typeof fetch2>): Promise<Response> {
        this.queued.push(opts);
        this.queuedPromise.push(Promise.withResolvers());
        // next tick
        new Promise(rs => rs(undefined)).then(() => this.boot());
        this.debugLogger(`[ BATCH ] Queued ${opts[0]}`);
        return this.queuedPromise.at(-1)!.promise;
    }

    private async downloadCo(task: Parameters<typeof fetch2>, promise: PromiseWithResolvers<Response>){
        this.debugLogger(`[ BATCH ] Start ${task[0]}`);
        const startTime = Date.now();
        if(!task[1]) task[1] = { maxRetries: 10 };
        task[1].timeoutSec = task[1].timeoutSec ?? this.timeoutSec;
        await this.fetchProxy.apply(null, task).then(r => promise.resolve(r), e => promise.reject(e));
        this.debugLogger(`[ BATCH ] End ${task[0]} in ${Date.now() - startTime}ms`);
        this.timeLogger(task, startTime, Date.now());
    }

    private boot() {
        if(this.promises.length >= this.maxCo) return;

        // fill & start
        while(this.queued.length && this.promises.length < this.maxCo) {
            const fetchOpts = this.queued.shift()!;
            const promise = this.queuedPromise.shift()!;
            const rtpromise = this.downloadCo(fetchOpts, promise)
                    .then(() => {
                        this.promises.splice(this.promises.indexOf(rtpromise), 1);
                        this.boot();
                    })
            this.promises.push(rtpromise);
        }
    }

    set maxCoroutine(max: number) {
        this.maxCo = max;
        this.boot();
    }

    get maxCoroutine() {
        return this.maxCo;
    }
}

/**
 * Note: 不要使用timeout函数！
 */
async function fetch2(
    url: string | URL,
    options: RequestInit & { timeoutSec?: number, maxRetries?: number } = {},
    measureIP: boolean = false,
    ignoreStatus = false
): Promise<Response> {
    const originalUrl = typeof url === 'string' ? new URL(url) : url;
    let targetUrl = originalUrl;

    // IP测速逻辑
    if (measureIP) {
        const hostname = originalUrl.hostname;

        // 缓存有效检测
        if (!ipCache[hostname] || Date.now() - ipCache[hostname].updated > CACHE_TTL) {
            console.log(`[ INFO ] Measure IP for ${hostname}`);

            const validIPs = await lookupIP(hostname);
            
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
    if(!headers.has('User-Agent')) headers.set('User-Agent', UA);
    if(options.referrer) headers.set('referer', options.referrer);
    // headers.set('Origin', originalUrl.origin);

    // 修复请求方法逻辑
    if (options.body && (!options.method || /^get|head$/i.test(options.method))) {
        options.method = 'POST';
    }

    function timeout(sec: number, abort?: AbortSignal) {
        const sig = new AbortController();
        setTimeout(() => sig.abort("Fetch timeout"), sec * 1000);
        abort?.addEventListener("abort", () => sig.abort("User abort"));
        return sig.signal;
    }

    // 重试逻辑（保持原有）
    let response: Response | undefined;
    for (var i = 0; i < (options.maxRetries ?? MAX_RETRY ?? 3); i++) {
        try {
            response = await fetch(targetUrl, { 
                ...options, headers, 
                redirect: 'manual',
                signal: options.timeoutSec ? timeout(options.timeoutSec, options.signal ?? undefined) : options.signal
            });
            if(Math.floor(response.status / 100) == 5 && !ignoreStatus){
                Deno.writeTextFileSync('error.html', await response.text())
                throw new Error('Server Error: status ' + response.status);
            }
            break;
        } catch (e) {
            console.warn(`Fetch failed (attempt ${i + 1}):`, e instanceof Error ? e.message : e);
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }

    if (!response) throw new Error(`Fetch failed for ${originalUrl.href} after ${i} attempts`);

    // 从响应头中提取 Set-Cookie 并更新 cookieStore
    const setCookieHeader = response.headers.getSetCookie();
    const obj = cookieStore[host] || {};
    for (const setCookie of setCookieHeader) {
        const cookie = setCookie.split(';')[0]
        let [key, value] = cookie.split('=');
        key = key.trim();
        value = value.trim();

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
            obj[key] = value;
        }
    }
    cookieStore[host] = obj;

    if ([301, 302, 303, 307, 308].includes(response.status)) {
        // 重定向
        response = await fetch2(new URL(response.headers.get('location')!), options, measureIP);
    }

    return response;
}

const fromHTML = (str: string) => str
    .replace(/&nbsp;/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replaceAll(/&#([0-9a-f]+)/gi, (_match, p1) => String.fromCharCode(parseInt(p1, 16)));

const removeIllegalPath = (path: string) => path?.replaceAll(/[\/:*?"<>|]/ig, '_');

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
        timeoutSec: t_timeout,
        redirect: 'follow',
        credentials: 'include',
        referrer: url.protocol + '://' + url.host + '/',
        referrerPolicy: 'unsafe-url'
    }, measureIP, ignore_status);
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
        // console.log(`[ INFO ] Document charset: ${charset}`);
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

export const WRAP_EL = [
        // 基础换行元素
        'br', 'hr', 'p', 'div',
        
        // 标题类（自带换行属性）
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        
        // 预格式化文本（保留原始换行）
        'pre',
        
        // 以下元素在浏览器中表现为块级，但EPUB支持可能不稳定
        'blockquote', 'figure', 'figcaption',
    ],

    PRESERVE_EL = [
        // 行内文本样式
        'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark',
        
        // 列表容器（实际换行行为由li控制）
        'ul', 'ol', 'dl', 'dt', 'dd',
        
        // 表格单元格
        'td', 'th',
        
        // 特殊文本
        'ruby', 'rt', 'rp', 'sub', 'sup',
        
        // 代码片段（行内）
        'code', 'kbd', 'samp', 'var',
        
        // 语义化行内元素
        'cite', 'q', 'abbr', 'dfn', 'time',
    ],
    SCALABLE_STYLE = [
        'font-size',
        'font-family',
        'font-weight',
        'font-style',
        'line-height',
        'color',
        'text-align',
        'letter-spacing',
        'word-spacing',
        'text-indent'
    ],
    SPECIAL_CSS = [
        // 格式: [css属性名, 条件/值, 转换后的HTML标签]
        ['font-weight', t => parseInt(t) > 500, 'strong'],  // 加粗
        ['font-style', 'italic', 'em'],                    // 斜体
        ['text-decoration', 'underline', 'u'],             // 下划线
        ['text-decoration', 'line-through', 'del'],        // 删除线
        ['vertical-align', 'super', 'sup'],                // 上标
        ['vertical-align', 'sub', 'sub'],                  // 下标
        ['display', 'block', 'div'],                       // 块级元素
        ['display', 'inline-block', 'span'],               // 行内块
        ['text-align', 'center', 'div'],                   // 居中文本
        ['text-align', 'right', 'div']                     // 右对齐文本
    ] as Array<[
        string, 
        string | ((value: string) => boolean), 
        string
    ]>;


function parseInlineCSS(css: string){
    const rules = css.split(';').map(s => s.trim()).filter(s => s);
    const style: Record<string, string> = {};
    for(const rule of rules){
        const [key, value] = rule.split(':');
        style[key.trim()] = value.trim();
    }
    return style;
}

function getCSS(el: Element, inherit_style: Record<string, string> = {}){
    const css = el.getAttribute('style');
    const style = {...inherit_style};
    if(css){
        const el_style = parseInlineCSS(css);
        for(const key in el_style){
            style[key] = el_style[key];
        }
    }
    return style;
}

function cssToTag(css: Record<string, string>){
    for(const [cssname, cond, tag] of SPECIAL_CSS){
        const val = css[cssname];
        if(!val) continue;
        if(typeof cond == 'function' && cond(val)) return tag;
        if(val.toLowerCase() == cond) return tag;
    }
    return 'span';
}

function processContent(ctx?: Element | null | undefined, parentStyle: Record<string, string> = {}) {
    let text = '';
    if(!ctx) return text;

    for(const node of ctx.childNodes){
        if(node.nodeName.toLowerCase() == 'img'){
            const el = node as Element;
            let src;
            if(el.hasAttribute('src')){
                src = el.getAttribute('src');
            }else if(el.hasAttribute('srcset')){
                src = el.getAttribute('srcset')?.split(/\s*\,\s*/)[0]
            }else for(const attr of el.attributes){
                if(attr.name.toLowerCase().includes('src')){
                    src = attr.value;
                }else if(
                    ['.webp', '.png', '.jpg', '.jpeg'].some(ext => attr.value.endsWith(ext)) ||
                    attr.value.startsWith('http')
                ) {
                    src = attr.value;
                }
            }

            if(src){
                text += `\r\n\r\n[img=${el.getAttribute('width') || 0},${el.getAttribute('height') || 0}]${el.getAttribute('src')}[/img]\r\n\r\n`;
            }else{
                console.warn('[warn] 空图片:', el.outerHTML);
            }
        }else if(node.nodeType == node.TEXT_NODE){
            text += ' ' + node.textContent.replaceAll(/[\s^\r\n]+/g, ' ');
        }else if(node.nodeType == node.ELEMENT_NODE){
            const tag = [] as string[];
            const rtag = (node as Element).tagName.toLowerCase();
            if(PRESERVE_EL.includes(rtag)) tag.push(rtag);
            const style = getCSS(node as Element, parentStyle);
            const outertag = cssToTag(style);
            if(outertag!= 'span' && outertag != rtag) tag.push(outertag);

            let wrap = WRAP_EL.includes(rtag);
            for(let i = 0; i < tag.length; i ++){
                if(WRAP_EL.includes(tag[i])){
                    tag.splice(i, 1);
                    wrap = true;
                }
            }

            if(tag.length) text += tag.map(t => `[${t}]`).join('');
            text += processContent(node as Element, style);
            if(tag.length) text += tag.map(t => `[/${t}]`).reverse().join('');

            // 模拟display: block
            if(wrap) text += '\r\n';
            if(text[0] != '\r' && text[0] != '\n'){
                text = '\r\n' + text;
            }
        }
    }

    return text.replaceAll(/(?:\r\n){3,}/g, '\r\n\r\n');
}

async function defaultGetInfo(page: URL, cfg: Partial<MainInfo>): Promise<MainInfoResult | null> {
    if(!cfg.mainPageLike || !cfg.mainPageLike.test(page.href)){
        return null;
    }

    const mainPage = await getDocument(page);
    const firstPage = cfg.mainPageFirstChapter
        ? mainPage.querySelector(cfg.mainPageFirstChapter)?.getAttribute('href')
        : page;
    if (!firstPage) {
        throw new Error('未找到第一章');
    }

    return {
        firstPage: new URL(firstPage, page),
        cover: mainPage.querySelector(cfg.mainPageCover!)?.getAttribute('src') ?? undefined,
        book_name: mainPage.querySelector(cfg.mainPageTitle!)?.innerText ?? '',
        summary: processContent(mainPage.querySelector(cfg.mainPageSummary!)),
        jpStyle: cfg.jpStyle
    }
}

async function defaultGetInfo2(page: URL): Promise<MainInfoResult | null> {
    const cfg = (await import('./lib/' + page.hostname + '.t.ts')).default as TraditionalConfig;

    const info = await defaultGetInfo(page, cfg);
    if(cfg.infoFilter && info) await cfg.infoFilter(page, info);
    return info;
}

export const convert = Converter({ from: 'tw', to: 'cn' });

// 包装配置
async function* tWrapper(url: URL) {
    let next_url = url;
    const config = (await import('./lib/' + next_url.hostname + '.t.ts')).default as TraditionalConfig;
    while (next_url && next_url.protocol.startsWith('http')) {
        let document: HTMLDocument;

        for (let retry = 0; true; retry++) try {
            document = await (config.request ?? getDocument)(next_url);
            if (!document) {
                throw new Error(`请求失败：找不到页面 ${next_url}`);
            }
            break;
        } catch (e) {
            if (e instanceof NoRetryError || retry == MAX_RETRY) {
                throw e;
            }
        }
        const ctx = document.querySelector((config as TraditionalConfig).content);
        if(!ctx && args.parted) return; // 空页面

        const data = {
            title: document.querySelector((config as TraditionalConfig).title)?.innerText!,
            content: ctx ? processContent(ctx) : '',
            next_link: document.querySelector((config as TraditionalConfig).next_link)?.getAttribute('href') || '',
            url: next_url
        };
        if (config.filter) try {
            await config.filter(document, data);
        // deno-lint-ignore no-empty
        }catch{}
        if(!data.next_link || data.next_link.startsWith('javascript:')){
            return; // 最后一章
        }
        next_url = new URL(data.next_link, next_url);

        yield {
            content: data.content?.trim(), title: data.title?.trim()
        };
    }
}

const __traditional_cache: Record<string, boolean> = {};
const moduleExists = async (name: string) => {
    try{
        await import(name);
        return true;
    }catch{
        return false;
    }
}
async function checkIsTraditional(siteURL: URL) {
    if(siteURL.hostname in __traditional_cache) return __traditional_cache[siteURL.hostname];
    let res = false;
    if(await moduleExists('./lib/' + siteURL.hostname + '.t.ts')) res = true;
    else if(!await moduleExists('./lib/' + siteURL.hostname + '.n.ts')) throw new Error(`找不到站点配置文件：${siteURL.hostname}`);
    __traditional_cache[siteURL.hostname] = res;
    return res;
}

let ensured = false;
async function downloadNovel(
    start_url = '',
    options: {
        traditional?: boolean,
        reporter?: (status: Status, message: string, error?: Error) => void,
        book_name?: string,
        cover?: string,
        sig_abort?: AbortSignal,
        check_needs_more_data?: boolean,
        translate?: boolean,
        outdir?: string,
        disable_parted?: boolean,
        to_epub?: boolean,
        epub_options?: Parameters<typeof toEpub>[3],
        info_generated?: (info: MainInfoResult) => void,
        sleep_time?: number,
        no_input?: boolean
    }
) {
    let url = new URL(start_url);
    if(!options.reporter) options.reporter = (status, msg, e) =>
            console.log(`[ ${Status[status]} ] ${msg}`, e?.message);
    if(!options.outdir) options.outdir = args.outdir ?? 'downloads';
    if(!ensured) await ensureDir(options.outdir); 
    if(undefined === options.sleep_time) options.sleep_time = SLEEP_INTERVAL;
    const callbacks: {
        default: Callback;
        getInfo?: (url: URL) => Promise<MainInfoResult | null>;
    } = options.traditional ? {
        default: tWrapper,
        getInfo: defaultGetInfo2
    } : await import('./lib/' + url.hostname + '.n.ts');

    // 获取信息
    let summary: string | undefined;
    const info = await callbacks.getInfo?.(url);
    if(info){
        summary = info.summary;
        (!options.cover && info.cover) && (options.cover = info.cover);
        (!options.book_name && info.book_name) && (options.book_name = info.book_name);
        info.firstPage && (url = info.firstPage);
        if(options.check_needs_more_data) return false;
    }else{
        if(options.check_needs_more_data)
            if(!options.cover || !options.book_name)
                return true;
            else
                return false;
        !options.cover && !options.no_input && (options.cover = await readline("请输入封面URL(可选) >> ") || '');
        !options.book_name && !options.no_input && (options.book_name = await readline("请输入书名 >> ") || '');
        if(!options.book_name){
            throw new Error('请输入书名');
        }
    }

    // info_generated
    if(options.info_generated && info) options.info_generated(info);

    // 打开文件
    const fpath = (options.outdir || 'out') + '/' + removeIllegalPath(options.book_name ?? args.name ?? 'unknown') + '.txt';
    const file = await Deno.open(fpath, {
        create: true, write: true, truncate: true
    });
    if(summary) file.write(new TextEncoder().encode(`简介: \r\n${summary}\r\n${'-'.repeat(20)}\r\n`));

    let chapter_id = 1, previous_title = '';

    if(options.cover){
        file.write(new TextEncoder().encode(`封面: ${options.cover}\r\n`));
    }

    // 开始循环
    try{
        let errorcount = 0;
        for await (let { title, content } of callbacks.default(url)) {
            if (options.sig_abort?.aborted) {
                options.reporter(Status.CANCELLED, '下载被用户终止');
                break;
            }

            if (content) {
                if(content.trim().length >= 200){
                    // 替换HTML转义
                    content = fromHTML(content);
                    // 移除不可见字符
                    // content = removeNonVisibleChars(content);
                    // 翻译
                    if (options.translate) content = convert(content);
                    // 移除空格
                    content = content.trim();
                    errorcount = 0;
                } else {
                    options.reporter(content.length > 50 ? Status.WARNING : Status.ERROR, `ID: ${chapter_id} 内未找到内容或过少`);
                    errorcount++;
                }
            }else{
                options.reporter(Status.ERROR, `ID: ${chapter_id} 内容为空`);
                errorcount++;
            }

            if(errorcount >= MAX_ERROR_COUNT){
                options.reporter(Status.ERROR, `ID: ${chapter_id} 连续错误${MAX_ERROR_COUNT}次，放弃下载`);
                break;
            }

            // 翻译标题
            if(title && options.translate){
                title = convert(title);
            }

            // 章节分卷？
            let text = '';
            if (options.disable_parted || !title || similarTitle(title, previous_title)) {
                // 直接写入
                text += '\n' + content;
            } else {
                text = (options.disable_parted ? '' : (`\r\n第${chapter_id++}章 ${title ?? ''}\r\n`))
                    + (content ?? '[ERROR: 内容获取失败]') + '\r\n';
                previous_title = title;
            }

            options.reporter(Status.DOWNLOADING, `第 ${chapter_id - 1} 章  ${title || ''} (${text.length})`);

            if (options.sig_abort?.aborted) {
                options.reporter(Status.CANCELLED, '下载被用户终止');
                break;
            }

            await Promise.all([
                file.write(new TextEncoder().encode(text)),
                sleep(Math.random() * options.sleep_time!),
            ]);
        }
    }catch(e){
        options.reporter(Status.WARNING, '发生错误,下载结束', e as Error);
    }

    await file.sync();
    file.close();

    if (!options.sig_abort?.aborted && options.to_epub) {
        options.reporter(Status.CONVERTING, '开始生成epub文件');
        const text = await Deno.readTextFile(fpath);
        return new Promise(resolve => 
            toEpub(text, fpath, fpath.replace('.txt', '.epub'), {
                jpFormat: info?.jpStyle,
                reporter: options.reporter,
                ...(options.epub_options || {}),
                thenCB: () => resolve(undefined)
            })
        );
    }
}

async function exists(file: string): Promise<boolean> {
    // not path
    // if(removeIllegalPath(file) != file) return false;
    try {
        await Deno.stat(file);
        return true;
    } catch (e) {
        // if (e instanceof Deno.errors.NotFound) {
            return false;
        // }
        // throw e;
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

export default async function main(){
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
    -l, --translate     翻译模式，将输出的繁体翻译为简体中文
    -b, --cover         封面URL，默认为空
        --error-count   指定多少次连续少内容时退出，默认10

示例:
    main.ts -n test.html -o /path/to/output -s 5 -r 10 -c utf-8 -l -u https://www.baidu.com -t 60
`);
        Deno.exit(0);
    }

    let start_url;
    // let cover: string | null = null;
    const logs = [];
    if (args.epub) logs.push('epub模式');
    if (args.translate) logs.push('翻译模式');
    if (!args.parted) logs.push('分页模式');
    if(!args.sleep) console.warn('警告：缺少-s参数，可能导致DDOS防护拦截');
    console.log.apply(console, logs);

    if (Deno.stdin.isTerminal() || Deno.env.has('DENOVEL_TERMINAL')){
        start_url = args._[0] || await readline("请输入起始URL >> ") || '';
        // cover = args.cover || await readline("请输入封面URL(可选,自动) >> ");
    } else {
        start_url = JSON.parse(Deno.readTextFileSync('debug.json')).url;
        console.log('从debug.json中读取url:', start_url);
    }
    if (!start_url) Deno.exit(1);

    const host = new URL(start_url).hostname;
    if (await checkIsTraditional(new URL(start_url)))
        downloadNovel(start_url, {
            traditional: true,
            to_epub: args.epub,
            outdir: args.outdir,
            disable_parted: args.parted,
            translate: args.translate
        });
    else
        downloadNovel(start_url, {
            traditional: false,
            to_epub: args.epub,
            outdir: args.outdir,
            disable_parted: args.parted,
            translate: args.translate
        });
}

export { 
    NoRetryError, similarTitle, tryReadTextFile, getDocument, removeIllegalPath, exists, existsSync, moduleExists,
    args, downloadNovel, fetch2, getSiteCookie, setRawCookie, fromHTML, removeNonVisibleChars, Status, sleep, checkIsTraditional,
    forceSaveConfig,
    processContent, defaultGetInfo, BatchDownloader
};

if (import.meta.main) main();