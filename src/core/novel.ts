import { HTMLDocument } from "dom";
import { ensureDir, exists } from "@std/fs";
import { join } from "node:path";
import { sleep, checkIsTraditional, NoRetryError, readline, removeIllegalPath, tryReadTextFileSync, fromHTML, similarTitle, tryReadTextFile } from "./utils.ts";
import assert from "node:assert";
import getDocument, { processContent } from "./dom.ts";
import { toEpub } from "./epub.ts";
import conv from "./conv.ts";

const META_HEADER = ':: org.imzlh.denovel.meta';

export enum Status {
    QUEUED,
    DOWNLOADING,
    CONVERTING,
    DONE,
    ERROR,
    WARNING,
    CANCELLED
}

export type DownloadLog = {
    status: Status.QUEUED,
    info: MainInfoResult
} | {
    status: Status.DOWNLOADING,
    url: URL | string,
    title: string,
    content: string,
    next_link?: URL | null | string,
    message?: undefined
} | {
    status: Status.DOWNLOADING,
    message: string
} | {
    status: Status.CONVERTING,
    message: string
} | {
    status: Status.WARNING,
    message: string
} | {
    status: Status.ERROR,
    message: string,
    error?: Error | any
} | {
    status: Status.DONE,
    message: string
} | {
    status: Status.CANCELLED,
    message: string
};

export interface DownloadStore {
    traditional: boolean,
    book_name: string,
    cover?: string,
    translate?: boolean,
    outdir: string,
    disable_parted?: boolean,
    to_epub?: boolean,
    epub_options?: Parameters<typeof toEpub>[3],
    sleep_time?: number,
    author?: string,
    summary?: string,
    previous_title?: string,
    chapter_id?: number,
    last_chapter_url?: string,
    timestrap?: number,
}

export interface DownloadOptions extends Partial<DownloadStore> {
    sig_abort?: AbortSignal,
    no_input?: boolean,
    hide_meta?: boolean,
    skip_first_chapter?: boolean,
    disable_overwrite?: boolean,
    no_continue?: boolean
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

    for (const key in info)
        // @ts-ignore in operator
        if(typeof info[key] == 'string') info[key] = info[key].trim();

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

async function getInfoEX(url: URL): Promise<MainInfoResult | null> {
    if(await checkIsTraditional(url)){
        const cfg = (await import('./lib/' + url.hostname + '.t.ts')).default;
        return await defaultGetInfo(url, { ...cfg, networkHandler: fetch });
    }else{
        const cfg = await import('./lib/' + url.hostname + '.n.ts');
        assert(cfg.getInfo, 'getInfo() is required');
        return await cfg.getInfo(url);
    }
}


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
            if (e instanceof NoRetryError || retry == 5) {
                throw e;
            }
        }
        const ctx = document.querySelector(config.content);
        if(!ctx) return; // 空页面

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
            next_link: next_url
        };
        // __ = true;
    }
}


/**
 * 从TXT文件中恢复下载进度，并继续下载。
 * 
 * @param fpath 文件路径
 * @param override 覆盖配置(注意，随意修改可能导致下载失败)
 * @param defaults 默认配置(安全配置，部分会被程序覆盖)
 * @returns 
 */
export async function* downloadFromTXT(fpath: string, override: DownloadOptions = {}, defaults: DownloadOptions = {}): AsyncGenerator<DownloadLog> {
    const content = (await tryReadTextFile(fpath)).trimEnd().split(/[\r\n]+/);
    let text = '';
    // 最后一行理应为[/comment]
    if(content.pop() != '[/comment]'){
        yield {
            status: Status.ERROR,
            message: '找不到 denovel META。如果上一次中断，请手动打开txt并删除最后一次[/comment]后内容'
        }
        throw new Error('Cannot find denovel META');
    }
    for(let i = content.length - 1; i >= 0; i--){
        if(content[i] == META_HEADER) break;
        text = content[i] + text;
    }
    if(!text){
        // override.reporter(Status.ERROR, 'denovel META为空');
        yield {
            status: Status.ERROR,
            message: 'denovel META为空'
        }
        throw new Error('META is empty');
    }
    let res: Parameters<typeof downloadNovel>[1];
    try{
        res = JSON.parse(text);
        if(!res.last_chapter_url) throw new Error('缺少last_chapter_url');
    }catch(e){
        // override.reporter(Status.ERROR, 'META解析失败：' + (e instanceof Error ? e.message : e));
        yield {
            status: Status.ERROR,
            message: 'META解析失败',
            error: e
        }
        throw new Error('META解析失败');
    }
    // override.reporter(Status.QUEUED, '继续断点下载, start=' + res.last_chapter_url);
    yield {
        status: Status.DOWNLOADING,
        message: '继续断点下载, start=' + res.last_chapter_url
    }
    return downloadNovel(res.last_chapter_url, {
        ...defaults,
        ...res,
        hide_meta: true,
        skip_first_chapter: true,
        disable_overwrite: true,
        no_continue: true,
        ...override
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
 *  - v3.1: 修复大量问题
 *  - v4: 兼容denovel v2
 * @param start_url 
 * @param options 
 * @returns 
 */
export async function* downloadNovel(
    start_url: string | URL = '',
    options: DownloadOptions
): AsyncGenerator<DownloadLog, void, void> {
    let url = new URL(start_url);
    assert(options.outdir, '缺少输出目录');
    await ensureDir(options.outdir);
    if (undefined === options.sleep_time) options.sleep_time = 2;
    const sleep_time = options.sleep_time / 2;
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
    if (info) {
        options.summary = options.summary ?? info.summary;
        (!options.cover && info.cover) && (options.cover = info.cover);
        (!options.book_name && info.book_name) && (options.book_name = info.book_name);
        (!options.author && info.author) && (options.author = info.author);
        info.firstPage && (url = info.firstPage);
    } else {
        if (options.no_input)
            assert(options.cover && options.book_name, "需要更多信息");
        !options.book_name && !options.no_input && (options.book_name = await readline("请输入书名 >> ") || '');
        !options.cover && !options.no_input && (options.cover = await readline("请输入封面URL(可选) >> ") || '');
        if (!options.book_name) {
            throw new Error('请输入书名');
        }
    }

    yield {
        status: Status.QUEUED,
        info: info ?? {
            author: options.author,
            book_name: options.book_name,
            cover: options.cover,
            summary: options.summary,
            firstPage: url
        }
    };

    // 打开文件
    const fpath = join(options.outdir ?? 'out', removeIllegalPath(options.book_name ?? 'unknown') + '.txt');
    if (!options.no_continue && await exists(fpath)) try {
        // 恢复上下文
        return yield* downloadFromTXT(fpath, {}, options);
    } catch (e) {
        yield {
            status: Status.WARNING,
            message: '无法使用现有库存，可能不是由新版本denovel生成的或没有完全下载完'
        };
        if (options.disable_overwrite) {
            yield {
                status: Status.ERROR,
                message: '禁止覆盖已有文件，且无法恢复下载进度',
                error: e
            }
            return;
        }
    }
    const file = await Deno.open(fpath, {
        create: true, append: options.disable_overwrite, write: !options.disable_overwrite, read: false, truncate: !options.disable_overwrite
    });
    if (!options.hide_meta) {
        file.write(new TextEncoder().encode(options.book_name + '\r\n'));
        if (options.author) file.write(new TextEncoder().encode(`作者: ${options.author}\r\n`));
        if (options.summary) file.write(new TextEncoder().encode(`简介: \r\n${options.summary}\r\n${'-'.repeat(20)}\r\n`));
        if (options.cover) file.write(new TextEncoder().encode(`封面: ${options.cover}\r\n`));
    }

    if (!options.chapter_id) options.chapter_id = 1;
    options.timestrap = Date.now();
    let real_writed = 0;
    // 开始循环
    try {
        let errorcount = 0;
        let cur_t: string | undefined = url.href;
        for await (let { title, content, next_link } of callbacks.default(url)) {

            if (options.skip_first_chapter) {
                options.skip_first_chapter = undefined;
                // options.reporter(Status.DOWNLOADING, '跳过第一章: ' + title);
                yield {
                    status: Status.DOWNLOADING,
                    message: '跳过第一章: ' + title
                };
                continue;
            }

            if (content) {
                if (content.trim().length >= 200) {
                    // 替换HTML转义
                    content = fromHTML(content);
                    // 移除不可见字符
                    // content = removeNonVisibleChars(content);
                    // 翻译
                    if (options.translate) content = conv(content);
                    // 移除空格
                    content = content.trim();
                    errorcount = 0;
                } else {
                    yield {
                        status: content.length > 50 ? Status.WARNING : Status.ERROR,
                        message: `ID: ${options.chapter_id} 内未找到内容或过少`
                    };
                    errorcount++;
                }
            } else {
                // options.reporter(Status.ERROR, `ID: ${options.chapter_id} 内容为空`);
                yield {
                    status: Status.ERROR,
                    message: `ID: ${options.chapter_id} 内容为空`
                };
                errorcount++;
            }

            if (errorcount >= 10) {
                yield {
                    status: Status.ERROR,
                    message: `ID: ${options.chapter_id} 连续错误${errorcount}次，放弃下载`
                };
                break;
            }

            // 翻译标题
            if (title && options.translate) {
                title = conv(title);
            }

            // 章节分卷？
            let text = '';
            if (options.disable_parted || !title || similarTitle(options.previous_title ?? '', title, true)) {
                // 直接写入
                text += '\n' + content;
            } else {
                text = (options.disable_parted ? '' : (`\r\n第${options.chapter_id++}章 ${title ?? ''}\r\n`))
                    + (content ?? '[ERROR: 内容获取失败]') + '\r\n';
            }

            options.previous_title = title;
            options.last_chapter_url = cur_t;
            cur_t = next_link ? String(next_link) : undefined;
            // options.reporter(Status.DOWNLOADING, `第 ${options.chapter_id - 1} 章  ${title || ''} (${text.length})`);
            yield {
                status: Status.DOWNLOADING,
                title: title,
                content: text,
                next_link: next_link,
                url: cur_t!
            };

            if (options.sig_abort?.aborted) {
                await file.write(new TextEncoder().encode(text));
                // options.reporter(Status.CANCELLED, '下载被用户终止');
                yield {
                    status: Status.CANCELLED,
                    message: '下载被用户终止: ' + (options.sig_abort?.reason ?? '未知原因')
                }
                break;
            }

            real_writed++;
            await Promise.all([
                file.write(new TextEncoder().encode(text)),
                sleep(Math.random() * sleep_time + sleep_time),
            ]);

            if (options.last_chapter_url == next_link?.toString()) {
                // options.reporter(Status.ERROR, '出现无效循环(next_link未变化)，下载结束');
                yield {
                    status: Status.ERROR,
                    message: '出现无效循环(next_link未变化)，下载结束'
                };
                break;
            }

            if (options.sig_abort?.aborted) {
                // options.reporter(Status.CANCELLED, '下载被用户终止');
                yield {
                    status: Status.CANCELLED,
                    message: '下载被用户终止: ' + (options.sig_abort?.reason ?? '未知原因')
                }
                break;
            }
        }
    } catch (e) {
        // options.reporter(Status.WARNING, '发生错误,下载结束', e as Error);
        yield {
            status: Status.ERROR,
            message: '发生错误,下载结束',
            error: e
        }
    }

    // meta: 必须写入，否则无法识别
    if (real_writed) {
        options.sig_abort = undefined;  // remove signal
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

    if (real_writed == 0) {
        // delete empty file
        await Deno.remove(fpath);
        // options.reporter(Status.ERROR, '下载失败，文件为空');
        yield {
            status: Status.ERROR,
            message: '下载失败，文件为空'
        }
        return;
    }

    if (!options.sig_abort?.aborted && options.to_epub) {
        // options.reporter(Status.CONVERTING, '开始生成epub文件');
        yield {
            status: Status.CONVERTING,
            message: '开始生成epub文件'
        }
        const text = await Deno.readTextFile(fpath);
        yield*
            toEpub(text, fpath, fpath.replace('.txt', '.epub'), {
                jpFormat: info?.jpStyle,
                networkHandler: callbacks.networkHandler,
                ...(options.epub_options || {})
            });
    }
}

export function logger(log: DownloadLog, toConsole: boolean = true){
    let retText = '';
    switch(log.status){
        case Status.QUEUED:
            retText = `RESOLVED ` + JSON.stringify(log.info);
        break;
        case Status.DOWNLOADING:
            if(log.message)
                retText = `DOWNLOADING ${log.message}`;
            else
                // @ts-ignore TC failed?
                retText = `DOWNLOADING ${log.title} (${log.content?.length})`;
        break;
        case Status.CONVERTING:
        case Status.DONE:
        case Status.WARNING:
        case Status.CANCELLED:
            retText = `${log.status} ${log.message}`;
        break;
        case Status.ERROR:
            retText = `ERROR ${log.message}`;
            if(log.error)
                retText += ` ${log.error instanceof Error ? log.error.message : log.error}`;
        break;
        default:
            // @ts-ignore
            throw new Error(`Unknown status: ${log.status}`);
        break;
    }
    if(toConsole) console.log(retText);
}