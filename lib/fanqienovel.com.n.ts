/**
 * Adapted from @POf-L/Fanqie-novel-Downloader
 */

import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { defaultGetInfo, fetch2, timeout } from "../main.ts";

const True = true, False = false, None = null;
const CONFIG = {    // 2025/7/1
    "max_workers": 4,
    "max_retries": 3,
    "request_timeout": 15,
    "status_file": "chapter.json",
    "request_rate_limit": 0.4,
    "auth_token": "wcnmd91jb",
    "api_endpoints": [],
    "batch_config": {
        "name": "qyuing",
        "base_url": None,
        "batch_endpoint": None,
        "token": None,
        "max_batch_size": 290,
        "timeout": 10,
        "enabled": True
    }
};

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

const getNodes = () => fetch2(CONFIG.server_url, {
    headers: {
        "X-Auth-Token": CONFIG.auth_token
    }
}).then(r => r.json())
   .then(r => {
        if('sources' in r) return r.sources as Array<ISource>;
        else throw new Error(`Failed to fetch sources: ${r.msg}`);
    });

async function tryBatchNode(cids: Array<string>, node: ISource) {
    // FIXME: 这里的batch_endpoint可能有问题
    const url = new URL(node.single_url);
    const kname = Array.from(url.searchParams.entries()).find(v => v[1] == '{chapter_id}');
    if(kname) url.searchParams.delete(kname[0]);
    const fe = await fetch2(url, {
        headers: {
            'token': node.token,
            'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
            "item_ids": cids
        })
    });
    if(fe.ok){
        const res = (await fe.json()).data as Record<string, string>[];
        if(!res) throw new Error('Failed to fetch chapter content');
        
        const ret: Record<string, string> = {};
        for(const id in res){
            const content = res[id].content;
            if(!content){
                throw new Error(`Failed to fetch chapter content from ${node.name}: ${res[id].msg} ${await fe.text()}`);
            }
            ret[id] = content;
        }
        return ret;
    }else{
        throw new Error(`Failed to fetch chapter content from ${node.name}: ${fe.status} ${await fe.text()}`);
    }
}

async function tryNode(cid: string, node: ISource) {
    const url = node.single_url.replace('{chapter_id}', cid);
    const fe = await fetch2(url, {
        signal: timeout(CONFIG.request_timeout)
    });
    if(fe.ok){
        const res = (await fe.json()).data as string;
        if(!res) throw new Error('Failed to fetch chapter content');

        switch(node.name){
            case 'fqphp':
                return res.substring(20);

            case 'qyuing':
                return res;

            case 'lsjk':
                return res;

            default:
                return res;
        }
    }else{
        throw new Error(`Failed to fetch chapter content from ${node.name}: ${fe.status}`);
    }
}

let nodes: Array<ISource> = [];
async function* getChapterContent(cid: string[]): AsyncGenerator<string, void, string> {
    if(!nodes.length){
        nodes = await getNodes();
    }

    for(const node of nodes){
        if(node.enabled) try{
            if(node.name == CONFIG.batch_config.name){
                console.log('尝试批量下载，耗时可能较长，请耐心等待');
                yield* Object.entries(await tryBatchNode(cid, node))
                    .sort((v1, v2) => cid.indexOf(v1[0]) - cid.indexOf(v2[0]))
                    .map(v => v[1]);
            }else {
                for(const c of cid)
                    yield await tryNode(c, node);
            }
            return;
        }catch(e){
            console.error(`Failed to fetch chapter content from ${node.name}: ${(e as Error).message}`);
        }
    }
    throw new Error('Failed to fetch chapter content');
}

function batchable(){
    if(CONFIG.batch_config.enabled && CONFIG.batch_config.token && CONFIG.batch_config.batch_endpoint)
        return true;
    else return false;
}

export default (async function* (urlStart: URL | string) {
    const urlPreg = /^https?\:\/\/.*fanqienovel\.com\/page\/(\d+)\/?/i;
    const url = urlStart.toString();
    
    // 验证初始URL
    const match = urlPreg.exec(url);
    if (!match) throw new Error("Invalid url");
    
    // 初始化章节数据
    const chapters = await detail(match[1]);
    let chapterBatched = await Array.fromAsync(
        getChapterContent(chapters.map(v => v.itemId))
    );
    
    // 遍历章节生成内容
    for (let i = 0; i < chapters.length; i++) {
        // 批量获取失败时的补偿逻辑
        if (!chapterBatched?.[i]) {
            await delay(2000 * Math.random() + 1000);
            const [content] = await Array.fromAsync(
                getChapterContent([chapters[i].itemId])
            );
            if (!content) throw new Error('Failed to fetch chapter content');
            
            // 更新批量缓存
            chapterBatched = chapterBatched || [];
            chapterBatched[i] = content;
        }
        
        // 生成章节数据
        yield {
            title: chapters[i].title,
            content: chapterBatched[i]
        };
    }
} satisfies Callback);

export const getInfo = (url: URL) => defaultGetInfo(url, {
    mainPageCover: '#app > div > div.muye.muye-page > div > div.page-wrap > div > div.page-header-info > div.muye-book-cover.img.is-book > div > img',
    mainPageTitle: '#app > div > div.muye.muye-page > div > div.page-wrap > div > div.page-header-info > div.info > div.info-name > h1',
    mainPageSummary: '#app > div > div.muye.muye-page > div > div.page-body-wrap > div > div.page-abstract-content > p',
    
    // https://fanqienovel.com/page/7508113040546483262?enter_from=search
    mainPageLike: /^https?\:\/\/.*fanqienovel\.com\/page\/\d+/i
})