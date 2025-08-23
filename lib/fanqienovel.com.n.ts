/**
 * Adapted from @POf-L/Fanqie-novel-Downloader
 */

import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { defaultGetInfo, fetch2 } from "../main.ts";

// 且用且珍惜
import * as LANGGE_API from './fqapi/langge.ts';
import * as JINGLUO_API from './fqapi/jingluo.ts';
import * as RAIN_API from './fqapi/rain.ts';
import * as X00X_API from './fqapi/xo0x.ts';

console.log('请知晓，为了防止被封，本爬虫会在每次请求之后随机等待几秒');

const detail = (bookid: string) =>
    fetch2(`https://fanqienovel.com/api/reader/directory/detail?bookId=${bookid}`).then(r => r.json())
        .then(__ => {
            if(__.code != 0) throw new Error(`Failed to fetch book detail: ${__.msg}`);
            const data = __.data.chapterListWithVolume;
            return data.flat(1) as Array<IChapter>;
        });

interface IChapter{
    itemId: string,
    title: string,
    firstPassTime: string,
    volume_name: string,
    need_pay: number
}
interface ISource{
    enabled: boolean,
    name: string,
    single_url: string,
    token: string
}

const APIS: Array<{ download: (item_id: string, book_id: string) => Promise<string>, downloadAll?: (item_ids: string[], book_id: string) => Promise<Record<string, string>> }> = [
    LANGGE_API,
    JINGLUO_API,
    X00X_API,
    RAIN_API
];
let current_api_id = 0;

async function* getChapterContent(ids: string[], book_id: string) {
    const originalApiId = current_api_id;
    let currentAttempt = 0;

    while (currentAttempt < APIS.length) {
        const api = APIS[current_api_id];
        try {
            // 尝试批量获取所有章节内容
            let contents: Record<string, string>;
            if (api.downloadAll) {
                console.log(`尝试使用API [${current_api_id}] 批量获取 ${ids.length} 章节内容，可能会花费大量时间`);
                contents = await api.downloadAll(ids, book_id);
            } 
            // 没有批量接口时逐个获取
            else {
                contents = {};
                for (const id of ids) {
                    await delay(1000 * Math.random() + 400);
                    contents[id] = await api.download(id, book_id);
                }
            }

            // 按原始ID顺序生成内容
            const failed = ids.every(id => !contents[id]);
            if (failed) {
                throw new Error(`没有内容返回，可能API已失效`);
            }
            for (const id of ids) {
                if (!contents[id]) {
                    console.warn(`API [${current_api_id}] 未返回 [ID=${id}] 内容`);
                    // batchSingle
                    contents[id] = await api.download(id, book_id);
                    if (!contents[id]) {
                        throw new Error(`API [${current_api_id}] 依旧未返回 [ID=${id}] 内容`);
                    }
                }
                yield contents[id];
            }
            return;
        } catch (error) {
            console.error(`API [${current_api_id}] 请求失败: ${error instanceof Error? error.message : error}`);
            // 切换下一个API并增加延迟
            current_api_id = (current_api_id + 1) % APIS.length;
            currentAttempt++;
            await delay(3000 * Math.random() + 2000);
        }
    }

    // 所有API都失败后恢复初始API设置
    current_api_id = originalApiId;
    throw new Error(`所有API请求失败，共尝试${currentAttempt}次`);
}


export default (async function* (urlStart: URL | string) {
    const urlPreg = /^https?\:\/\/.*fanqienovel\.com\/page\/(\d+)\/?/i;
    const url = urlStart.toString();
    
    // 验证初始URL
    const match = urlPreg.exec(url);
    if (!match) throw new Error("无效的URL");
    
    // 初始化章节数据
    const chapters = await detail(match[1]);

    // 分批下载，防止阻塞过长
    const STEP = 8;
    for(let i = 0; i < chapters.length; ){
        for await(const item of getChapterContent(
            chapters.slice(i, i + STEP).map(c => c.itemId),
            match[1]
        )){
            yield {
                title: chapters[i ++].title,
                content: item
            };
        }
        await delay(6000 * Math.random() + 1500);
    }
} satisfies Callback);

export const getInfo = (url: URL) => defaultGetInfo(url, {
    mainPageCover: '#app > div > div.muye.muye-page > div > div.page-wrap > div > div.page-header-info > div.muye-book-cover.img.is-book > div > img',
    mainPageTitle: '#app > div > div.muye.muye-page > div > div.page-wrap > div > div.page-header-info > div.info > div.info-name > h1',
    mainPageSummary: '#app > div > div.muye.muye-page > div > div.page-body-wrap > div > div.page-abstract-content > p',
    mainPageAuthor: '#app > div > div.muye.muye-page > div > div.page-wrap > div > div.page-header-info > div.author > div.author-info > a > div',

    // https://fanqienovel.com/page/7508113040546483262?enter_from=search
    mainPageLike: /^https?\:\/\/.*fanqienovel\.com\/page\/\d+/i
})