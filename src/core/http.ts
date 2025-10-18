import Cookies from './cookie.ts';
import { timeout } from "./utils.ts";

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36';

export type FetchOptions = RequestInit & {
    /**
     * 请求超时时间，用于替代signal选项，单位秒
     */
    timeoutSec?: number, 
    /**
     * 最大重试次数，默认3次
     */
    maxRetries?: number,
    /**
     * 是否忽略服务器返回的状态码，默认false
     * false: 服务器返回状态码非2xx时抛出异常
     */
    ignoreStatus?: boolean,
};

async function fetch2(
    url: string | URL,
    options: FetchOptions = {},
): Promise<Response> {
    const targetUrl = typeof url === 'string' ? new URL(url) : url;
    const host = targetUrl.hostname.split('.').slice(-2).join('.');
    const headers = new Headers(options.headers);

    const cookies = await Cookies.getCookieHeader(host);
    headers.set('Cookie', cookies);

    if(!headers.has('User-Agent')) headers.set('User-Agent', UA);
    if(options.referrer) headers.set('referer', options.referrer);
    // headers.set('Origin', originalUrl.origin);

    // 修复请求方法逻辑
    if (options.body && (!options.method || /^get|head$/i.test(options.method))) {
        options.method = 'POST';
    }

    // 重试逻辑（保持原有）
    let response: Response  | undefined // | ResponseN;
    let tried = 0;
    for (; tried < (options.maxRetries ?? 3); tried++) {
        try {
            if(options.signal?.aborted)
                throw new Error('Aborted');

                // use deno native fetch
                response = await fetch(targetUrl, { 
                    ...options, headers, 
                    redirect: 'manual',
                    signal: options.timeoutSec ? timeout(options.timeoutSec, options.signal ?? undefined) : options.signal
                });
            if(Math.floor(response.status / 100) == 5 && !options.ignoreStatus){
                Deno.writeTextFileSync('error.html', await response.text())
                throw new Error('Server Error: status ' + response.status);
            }
            break;
        } catch (e) {
            console.warn(`Fetch failed (attempt ${tried + 1}):`, e instanceof Error ? e.message : e);
            await new Promise(r => setTimeout(r, 1000 * (tried + 1)));
        }
    }

    if (!response) throw new Error(`Fetch failed for ${targetUrl.href} after ${tried} attempts`);

    // 从响应头中提取 Set-Cookie 并更新 cookieStore
    const setCookieHeader = response.headers.getSetCookie()
    Cookies.fromSetCookieHeader(host, setCookieHeader);

    if ([301, 302, 303, 307, 308].includes(response.status) && (!options.redirect || options.redirect === 'follow')) {
        // 重定向
        response = await fetch2(new URL(response.headers.get('location')!, url), {
            ...options,
            referrer: targetUrl.href
        });
    }

    return response as Response;
}

export default fetch2;