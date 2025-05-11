import { DOMParser, HTMLDocument } from "jsr:@b-fuze/deno-dom";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { toEpub } from "./2epub.ts";
import { Converter } from './t2cn.js';

class NoRetryError extends Error {}

const parser = new DOMParser(),
    utf8decoder = new TextDecoder('utf-8'),
    args = parseArgs(Deno.args, {
        string: ['name', 'outdir', 'charset', 'sleep', 'retry', 'url', 'timeout'],
        boolean: ['help', 'epub', 'parted', 'translate'],
        alias: {
            h: 'help',
            n: 'name',
            o: 'outdir',
            s:'sleep',
            r:'retry',
            c: 'charset',
            u: 'url',
            t: 'timeout',
            e: 'epub',
            p: 'parted',
            l: 'translate'
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
function setRawCookie(site: string, cookie: string){
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

globalThis.onbeforeunload = function() {
    Deno.writeTextFileSync('cookie.json', JSON.stringify(cookieStore, null, 4));
}

async function fetch2(url: string | URL, options: RequestInit = {}): Promise<Response> {
    // 将存储的 Cookie 添加到请求头中
    url = typeof url === 'string' ? new URL(url) : url;
    const host = url.hostname.split('.').slice(-2).join('.');
    const cookies = Object.entries(cookieStore[host] || {})
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

    if (cookies) {
        options.headers = {
            ...options.headers,
            'Cookie': cookies,
            'User-Agent': UA,
            'Origin': url.protocol + '//' + url.host,
        };
    }

    // fix: Request with GET/HEAD method cannot have body
    if(options.body && (!options.method ||  options.method?.toLowerCase() == 'get')){
        options.method = 'POST';
    }

    // 发起请求
    options.keepalive = true;
    let response;
    for( let i = 0 ; i < 3 ; i ++ ) try{
        response = await fetch(url, options);
    }catch(e){
        console.warn('Fetch failed: ', (e as Error).message, 'Retry...');
    }
    if(!response) throw new Error('Fetch failed for ' + url.toString());

    // 从响应头中提取 Set-Cookie 并更新 cookieStore
    const setCookieHeader = response.headers.getSetCookie();
    const obj = cookieStore[host] || {};
    for (const setCookie of setCookieHeader) {
        const cookie = setCookie.split(';')[0]
        const [key, value] = cookie.split('=');
        if (key && value) {
            obj[key.trim()] = value.trim();
        }
    }
    cookieStore[host] = obj;

    return response;
}

const removeHTMLTags = (str: string) => str.replace(/<\/?[a-z]+(?:\s+[^>]+)?>/gi, '\n')
   .replace(/&nbsp;/g,'')
   .replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>')
   .replace(/&amp;/g, '&')
   .replace(/&quot;/g, '"')
   .replace(/&apos;/g, '\'')
   .replaceAll(/&#([0-9a-f]+)/gi, (_match, p1) => String.fromCharCode(parseInt(p1, 16)));

const removeIllegalPath = (path: string) => path.replaceAll(/[\/:*?"<>|]/ig, '_');

let charsetRaw = args.charset || 'utf-8';
const t_timeout = parseInt(args.timeout || '10');
async function getDocument(url: URL | string, abort?: AbortSignal, additionalHeaders?: Record<string, string>, ignore_status = false) {
    url = typeof url === 'string' ? new URL(url) : url;
    const response = await fetch2(url, {
        headers: {
            'Accept-Language': "zh-CN,zh;q=0.9",
            'Accept': 'text/html,application/xhtml+xml',
            ... additionalHeaders
        },
        keepalive: true,
        signal: timeout(t_timeout, abort),
        redirect: 'follow',
        credentials: 'include',
        referrer: url.protocol + '://' + url.host + '/',
        referrerPolicy: 'unsafe-url'
    });
    if(!response.ok && !ignore_status) throw new Error(`Failed to fetch ${url}(status: ${response.status})`);
    const data = new Uint8Array(await response.arrayBuffer());

    // 编码检查
    let charset = charsetRaw;
    if(response.headers.get('Content-Type')?.includes('charset')){
        charset = response.headers.get('Content-Type')!.match(/charset=(\S+)/)![1];
    }else{
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

    if(charset != charsetRaw){
        console.log(`[ INFO ] Document charset: ${charset}`);
        charsetRaw = charset;
    }

    const doc = parser.parseFromString(
        new TextDecoder(charset).decode(data),    
        "text/html"
    );
    return doc;
}

enum Status{
    QUEUED,
    DOWNLOADING,
    CONVERTING,
    DONE,
    ERROR,
    WARNING,
    CANCELLED
}

const convert = Converter({ from: 'tw', to: 'cn' });
/**
 * 下载并转换小说
 * @param start_url 起始URL
 * @param isTraditional 是否使用传统模式
 * @param sig_abort 可选的终止信号
 */
async function downloadNovel(
    start_url = args.url, 
    isTraditional: boolean = true,
    report_status: (status: Status, message: string, error?: Error) => void = (status, msg, e) => 
        console.log(`[ ${Status[status]} ] ${msg}`, e?.message),
    book_name: string = args.name!,
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

    loop: while(next_url) {
        if (sig_abort?.aborted) {
            report_status(Status.CANCELLED, '下载被用户终止');
            break loop;
        }

        let documentOrData: HTMLDocument | Data, retry = 1;
        while(true) {
            try {
                documentOrData = isTraditional ? await getDocument(next_url, sig_abort) : await config(next_url);
                if(!documentOrData) {
                    report_status(Status.ERROR, `ID: ${chapter_id} 内未找到内容`);
                    break loop;
                }
                break;
            } catch(e) {
                if(e instanceof NoRetryError){
                    report_status(Status.DOWNLOADING, `获取页面 ${retry ++ } 次尝试重新获取`, e as Error);
                    continue loop;
                }
                if(retry > MAX_RETRY) {
                    report_status(Status.ERROR, `获取页面失败，重试次数过多，终止程序`);
                    break loop;
                }
                report_status(Status.DOWNLOADING, `获取页面 ${retry ++ } 次尝试重新获取`, e as Error);
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
            if((config as TraditionalConfig).filter) try{
                (config as TraditionalConfig).filter!(document, data);
            }catch(e){
                report_status(Status.WARNING, "filter函数执行失败", e as Error);
            }
            content = data.content;
            title = data.title;
            next_link = data.next_link;
        } else {
            const data = documentOrData as Data;
            content = data.content;
            title = data.title;
            next_link = data.next_link;
        }

        if(!content || !content.trim())
            report_status(Status.DONE, `ID: ${chapter_id} 内未找到内容`);

        if(content){
            // 移除HTML标签
            content = removeHTMLTags(content);
            // 移除不可见字符
            // content = removeNonVisibleChars(content);
            // 翻译
            if(args.translate) content = convert(content);
            // 移除空格
            content = content.trim();
        }

        const text = (args.parted ? '' : (`第${chapter_id++}章 ${title || ''}\r\n`))
            + (content || '[ERROR: 内容获取失败]') + '\r\n\r\n';

        report_status(Status.DOWNLOADING, `第 ${chapter_id - 1} 章  ${title || ''} (${text.length})`);

        if(next_link) {
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

    if(!sig_abort?.aborted && args.epub) {
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

if(import.meta.main){
    if(args._.includes('h') || args.help){
    console.log(`用法: main.ts [options] [url]
参数:
    -h, --help          显示帮助信息
    -n, --name          输出文件名，默认为index.html
    -o, --outdir        输出目录，默认为当前目录
    -s, --sleep         间隔时间防止DDOS护盾deny，单位秒，默认0
    -r, --retry         最大重试次数，默认10
    -c, --charset       网页编码，默认从网站中获取
    -u, --url           网页地址，默认https://www.baidu.com
    -t, --timeout       超时时间，单位秒，默认30
    -p, --parted        指定输入源为分完页的文本，这时不会输出自动生成的标题
    -e, --epub          输出epub文件
    -t, --translate     翻译模式，将输出的繁体翻译为简体中文

示例:
    main.ts -n test.html -o /path/to/output -s 5 -r 10 -c utf-8 -t -u https://www.baidu.com -t 60
`);
        Deno.exit(0);
    }

    let start_url;
    if(args.epub) console.log('epub模式');
    if(args.translate) console.log('翻译模式');
    if(!args.parted) console.log('分页模式');
    if(Deno.stdin.isTerminal())
        start_url = args.url || prompt("请输入起始URL >> ") || '';
    else{
        start_url = JSON.parse(Deno.readTextFileSync('debug.json')).url;
        console.log('调试模式');
    }
    if(!start_url) Deno.exit(1);

    const host = new URL(start_url).hostname;
    if(await exists('lib/' + host + '.t.ts'))
        downloadNovel(start_url, true);
    else if(await exists('lib/' + host + '.n.ts'))
        downloadNovel(start_url, false);
    else
        console.error('未找到' + host + '的配置，站点不受支持');
}

export { NoRetryError, timeout, getDocument, removeIllegalPath, exists, args, downloadNovel, fetch2, getSiteCookie, setRawCookie, removeHTMLTags, removeNonVisibleChars, Status, sleep };