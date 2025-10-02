import { DOMParser, Element, HTMLDocument } from "jsr:@b-fuze/deno-dom";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { toEpub } from "./2epub.ts";
import { Converter } from './t2cn.js';
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { readline } from "./exe.ts";
import { connect, ConnectResult } from "npm:puppeteer-real-browser";
import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { Buffer } from "node:buffer";
import { Agent as AgentS, AgentOptions } from 'node:https';
import { Agent } from 'node:http';
import fetchN, { Response as ResponseN, RequestInit as RequestInitN } from "npm:node-fetch";

import BlankPage from './static/blank.html' with { type: "text" };
import { Cookie } from "npm:puppeteer@22.7.1";
import { isArrayBufferView } from "node:util/types";
import { assert } from "node:console";
import { join } from "node:path";

class NoRetryError extends Error { }

const parser = new DOMParser(),
    utf8decoder = new TextDecoder('utf-8'),
    args = parseArgs(Deno.args, {
        string: ['name', 'outdir', 'charset', 'sleep', 'retry', 'timeout', 'cover', 'error-count', 'data-dir'],
        boolean: ['help', 'epub', 'parted', 'translate', 'login', 'open-config-dir'],
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
            b: 'cover',
            g: 'login',
            d: 'data-dir'
        },
        default: {
            "data-dir": (function() {
                const os = Deno.build.os;
                const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";

                let dataDir: string;

                switch (os) {
                    case "windows": // Windows
                        dataDir = Deno.env.get("APPDATA") || home;
                        break;
                    case "darwin":  // macOS
                        dataDir = join(home, "Library", "Application Support");
                        break;
                    default:        // Linux 和其他类Unix系统
                        dataDir = Deno.env.get("XDG_DATA_HOME") || join(home, ".local", "share");
                        break;
                }

                return join(dataDir, 'denovel');
            })(),
            outdir: './downloads/',
            sleep: '1',
            retry: '3',
            charset: 'utf-8',
            timeout: '10'
        }
    }),
    SLEEP_INTERVAL = parseInt(args.sleep || '0'),               // 间隔时间防止DDOS护盾deny
    MAX_RETRY = parseInt(args.retry ?? '10'),                   // 最大重试次数
    MAX_ERROR_COUNT = parseInt(args["error-count"] ?? '10'),    // 最大错误计数
    META_HEADER = ':: org.imzlh.denovel.meta';                  // 元数据标识

const sleep = (sec = SLEEP_INTERVAL) => new Promise(resolve => setTimeout(resolve, sec * 1000));

const removeNonVisibleChars = String;

function getAppDataDir(): string {
    return args['data-dir'];
}

// 用于存储 Cookie 的全局对象
await ensureDir(args['data-dir']);
const cookieStore: Record<string, Record<string, string>> =
    await exists(args['data-dir'] + '/cookie.json') ? JSON.parse(Deno.readTextFileSync(args['data-dir'] + '/cookie.json')) : {};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/132.36 (KHTML, like Gecko) Chrome/46.0.0.0 Safari/132.36 Edg/46.0.0.0';

let started_save_config = false;
function delaySaveConfig() {
    if(started_save_config) return;
    started_save_config = true;
    setTimeout(() => {
        started_save_config = false;
        forceSaveConfig();
    }, 10000);
}

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
    delaySaveConfig();
}

function getSiteCookie(site: string, cookie_name?: string) {
    const obj = cookieStore[site] || {};
    if(!cookie_name)
        return Object.entries(obj).map(([key, value]) => `${key}=${value}`).join('; ');
    for (const key in obj) {
        if (key.toLowerCase() == cookie_name.toLowerCase()) {
            return obj[key];
        }
    }
}

function setRawSetCookie(host: string, setCookieHeader: string[]) {
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
    delaySaveConfig();
}

type IPInfo = {
    ips: string[];
    fastest: string;
    updated: number;
    ttl: number;
};

const IP_CACHE_FILE = args['data-dir'] + "/ip_cache.json";
const CACHE_TTL = 3600_000; // 1小时缓存

const ipCache: Record<string, IPInfo> = await exists(IP_CACHE_FILE)
    ? JSON.parse(await Deno.readTextFile(IP_CACHE_FILE))
    : {};

// 在onbeforeunload中添加IP缓存保存
const forceSaveConfig = globalThis.onbeforeunload = function () {
    if(Object.keys(cookieStore).length)
        Deno.writeTextFileSync(args['data-dir'] + '/cookie.json', JSON.stringify(cookieStore, null, 4));
    if(Object.keys(ipCache).length)
        Deno.writeTextFileSync(IP_CACHE_FILE, JSON.stringify(ipCache, null, 4));
} as () => void;
Deno.addSignalListener("SIGINT", () => {
    forceSaveConfig();
    if(import.meta.main) Deno.exit(0);
});

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
    console.log(data.records.a.respond);
    const ips = (data.records.a.response.answer.map((i: any) => i.ipInfo.query) as string[])
        .concat(data.records.aaaa.response.answer.map((i: any) => '[' + i.ipInfo.query + ']') as string[]);
    return ips;
}

async function lookupIP2(domain: string) {
    const v4 = await Deno.resolveDns(domain, 'A').catch(() => []),
        v6 = await Deno.resolveDns(domain, 'AAAA').catch(() => []);
    return v4.map(i => i.toString()).concat(v6.map(i => '[' + i.toString() + ']'));
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

function timeout(sec: number, abort?: AbortSignal) {
    const sig = new AbortController();
    setTimeout(() => sig.abort("Fetch timeout"), sec * 1000);
    abort?.addEventListener("abort", () => sig.abort("User abort"));
    return sig.signal;
}

let browser: undefined | SimpleBrowser;
/**
 * Note: 不要使用timeout函数！
 */
async function fetch2(
    url: string | URL,
    options: RequestInit & { 
        timeoutSec?: number, maxRetries?: number, 
        cloudflareBypass?: boolean, ignoreStatus?: boolean ,
        measureIP?: boolean, specificIP?: string,
    } = {},
): Promise<Response> {
    const targetUrl = typeof url === 'string' ? new URL(url) : url;

    // IP测速逻辑
    if (options.measureIP) {
        const hostname = targetUrl.hostname;

        // 缓存有效检测
        if (!ipCache[hostname] || Date.now() - ipCache[hostname].updated > CACHE_TTL) {
            console.log(`[ INFO ] Measure IP for ${hostname}`);
            console.warn(`[ WARN ] Please use "--accept-insecure-certs" to allow insecure connection to measure IP`)

            const validIPs = await lookupIP2(hostname);
            
            console.log(`[ INFO ] Valid IPs for ${hostname}:`, validIPs);

            if (validIPs.length > 1) try{
                // 并行测试IP速度
                const node = await Promise.any(
                    validIPs.map(async ip => {
                        const start = Date.now();
                        await fetch(`${targetUrl.protocol}//${ip.includes(':') ? `[${ip}]` : ip}/`, {
                            headers: { Host: hostname },
                            keepalive: false,
                            signal: timeout(10)
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
                options.specificIP = fastest;
                console.log(`[ INFO ] Use fastest IP ${fastest}(${node.latency}) for ${hostname}`);
            }catch(e){
                console.error(e);
                throw new Error(`[ ERROR ] No valid IP for ${hostname}:`);
            }
        } else if (ipCache[hostname]) {
            console.log(`[ INFO ] Use cached IP ${ipCache[hostname].fastest} for ${hostname}`);
            options.specificIP = ipCache[hostname].fastest;
        } else {
            console.log(`[ INFO ] No or only one valid IP for ${hostname}`);
        }
    }

    const host = targetUrl.hostname.split('.').slice(-2).join('.');
    const cookies = Object.entries(cookieStore[host] || {})
        .map(([k, v]) => `${k}=${v}`).join('; ');

    // 确保Host头正确
    const headers = new Headers(options.headers);
    if (options.measureIP && targetUrl.hostname !== targetUrl.hostname) {
        headers.set('Host', targetUrl.hostname);
    }
    headers.set('Cookie', cookies + (cookies ? ';': '') +
        (headers.has('Cookie') ? ';'+ headers.get('Cookie') : '')
    );
    if(!headers.has('User-Agent')) headers.set('User-Agent', UA);
    if(options.referrer) headers.set('referer', options.referrer);
    // headers.set('Origin', originalUrl.origin);

    // 修复请求方法逻辑
    if (options.body && (!options.method || /^get|head$/i.test(options.method))) {
        options.method = 'POST';
    }

    // 重试逻辑（保持原有）
    let response: Response | ResponseN | undefined;
    for (var i = 0; i < (options.maxRetries ?? MAX_RETRY ?? 3); i++) {
        try {
            if(options.signal?.aborted)
                throw new Error('Aborted');

            if(options.specificIP){
                // deno fetch doesnot support specific IP
                // use node-fetch instead
                const ip = options.specificIP,
                    ipFamily = ip.startsWith('[') ? 6 : 4,
                    ipReal = ipFamily == 6 ? ip.slice(1, -1) : ip;
                let body = options.body;
                if(body instanceof ArrayBuffer)
                    body = new Blob([body]);
                if(isArrayBufferView(body))
                    if(body.buffer instanceof ArrayBuffer)
                        body = new Blob([body.buffer]);
                    else throw new Error('SharedArrayBuffer body is not supported');
                response = await fetchN(targetUrl.href, {
                    ...options,
                    body: body as RequestInitN['body'],
                    agent(url){
                        const agopt: AgentOptions = {
                            lookup(hostname, options, callback){
                                if(hostname != targetUrl.hostname)
                                    return callback(null, [], 4);
                                return callback(null, ipReal, ipFamily);
                            },
                            family: ipFamily
                        };
                        return url.protocol == 'https:'? new AgentS(agopt) : new Agent(agopt);
                    }
                });
            }else{
                // use deno native fetch
                response = await fetch(targetUrl, { 
                    ...options, headers, 
                    redirect: 'manual',
                    signal: options.timeoutSec ? timeout(options.timeoutSec, options.signal ?? undefined) : options.signal
                });
            }
            if(Math.floor(response.status / 100) == 5 && !options.ignoreStatus){
                Deno.writeTextFileSync('error.html', await response.text())
                throw new Error('Server Error: status ' + response.status);
            }

            // cloudflare
            if(
                response.status == 403 && response.headers.get('Server') == 'cloudflare' && 
                options.cloudflareBypass && (await response.text()).includes('Just a moment...')
            ){
                if(!browser) browser = new SimpleBrowser();
                await browser.init();
                console.log('请等待，并进行浏览器中的验证！');
                await browser.launch(new URL(url));
                i --;   // force retry
            }

            break;
        } catch (e) {
            console.warn(`Fetch failed (attempt ${i + 1}):`, e instanceof Error ? e.message : e);
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }

    if (!response) throw new Error(`Fetch failed for ${targetUrl.href} after ${i} attempts`);

    // 从响应头中提取 Set-Cookie 并更新 cookieStore
    const setCookieHeader = response.headers instanceof Headers
        ? response.headers.getSetCookie()
        : response.headers.raw()['set-cookie'] ?? [];
    setRawSetCookie(host, setCookieHeader);

    if ([301, 302, 303, 307, 308].includes(response.status) && (!options.redirect || options.redirect === 'follow')) {
        // 重定向
        response = await fetch2(new URL(response.headers.get('location')!, url), {
            ...options,
            referrer: targetUrl.href
        });
    }

    return response as Response;
}

class SimpleBrowser {
    // private server;
    private browser: undefined | ConnectResult;

    // constructor(
    //     private port: number = 8123,
    // ) {
    //     const serv = new HTTPProxyServer();
    //     serv.start(port, '127.0.0.1');
    //     this.server = serv;
    // }

    async init() {
        if (this.browser) return;
        this.browser = await connect({
            args: [
                // '--proxy-server=http://localhost:' + this.port,
                // '--ignore-certificate-errors',
                // '--start-maximized'
            ],
            connectOption: {
                acceptInsecureCerts: true
            },
            customConfig: {
                chromePath: Deno.build.os == 'windows'
                    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
                    : '/usr/bin/env chrome',
                handleSIGINT: true,
                startingUrl: 'data:text/html,' + encodeURIComponent(BlankPage.replaceAll(/\s+/g, ' '))
            },
            headless: false,
            turnstile: true,
        });
    }

    async launch(url: URL, waitFor: boolean = true) {
        const page = await this.browser?.browser.newPage();
        if (!page) throw new Error('Browser not initialized');
        page.setViewport(null);

        // handle request
        page.setRequestInterception(true);
        page.on('request', async req => {
            const url = new URL(req.url());
            if(url.host.includes('google')){
                req.abort('blockedbyclient');
                return;
            }
            if(!url.protocol.startsWith('http')){
                req.continue();
                return;
            }
            if(url.hostname == 'internal.local'){
                console.log('BROADCAST', url.pathname);
                switch(url.pathname){
                    case '/set-cookie': {
                        const cookies = req.postData()!;
                        const site = url.searchParams.get('site')!.split('.').slice(-2).join('.');
                        setRawSetCookie(site, cookies.split('\n'));
                        req.abort('aborted');
                        return;
                    }

                    default: {
                        req.abort('blockedbyclient');
                        return;
                    }
                }
            }

            try{
                console.log('PROXY', req.method(), url.href);
                const res = await fetch2(url.href, {
                    method: req.method(),
                    headers: req.headers(),
                    body: req.postData(),
                    signal: timeout(10),
                    redirect: 'manual',
                    maxRetries: 1,
                    ignoreStatus: true
                });
                req.respond({
                    status: res.status,
                    headers: Object.fromEntries(res.headers.entries()),
                    body: await res.arrayBuffer().then(r => Buffer.from(r)).catch(_ => undefined),
                    contentType: res.headers.get('Content-Type') ?? 'text/plain'
                });
            }catch(e){
                req.abort('failed');
            }
        });
        // init DOMCookies
        const site = url.hostname.split('.').slice(-2).join('.');
        this.browser?.browser.setCookie(...Object.entries(cookieStore[site] ?? {}).map(([k, v]) => ({
            name: k,
            value: v,
            domain: site,
            path: '/',
            expires: -1,
            size: 0,
            httpOnly: false,
            secure: url.protocol == 'https:'
        })) as Cookie[]);

        try {
            await page.goto(url.href);
            // await page.goto('https://bot-detector.rebrowser.net/')
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { value: false })
                Object.defineProperty(navigator, 'languages', {
                    get: function () {
                        return ['zh-CN', 'zh-TW', 'en-US'];
                    },
                });
                let __cookie_store = document.cookie;
                Object.defineProperty(document, 'cookie', {
                    get: function () {
                        return __cookie_store;
                    },
                    set: function (value) {
                        __cookie_store = value;
                        // will be blocked
                        fetch('https://internal.local/set-cookie?site=' + encodeURIComponent(location.hostname), {
                            method: 'POST',
                            body: __cookie_store,
                            mode: 'cors'
                        });
                    }
                });
            });
            if(waitFor){
                await page.waitForNavigation({
                    waitUntil: 'load'
                });
                console.log('完成值守，似乎通过验证？');
            }else{
                await new Promise(rs => page.on('close',rs));
            }
        } catch (e) {
            console.error(e);
        } finally {
            await delay(1000).then(() => page.close({ runBeforeUnload: false }));
        }
    }

    async destroy() {
        // this.server.stop();
        await this.browser?.browser.close();
    }
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
async function getDocument(_url: URL | string, options?: {
    abort?: AbortSignal, additionalHeaders?: Record<string, string>, ignore_status?: boolean, measureIP?: boolean,
    networkOverride?: typeof fetch2
}) {
    const url = new URL(_url);
    const response = await (options?.networkOverride ?? fetch2)(url, {
        headers: {
            'Accept-Language': "zh-CN,zh;q=0.9",
            'Accept': 'text/html,application/xhtml+xml',
            ...(options?.additionalHeaders ?? {})
        },
        keepalive: true,
        timeoutSec: t_timeout,
        redirect: 'follow',
        credentials: 'include',
        referrer: url.protocol + '://' + url.host + '/',
        referrerPolicy: 'unsafe-url',
        signal: options?.abort,
        cloudflareBypass: true,
        measureIP: options?.measureIP,
        ignoreStatus: options?.ignore_status,
    });
    if (!response.ok && !options?.ignore_status){
        console.log(await response.text());
        throw new Error(`Failed to fetch ${url}(status: ${response.status})`);
    }
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
    Object.defineProperty(doc, 'documentURI', { value: url });
    return doc;
}

function tryReadTextFile(file: string): string {
    const binFile = Deno.readFileSync(file);
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(binFile);
    }catch{ try{
        console.log('try UTF-16')
        return new TextDecoder('utf-16', { fatal: true }).decode(binFile);
    } catch {
        console.log('try gb18030(GBK+)')
        return new TextDecoder('gb18030', { fatal: true }).decode(binFile);
    }}
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
    title1 = title1.trim(), title2 = title2.trim();
    if(title1 == title2) return true;
    const format = /^\s*(.+?)\s*\(\d(?:\/\d)?\)\s*$/;
    const t1res = title1.match(format),
        t2res = title2.match(format);
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
        'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark', 'center',
        
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

        // 特殊元素
        'a', 'video', 'audio',

        // denovel 特色标签
        'right', 'tcenter'
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
        ['text-align', 'center', 'tcenter'],                // 居中文本
        ['text-align', 'right', 'right']                   // 右对齐文本
    ] as Array<[
        string, 
        string | ((value: string) => boolean), 
        string
    ]>,

    PRESERVE_ATTR_TAGS = [
        ['a', 'href'],
        ['video', 'src'],
        ['audio', 'src']
    ],

    IGNORE_TAGS = [
        'script', 'noscript', 'style',                      // CSS/JS
        'iframe', 'object', 'embed', 'applet', 'canvas',    // embed tags
        'input', 'button', 'form',                          // form tags
        'comment'                                           // denovel 注释    
    ];


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

function processContent(
    ctx?: Element | null | undefined, parentStyle: Record<string, string> = {},
    relativeURL?: URL
) {
    let text = '';
    if(!ctx) return text;

    for(const node of ctx.childNodes){
        const nodeName = node.nodeName.toLowerCase();
        if(nodeName == 'img'){
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
        }else if(nodeName == 'a'){
            const el = node as Element;
            if(el.hasAttribute('href')){
                let href = new URL(el.getAttribute('href')!, relativeURL).href;
                if(href.startsWith('/') || /^https?:\/\//.test(href)){
                    href = href.replaceAll(']', '&#93;');
                    text += `[link=${href}]${processContent(el, parentStyle, relativeURL)}[/link]`;
                }else{
                    text += processContent(el, parentStyle, relativeURL);
                }
            }else{
                text += processContent(el, parentStyle, relativeURL);
            }
        }else if(node.nodeType == node.TEXT_NODE){
            text += ' ' + node.textContent.replaceAll(/[\s^\r\n]+/g, ' ');
        }else if(node.nodeType == node.ELEMENT_NODE){
            const tag = [] as string[];
            const rtag = (node as Element).tagName.toLowerCase();

            if(IGNORE_TAGS.includes(rtag)) continue;
            if(PRESERVE_EL.includes(rtag)) tag.push(rtag);
            const style = getCSS(node as Element, parentStyle);
            const outertag = cssToTag(style);
            if(outertag!= 'span' && outertag != rtag) tag.push(outertag);

            let wrap = WRAP_EL.includes(rtag);
            for(let i = 0; i < tag.length; i ++){
                if(WRAP_EL.includes(tag[i])){
                    console.log('wrap: tag=' , tag, 'outertag=', outertag, 'wrap=', wrap);
                    tag.splice(i, 1);
                    wrap = true;
                }
            }

            const inner = processContent(node as Element, style, relativeURL);
            if(!inner.trim()){
                if(wrap) text += '\r\n';
                continue;   // skip tags
            }

            const tags2 = Array.from(new Set(tag).values());
            if(tag.length) text += tags2.map(t => `[${t}]`).join('');
            text += inner;
            if(tag.length) text += tags2.map(t => `[/${t}]`).reverse().join('');

            // 模拟display: block
            if(wrap) text += '\r\n';
            // if(text[0] != '\r' && text[0] != '\n'){
            //     text = '\r\n' + text;
            // }
        }
    }

    return text.replaceAll(/(?:\r\n){3,}/g, '\r\n\r\n');
}

async function defaultGetInfo(page: URL, cfg: Partial<MainInfo & { networkHandler?: typeof fetch }>): Promise<MainInfoResult | null> {
    if(!cfg.mainPageLike || !cfg.mainPageLike.test(page.href)){
        return null;
    }

    const mainPage = await getDocument(page, {
        networkOverride: cfg.networkHandler
    });
    const firstPage = cfg.mainPageFirstChapter
        ? mainPage.querySelector(cfg.mainPageFirstChapter)?.getAttribute('href')
        : page;

    const coverEl = mainPage.querySelector(cfg.mainPageCover!);
    let cover = coverEl?.getAttribute('src') as undefined | string;
    if(coverEl){
        // 极端模式：遍历所有attribute，找到第一个以图片结尾的
        for(const attr of coverEl.attributes){
            if(attr.textContent.split('.').pop()?.toLowerCase()! in ['jpg', 'png', 'jpeg', 'gif', 'webp']){
                cover = attr.textContent;
                break;
            }
        }
    }
    const info = {
        firstPage: firstPage ? new URL(firstPage, page) : undefined,
        cover: cover ? new URL(cover, page).href : undefined,
        book_name: mainPage.querySelector(cfg.mainPageTitle!)?.innerText ?? '',
        summary: processContent(mainPage.querySelector(cfg.mainPageSummary!), {}, firstPage ? new URL(firstPage, page) : undefined),
        jpStyle: cfg.jpStyle,
        author: cfg.mainPageAuthor ? mainPage.querySelector(cfg.mainPageAuthor)?.innerText : undefined
    } as MainInfoResult;
    if(cfg.mainPageFilter) await cfg.mainPageFilter(page, mainPage, info);

    if (!info.firstPage) {
        throw new Error('未找到第一章');
    }
    return info;
}

async function defaultGetInfo2(page: URL, networkHandler?: typeof fetch): Promise<MainInfoResult | null> {
    const mod = await import('./lib/' + page.hostname + '.t.ts');
    const cfg = mod.default as TraditionalConfig;
    if(!cfg) return null;

    const info = await defaultGetInfo(page, { ...cfg, networkHandler });
    if(cfg.infoFilter && info) await cfg.infoFilter(page, info);
    return info;
}

export const convert = Converter({ from: 'tw', to: 'cn' });

// 包装配置
async function* tWrapper(url: URL) {
    let next_url: undefined | URL = url;
    const config = (await import('./lib/' + next_url.hostname + '.t.ts')).default as TraditionalConfig;
    if(!config) throw new Error(`空站点配置文件：${next_url.hostname}`);
    // let __ = false; // debug purpose
    while (next_url && next_url.protocol.startsWith('http')) {
        let document: HTMLDocument;
        // if(__) throw new Error('debug purpose');

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
        const ctx = document.querySelector(config.content);
        if(!ctx && args.parted) return; // 空页面

        const data: Data & { url: URL } = {
            title: document.querySelector(config.title)?.innerText!,
            content: ctx ? processContent(ctx, {}, next_url) : '',
            next_link: document.querySelector(config.next_link)?.getAttribute('href') || '',
            url: next_url
        };
        if (config.filter) try {
            await config.filter(document, data);
        }catch(e){
            if(e instanceof NoRetryError) throw e;
            console.warn(`[warn] 过滤器出错：${next_url} ${e instanceof Error ? e.message : e}`);
        }
        next_url = data.next_link ? new URL(data.next_link, next_url) : undefined;

        yield {
            content: data.content?.trim(), title: data.title?.trim(),
            next_url
        };
        // __ = true;
    }
}

const __module_exists_cache: Map<string, boolean> = new Map();
const moduleExists = async (name: string) => {
    if(__module_exists_cache.has(name)) return __module_exists_cache.get(name)!;
    try{
        await import(name);
        __module_exists_cache.set(name, true);
        return true;
    }catch(e){
        if(!(e instanceof Error) || !e.message.includes('not found')) console.error(e);
        __module_exists_cache.set(name, false);
        return false;
    }
}
async function checkIsTraditional(siteURL: URL) {
    let res = false;
    if(await moduleExists('./lib/' + siteURL.hostname + '.t.ts')) res = true;
    else if(!await moduleExists('./lib/' + siteURL.hostname + '.n.ts')) throw new Error(`找不到站点配置文件：${siteURL.hostname}`);
    return res;
}

function downloadFromTXT(fpath: string) {
    const content = tryReadTextFile(fpath).trimEnd().split(/[\r\n]+/);
    let text = '';
    // 最后一行理应为[/comment]
    assert(content.pop() == '[/comment]', '找不到denovel META。如果上一次中断，请手动打开txt并删除最后一次[/comment]后内容');
    for(let i = content.length - 1; i >= 0; i--){
        if(content[i] == META_HEADER) break;
        text = content[i] + text;
    }
    if(!text) throw new Error('未找到denovel META');
    let res: Parameters<typeof downloadNovel>[1];
    try{
        res = JSON.parse(text);
        if(!res.last_chapter_url) throw new Error('缺少last_chapter_url');
    }catch(e){
        throw new Error('META解析失败：' + (e instanceof Error ? e.message : e));
    }
    return downloadNovel(res.last_chapter_url, {
        ...res,
        hide_meta: true,
        skip_first_chapter: true,
        disable_overwrite: true
    });
}

/**
 * 下载小说主程序。对于传统配置，请使用`tWrapper`兼容函数。
 * 
 * ## 历史
 *  - v1: 第一个版本，使用`fetch`函数下载页面，并使用`DOMParser`解析内容。
 *  - v1.1: 支持epub
 *  - v2: 完成重构，放弃维护两个函数，使用`tWrapper`兼容传统配置
 *  - v2.1: 支持CSS/HTML标签解析，如保留粗体格式<b>或`font-weight: bold`
 *  - v3: 现在可以保存进度，方便下次继续下载。
 * @param start_url 
 * @param options 
 * @returns 
 */
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
        no_input?: boolean,
        author?: string,
        summary?: string,
        /**
         * 内部使用，无需设置
         */
        previous_title?: string,
        /**
         * 内部使用，无需设置
         */
        chapter_id?: number,
        /**
         * 内部使用，无需设置
         */
        last_chapter_url?: string,
        /**
         * 内部使用，无需设置
         */
        timestrap?: number,
        hide_meta?: boolean,
        skip_first_chapter?: boolean,
        disable_overwrite?: boolean,
    }
) {
    let url = new URL(start_url);
    if(!options.reporter) options.reporter = (status, msg, e) =>
            console.log(`[ ${Status[status]} ] ${msg}`, e?.message);
    if(!options.outdir) options.outdir = args.outdir;
    await ensureDir(options.outdir); 
    if(undefined === options.sleep_time) options.sleep_time = SLEEP_INTERVAL;
    const callbacks: {
        default: Callback;
        getInfo?: typeof defaultGetInfo2;
        networkHandler?: typeof fetch;
    } = options.traditional ? {
        default: tWrapper,
        getInfo: defaultGetInfo2,
        networkHandler: (await import('./lib/' + url.hostname + '.t.ts')).networkHandler
    } : await import('./lib/' + url.hostname + '.n.ts');

    // 获取信息
    const info = options.hide_meta ? undefined : await callbacks.getInfo?.(url, callbacks.networkHandler);
    if(info){
        options.summary = options.summary ?? info.summary;
        (!options.cover && info.cover) && (options.cover = info.cover);
        (!options.book_name && info.book_name) && (options.book_name = info.book_name);
        (!options.author && info.author) && (options.author = info.author);
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
    const fpath = (options.outdir ?? 'out') + '/' + removeIllegalPath(options.book_name ?? args.name ?? 'unknown') + '.txt';
    const file = await Deno.open(fpath, {
        create: true, append: options.disable_overwrite, write: !options.disable_overwrite, read: false, truncate: !options.disable_overwrite
    });
    if(!options.hide_meta){
        file.write(new TextEncoder().encode(options.book_name + '\r\n'));
        if(options.author) file.write(new TextEncoder().encode(`作者: ${options.author}\r\n`));
        if(options.summary) file.write(new TextEncoder().encode(`简介: \r\n${options.summary}\r\n${'-'.repeat(20)}\r\n`));
        if(options.cover) file.write(new TextEncoder().encode(`封面: ${options.cover}\r\n`));
    }

    if(!options.chapter_id) options.chapter_id = 1;
    options.timestrap = Date.now();
    options.last_chapter_url = url.href;
    let real_writed = 0;
    // 开始循环
    try{
        let errorcount = 0;
        for await (let { title, content, next_link } of callbacks.default(url)) {
            if (options.sig_abort?.aborted) {
                options.reporter(Status.CANCELLED, '下载被用户终止');
                break;
            }

            if (options.skip_first_chapter){
                options.skip_first_chapter = undefined;
                options.reporter(Status.DOWNLOADING, '跳过第一章: ' + title);
                continue;
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
                    options.reporter(content.length > 50 ? Status.WARNING : Status.ERROR, `ID: ${options.chapter_id} 内未找到内容或过少`);
                    errorcount++;
                }
            }else{
                options.reporter(Status.ERROR, `ID: ${options.chapter_id} 内容为空`);
                errorcount++;
            }

            if(errorcount >= MAX_ERROR_COUNT){
                options.reporter(Status.ERROR, `ID: ${options.chapter_id} 连续错误${MAX_ERROR_COUNT}次，放弃下载`);
                break;
            }

            // 翻译标题
            if(title && options.translate){
                title = convert(title);
            }

            // 章节分卷？
            let text = '';
            if (options.disable_parted || !title || similarTitle(title, options.previous_title ?? '')) {
                // 直接写入
                text += '\n' + content;
                options.last_chapter_url = next_link?.toString();
            } else {
                text = (options.disable_parted ? '' : (`\r\n第${options.chapter_id++}章 ${title ?? ''}\r\n`))
                    + (content ?? '[ERROR: 内容获取失败]') + '\r\n';
                options.previous_title = title;
            }

            options.reporter(Status.DOWNLOADING, `第 ${options.chapter_id - 1} 章  ${title || ''} (${text.length})`);

            if (options.sig_abort?.aborted) {
                options.reporter(Status.CANCELLED, '下载被用户终止');
                break;
            }

            real_writed ++;
            await Promise.all([
                file.write(new TextEncoder().encode(text)),
                sleep(Math.random() * options.sleep_time!),
            ]);
        }
    }catch(e){
        options.reporter(Status.WARNING, '发生错误,下载结束', e as Error);
    }

    // meta: 必须写入，否则无法识别
    if(real_writed){
        await file.write(new TextEncoder().encode(
            '\r\n[comment]' + 
            '\r\n' + 
            META_HEADER + '\r\n' + JSON.stringify(options, null, 4) +
            '\r\n' +
            '[/comment]'
        ));
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
                networkHandler: callbacks.networkHandler,
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

async function launchBrowser(url: URL, waitForFirstNavigation = true) {
    if(!browser) browser = new SimpleBrowser();
    await browser.init();
    return browser.launch(url, waitForFirstNavigation);
}

export default async function main(){
    if (args._.includes('help') || args.help) {
        console.log(`用法: main.ts [options] [url|file]
参数:
    -h, --help              显示帮助信息
    -n, --name              输出文件名，默认为index.html
    -o, --outdir            输出目录，默认为当前目录
    -s, --sleep             间隔时间防止DDOS护盾deny，单位秒，默认0
    -r, --retry             最大重试次数，默认10
    -c, --charset           网页编码，默认从网站中获取
    -t, --timeout           超时时间，单位秒，默认30
    -p, --parted            指定输入源为分完页的文本，这时不会输出自动生成的标题
    -e, --epub              输出epub文件
    -l, --translate         翻译模式，将输出的繁体翻译为简体中文
    -b, --cover             封面URL，默认为空
        --error-count       指定多少次连续少内容时退出，默认10
    -g, --login             打开浏览器窗格。在这个窗格中，任何cookie都会被记录下来
                            特别适用于登陆账号！
    -d, --data-dir          指定配置文件夹
        --open-config-dir   打开配置目录，用于备份/恢复配置。

示例:
    - 下载来自www.baidu.com的繁体简体中文小说，输出到"output/test.txt"中
      main.ts -n test.txt -o /path/to/output -s 5 -r 10 -c utf-8 -l -u https://www.baidu.com -t 60
    - 更新由denovel生成的"a.txt"文件(小说有更新，继续下载。无需再次指定参数，全自动)
      main.ts a.txt
`);
        Deno.exit(0);
    }

    if(args['open-config-dir']){
        if(Deno.build.os == 'windows'){
            new Deno.Command('explorer', {
                args: [args['data-dir']]
            }).outputSync();
        }else if(Deno.build.os == 'linux'){
            new Deno.Command('xdg-open', {
                args: [args['data-dir']]
            }).outputSync();
        }else if(Deno.build.os == 'darwin'){
            new Deno.Command('open', {
                args: [args['data-dir']]
            }).outputSync();
        }else{
            console.error('未知操作系统，无法打开配置目录');
        }
        Deno.exit(0);
    }

    const arg_0 = args._[0];
    if(args.login){
        console.log('请在浏览器中自行打开网页，完成登陆操作。一切cookie都会被记录下来');
        console.log('完成后，关闭打开的浏览器窗口，程序将自动退出');
        browser = new SimpleBrowser();
        await browser.init();

        if(arg_0){
            await browser.launch(new URL(arg_0 as string), false);
        }else{
            await browser.launch(new URL('data:text/html; charset=utf-8,<h1>打开任意网页</h1><p>在这一页内产生的cookie将被记录下来</p>'), false);
        }

        console.log('完成！现在你可以尝试新世界了！');
        Deno.exit(0);
    }

    if(typeof arg_0 === 'string' && arg_0.endsWith('.txt')){
        console.log('从文件下载小说');
        await downloadFromTXT(arg_0);
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
        start_url = arg_0 || await readline("请输入起始URL >> ") || '';
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
    args, downloadNovel, downloadFromTXT, fetch2, getSiteCookie, setRawCookie, fromHTML, removeNonVisibleChars, Status, sleep, checkIsTraditional,
    forceSaveConfig, getAppDataDir,
    processContent, defaultGetInfo, BatchDownloader, launchBrowser, tWrapper as traditionalAsyncWrapper
};

if (import.meta.main) main();