import { delay } from "https://deno.land/std@0.92.0/async/mod.ts";
import { fetch2 } from "./main.ts";
import { off } from "node:process";
import { read } from "node:fs";

Deno.env.set('PUPPETEER_SKIP_DOWNLOAD', '1');
const puppeteer = (await import("https://deno.land/x/puppeteer_plus/mod.ts")).default;

async function* line_reader(pipe: ReadableStreamDefaultReader<Uint8Array>) {
    let cache: Uint8Array | undefined;
    const CRLF = new TextEncoder().encode('\r\n');
    while (true) {
        const { value, done } = await pipe.read();
        if (!value || done) break;
        let prevOffset = 0;
        for (let i = 0; i < value.length; i++) {
            if (value[i] == CRLF[0] && value[i + 1] == CRLF[1]) {
                let data;
                if (cache) {
                    data = new Uint8Array([
                        ...cache,
                        ...value.slice(prevOffset, i - 2)
                    ]);
                    cache = undefined;
                } else {
                    data = value.slice(prevOffset, i - 2);
                }

                const text = new TextDecoder().decode(data);
                yield text;
                prevOffset = i + 2;
            }
        }

        if (prevOffset < value.length) {
            if (cache) {
                cache = new Uint8Array([
                    ...cache,
                    ...value.slice(prevOffset)
                ]);
            } else {
                cache = value.slice(prevOffset);
            }
        }
    }
}

async function* pipeLineReader(conn: Deno.Conn, abort: AbortSignal) {
    const buffer = new Uint8Array(1);
    let lineBuffer: number[] = [];
    
    while (!abort.aborted) {
        const readBytes = await conn.read(buffer);
        if (readBytes === null) break;

        const char = buffer[0];
        lineBuffer.push(char);

        // 检测CRLF序列
        if (lineBuffer.length >= 2 && 
            lineBuffer[lineBuffer.length-2] === 0x0D &&
            lineBuffer[lineBuffer.length-1] === 0x0A) {
            
            // 剔除CRLF后生成消息
            const line = new Uint8Array(lineBuffer.slice(0, -2));
            yield new TextDecoder().decode(line);
            
            lineBuffer = [];  // 重置行缓冲
        }
    }

    // 处理残留数据
    if (lineBuffer.length > 0) {
        yield new TextDecoder().decode(new Uint8Array(lineBuffer));
    }
}


async function parseHTTP(conn: Deno.Conn) {
    const info = {
        method: 'GET',
        path: '',
        headers: new Headers(),
        body: undefined as undefined | Uint8Array,
        version: 'HTTP/1.1'
    };
    let currentHeader: string | null = null; // 处理多行头值

    try {
        const abort = new AbortController();
        const reader = pipeLineReader(conn, abort.signal);
        let state: 'start-line' | 'headers' | 'body' = 'start-line';

        for await (const value of reader) {
            if (state === 'start-line') {
                // 强化请求行校验
                const parts = value.match(/^([A-Z]+)\s+(\S+)\s+HTTP\/(\d\.\d)$/);
                if (!parts) throw new Error(`Invalid start-line: ${value}`);
                
                [info.method, info.path, info.version] = parts.slice(1);
                state = 'headers';

            } else if (state === 'headers') {
                if (value === '') {
                    // 校验必需头部
                    if (info.version === '1.1' && !info.headers.has('Host')) {
                        throw new Error('Missing Host header');
                    }
                    abort.abort();
                    state = 'body';
                    continue;
                }

                // 处理多行头值
                if (/^[\t ]+/.test(value) && currentHeader) {
                    info.headers.append(currentHeader, value.trim());
                } else {
                    const colonIdx = value.indexOf(':');
                    if (colonIdx === -1) throw new Error(`Invalid header: ${value}`);
                    
                    currentHeader = value.slice(0, colonIdx).trim();
                    const headerValue = value.slice(colonIdx + 1).trim();
                    info.headers.append(currentHeader, headerValue);
                }

            } else if (state === 'body') {
                // 根据 RFC 处理正文逻辑
                const transferEncoding = info.headers.get('transfer-encoding');
                const contentLength = parseInt(info.headers.get('content-length') || '0', 10);

                if (transferEncoding === 'chunked') {
                    throw new Error('Chunked encoding not implemented');
                } else if (contentLength > 0) {
                    // 需实现根据 content-length 读取
                    info.body = new TextEncoder().encode(value);
                }
                break;
            }
        }
    } catch (err) {
        console.error(`HTTP Parsing Error: ${err instanceof Error ? err.message : err}`);
        throw err;
    }

    return info;
}


async function writeResponse(resp: Response, conn: Deno.Conn) {
    const respPipe = conn.writable.getWriter();
    const write = (chunk: string) => respPipe.write(new TextEncoder().encode(chunk));

    write(`HTTP/${resp.status} ${resp.statusText}\r\n`);
    for (const [key, val] of resp.headers) {
        write(`${key}: ${val}\r\n`);
    }
    write('\r\n');
    conn.write(await resp.bytes());
    await respPipe.close();
    conn.close();
}

export class SimpleBrowser {
    private socket;
    private browser: undefined | typeof puppeteer.Browser.prototype;

    constructor(
        private port: number = 8123,
    ) {
        const sock = this.socket = Deno.listen({ port, hostname: "localhost" });
        (async () => {
            for await (const conn of sock) {
                (async () => {
                    const req = await parseHTTP(conn);
                    if(req.path.includes('google')){
                        conn.close();
                        return;
                    }
                    let res;
                    console.log('Proxy pass:', req.method, req.path);
                    if (req.method == 'CONNECT') {
                        const tls = await Deno.startTls(conn, {
                            alpnProtocols: ['http/1.1']
                        });
                        const req2 = await parseHTTP(tls);
                        res = await fetch2('https://' + req.path + req2.path, {
                            method: req2.method,
                            headers: req2.headers,
                            body: tls.readable
                        });
                    } else {
                        res = await fetch2(req.path, {
                            method: req.method,
                            headers: req.headers,
                            body: conn.readable
                        });
                    }

                    res.headers.append('Connection', 'close');
                    writeResponse(res, conn);
                })().catch(e => console.error(e));
            }
        })();
    }

    async init() {
        if (this.browser) return;
        this.browser = await puppeteer.launch({
            args: [
                '--proxy-server=http://localhost:' + this.port,
                '--ignore-certificate-errors',
                '--start-maximized'
            ],
            ignoreHTTPSErrors: true,
            executablePath: Deno.build.os == 'windows'
                ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
                : '/usr/bin/env chrome',
            headless: false
        });
    }

    async launch(url: URL) {
        const page = await this.browser?.newPage();
        if (!page) throw new Error('Browser not initialized');
        try {
            await page.evaluate(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
            await page.goto(url.href);
            await page.waitForNavigation({
                waitUntil: 'load'
            });
        } catch (e) {
            console.error(e);
        } finally {
            await delay(10000000).then(() => page.close({ runBeforeUnload: false }));
        }
    }

    destroy() {
        this.socket.close();
    }
}