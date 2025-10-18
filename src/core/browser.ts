import { connect, ConnectResult } from "browser";
import { Cookie } from "puppeteer";
import fetch2 from "./http.ts";
import { Buffer } from "node:buffer";
import BlankPage from '../static/blank.html' with { type: "text" };
import { nonNULL, sleep } from "./utils.ts";
import Cookies from "./cookie.ts";

export class SimpleBrowser {
    private browser: undefined | ConnectResult;

    async init() {
        if (this.browser) return;
        this.browser = await connect({
            args: [],
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

            try{
                console.log('PROXY', req.method(), url.href);
                const res = await fetch2(url.href, {
                    method: req.method(),
                    headers: req.headers(),
                    body: req.postData(),
                    timeoutSec: 15,
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

        const site = url.hostname.split('.').slice(-2).join('.');
        this.browser?.browser.setCookie(...Object.entries(nonNULL(await Cookies.get(site))).map(([k, v]) => ({
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
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { value: false })
                Object.defineProperty(navigator, 'languages', {
                    get: function () {
                        return ['zh-CN', 'zh-TW', 'en-US'];
                    },
                });
            });
            if(waitFor){
                await page.waitForNavigation({
                    waitUntil: 'load'
                });
                console.log('完成值守，似乎通过验证？');

                const cookies = await this.browser?.browser.cookies();
                await Cookies.set(url.hostname, Object.fromEntries(cookies.map(c => [c.name, c.value])));
            }else{
                await new Promise(rs => page.on('close',rs));
            }
        } catch (e) {
            console.error(e);
        } finally {
            await sleep(1).then(() => page.close({ runBeforeUnload: false }));
        }
    }

    async destroy() {
        await this.browser?.browser.close();
    }
}

export async function launchBrowser(url: URL, waitForFirstNavigation = true) {
    const browser = new SimpleBrowser();
    await browser.init();
    await browser.launch(url, waitForFirstNavigation);
    return browser;
}
