export class NoRetryError extends Error { };

/**
 * 设置超时时间，返回一个AbortSignal
 * @param sec 超时时间（秒）
 * @param abort 外部AbortSignal，可用于取消超时
 */
export function timeout(sec: number, abort?: AbortSignal) {
    const sig = new AbortController();
    setTimeout(() => sig.abort("Fetch timeout"), sec * 1000);
    abort?.addEventListener("abort", () => sig.abort("User abort"));
    return sig.signal;
}

/**
 * 类似于TS `!` 非NULL断言，但于运行时判断，NULL时抛出自定义错误信息
 */
export function nonNULL<T>(val: null | T, message: string = "Value is null or undefined"): T{
    if(!val) throw new Error(message);
    return val;
}

/**
 * 与delay相似，睡眠一定时间，但输入秒数，返回一个Promise
 */
export const sleep = (sec: number) => new Promise(resolve => setTimeout(resolve, sec * 1000));

/**
 * 将HTML转义字符还原
 */
export const fromHTML = (str: string) => str
    .replace(/&nbsp;/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replaceAll(/&#([0-9a-f]+)/gi, (_match, p1) => String.fromCharCode(parseInt(p1, 16)));

export const removeIllegalPath = (path: string) => path?.replaceAll(/[\/:*?"<>|]/ig, '_');

/**
 * 检测两个标题是否相似（用于分卷）
 * 注意顺序会影响`strict`后的判断
 * @param title1 标题1（先前的）
 * @param title2 标题2（当前的）
 * @param strict 是否严格匹配（标题末尾数字）
 */
export function similarTitle(title1: string, title2: string, strict = true) {
    title1 = title1.trim(), title2 = title2.trim();
    if(title1 == title2) return true;
    const format = /^\s*(.+?)\s*[\(（]\d(?:[\/\-]\d)?[\)）]\s*$/,
        format2 = /^\s*(.+?)\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*$/;
    const t1res = title1.match(format),
        t2res = title2.match(format);
    let res = t1res && t2res && t1res[1] == t2res[1];
    if (!res){
        const t1res2 = title1.match(format2),
            t2res2 = title2.match(format2);
        if(t1res2 && t2res2 && t1res2[1] == t2res2[1]){
            if(strict){
                const map = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳',
                    getId = (c: string) => map.indexOf(c);
                res = getId(t2res2[2]) - getId(t1res2[2]) == 1;
            }else{
                res = true;
            }
        }
    }
    return res;
}

export function yieldProxy<T extends Array<any>>() {
    let resolve: ((value: T) => void) | null = null;
    let reject: ((reason?: any) => void) | null = null;
    const queue: T[] = [];
    let ended = false;
    let endedReason: string | undefined;

    return {
        processor: (...data: T) => {
            if (ended) return;
            if (resolve) {
                resolve(data);
                resolve = null;
                reject = null;
            } else {
                queue.push(data);
            }
        },
        end: (reason?: string) => {
            ended = true;
            endedReason = reason;
            if (reject) {
                reject(new Error(reason || "Stream ended"));
                resolve = null;
                reject = null;
            }
        },
        isEnded: () => ended,
        getEndReason: () => endedReason,
        generator: (async function* () {
            while (!ended || queue.length > 0) {
                if (queue.length > 0) {
                    yield queue.shift()!;
                } else if (!ended) {
                    try {
                        yield await new Promise<T>((res, rej) => {
                            resolve = res;
                            reject = rej;
                        });
                    } catch (error) {
                        if (ended) return;
                        throw error;
                    }
                }
            }
        })()
    };
}

const __module_exists_cache: Map<string, boolean> = new Map();
export const moduleExists = async (name: string) => {
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

export async function checkIsTraditional(siteURL: URL) {
    let res = false;
    if(await moduleExists('./lib/' + siteURL.hostname + '.t.ts')) res = true;
    else if(!await moduleExists('./lib/' + siteURL.hostname + '.n.ts')) throw new Error(`找不到站点配置文件：${siteURL.hostname}`);
    return res;
}

export async function readline(prompt: string) {
    await Deno.stdout.write(new TextEncoder().encode(prompt + ' '));
    const CRLF = new TextEncoder().encode("\r\n");
    const buf = new Uint8Array(1024);
    let offset = 0;
    while (true) {
        const data = await Deno.stdin.read(buf.subarray(offset));
        if (!data) continue;
        for (let i = offset; i < offset + data; i++) {
            if (buf[i] == CRLF[1] || buf[i] == CRLF[0])
                for(const codec of ['utf-8', 'gbk', 'gb2312', 'big5']) try{
                    const line = new TextDecoder(codec, {
                        fatal: true,
                        ignoreBOM: false
                    }).decode(buf.subarray(0, i));
                    return line;
            }catch{}
        }
        offset += data;
    }
}


export async function tryReadTextFile(file: string): Promise<string> {
    const binFile = await Deno.readFile(file);
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

export function tryReadTextFileSync(file: string): string {
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

export async function useLogger<T>(generator: AsyncGenerator<T>, printer?: (data: T) => void) {
    for await (const data of generator) {
        if(printer) printer(data);
        else console.log(data);
    }
}