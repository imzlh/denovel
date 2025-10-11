import { assert } from "node:console";
import { getAppDataDir, tryReadTextFile } from "./main.ts";
import { basename } from "node:path";
import { readline } from './exe.ts'
import ProgressBar from "https://deno.land/x/progressbar@v0.2.0/progressbar.ts";
import { percentageWidget, amountWidget } from "https://deno.land/x/progressbar@v0.2.0/widgets.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";

const db = await Deno.openKv(getAppDataDir() + '/tsnovel.db'),
    api = 'https://index.tsyuri.com/book/searchByPage?curr=1&limit=200000000',
    updateAPI = 'https://index.tsyuri.com/book/searchByPage?curr={{page}}&limit=10&sort=create_time';

interface NovelInfo {
    id: string;
    catId: string;
    picUrl: string;
    bookName: string;
    authorName: string;
    bookDesc: string;
    wordCount: string;
    crawlSourceName: string;
    tag: string;
    newTag: string;
    lastIndexUpdateTime: string;
    purity: string;
    status: string;
}

async function __update_db(list: NovelInfo[]){
    const countPath = getAppDataDir() + '/tsnovel.json';
    const countInDB = await exists(countPath) ? JSON.parse(await Deno.readTextFile(countPath)) : { tags: {}, authors: {} };
    const count = countInDB as Record<string, Record<string, number>>;
    
    const startTime = Date.now();
    const prog = new ProgressBar({
        total: list.length,
        widgets: [
            percentageWidget, amountWidget, 
            // 计算剩余时间
            (i, t) => `ETA ${Math.floor((t - i) / (i / (Date.now() - startTime))) / 1000}s`
        ]
    })

    for (const novel of list) {
        const commit = db.atomic();
        const novelAuthorID = count.authors[novel.authorName] || 0;
        count.authors[novel.authorName] = novelAuthorID + 1;

        commit.set(['by_name', novel.bookName], novel.id);
        commit.set(['by_author', novel.authorName, novelAuthorID], novel.id);

        const tags = novel.tag.split(',');
        for (const tag of tags) {
            const tagID = count.tags[tag.trim()] || 0;
            count.tags[tag.trim()] = tagID + 1;
            commit.set(['tags', tag.trim(), tagID], novel.id);
        }

        // 去除null
        for (const key in novel){
            // @ts-ignore key in novel
            if(!novel[key]) delete novel[key];
        }

        commit.set(['info', novel.id], novel);
        await commit.commit();
        await prog.update();
    }

    await db.set(['meta', 'last_update'], Date.now());
    await prog.finish();

    // build count index
    await Deno.writeTextFile(countPath, JSON.stringify(count));
}

async function buildDB() {
    console.log('开始请求API，请耐心等待...')
    const res = await fetch(api).then(r => r.json());
    assert(res.code == '200', '获取小说列表失败');
    const list = res.data.list as NovelInfo[];
    
    console.log('获取到', list.length, '本小说。开始构建数据库');

    await __update_db(list);
    console.log('数据库构建完成，共计', list.length, '本小说');
}

async function updateDB(record = false){
    const dbLastUpdate = (await db.get(['meta', 'last_update'])).value as number ?? 0;
    let pageID = 1, newBookCount = 0;
    const newRecord = [];
    while(true){
        const res = await fetch(updateAPI.replace('{{page}}', pageID.toString())).then(r => r.json());
        assert(res.code == '200', '获取小说列表失败');
        const list = res.data.list as NovelInfo[];
        if(list.length == 0) break;

        const index = list.findIndex(n => new Date(n.lastIndexUpdateTime).getTime() <= dbLastUpdate);
        if(index != -1) list.splice(index);

        await __update_db(list);
        if(record) newRecord.push(...list);
        pageID ++;
        newBookCount += list.length;

        if(index != -1) break;
    }

    console.log('数据库更新完成，共计', pageID - 1, '页', newBookCount, '本小说');
    return newRecord;
}

async function findInDB(name: string) {
    const res = await db.get<number>(['by_name', name]);
    if(res.value) return (await db.get<NovelInfo>(['info', res.value!])).value;
}

async function findInDBBatch(names: string[]): Promise<Record<string, NovelInfo | undefined>> {
    return Object.fromEntries(
        await Promise.all(
            names.map(async name => [name, await findInDB(name)])
        )
    );
}

async function showNovelInfo(novel: NovelInfo) {
    console.log('-'.repeat(60))
    console.log(novel.bookName, '/', novel.authorName, '  (', 
        novel.crawlSourceName, novel.status == '1' ? '完结' : '连载', ')');
    console.log('标签:', novel.tag);
    console.log('字数:', novel.wordCount, '  百合浓度:', novel.purity);
    // console.log('封面:', new URL(novel.picUrl, api).href);
    console.log('信息:', 'https://index.tsyuri.com/book/' + novel.id + '.html')
    console.log('简介:', novel.bookDesc);
    console.log('-'.repeat(60))
}

async function* findInFileSystem(fspath: string) {
    for await (const dirEntry of Deno.readDir(fspath)) {
        if(dirEntry.isFile && dirEntry.name.endsWith('.txt')) {
            const name = basename(dirEntry.name, '.txt');
            const info = await findInDB(name);
            if(info){
                showNovelInfo(info);
                yield info;
            }
        }
    }
}

async function main() {
    // 检查数据库count字段
    const count = (await db.get(['meta', 'last_update'])).value as number | undefined;
    if(!count) {
        console.log('数据库尚未构建，正在构建...');
        await buildDB();
    } else {
        console.log('数据库已构建，上一次: ', new Date(count).toLocaleString());
    }

    console.log('欢迎使用tsyuri小说搜索引擎 本地版！');
    console.log('V1.0 by iz, API: https://index.tsyuri.com');
    while (true) {
        console.log(`  1. 更新数据库
  2. 搜索小说
  3. 本地txt筛选小说
  4. 退出`);
        const input = await readline('>');
        switch (input) {
            case '1':{
                const nr = await updateDB(true);
                if(nr.length < 100) {
                    for (const novel of nr){
                        showNovelInfo(novel);
                    }
                }else{
                    console.log('更新小说数目过多，不予展示');
                }
                break;
            }
            case '2':{
                console.log('请输入要搜索的小说名：');
                const name = await readline('?');
                const info = await findInDB(name);
                if(info) {
                    console.log('找到', name, '的小说信息:');
                    showNovelInfo(info);
                }else console.log('未找到', name, '的小说信息');
            } break;
            case '3':{
                console.log('请输入要筛选的txt文件路径：');
                const fspath = await readline('?');
                console.log('是否使用硬链接以标记符合要求的小说？需要的话输入路径');
                const linkpath = await readline('?');
                let autoCover = '';
                if(linkpath){
                    console.log('我们还支持补全功能，对于没有封面的txt自动添加。要来吗？');
                    autoCover = await readline('?');
                }
                let i = 0;
                for await (const it of findInFileSystem(fspath)){
                    i ++;
                    if(linkpath) {
                        if (autoCover && it.picUrl){
                            let txt;
                            try{
                                txt = tryReadTextFile(it.bookName + '.txt');
                            }catch(e){
                                console.warn('读取', it.bookName + '.txt', '失败:', e);
                                continue;
                            }
                            if (!(/^[\s\S]{0, 1000}[\r\n]\s+封面[:：].{10,}[\r\n]/.test(txt))) {
                                txt = `封面：${new URL(it.picUrl, api).href}\n\n${txt}`;
                                console.log('为', it.bookName, '自动添加封面:', it.picUrl);
                            }
                            Deno.writeTextFileSync(linkpath + '/' + it.bookName + '.txt', txt);
                        } else {
                            Deno.linkSync(it.bookName + '.txt', linkpath + '/' + it.bookName + '.txt');
                        }
                    }
                    console.log('找到', it.bookName, '的小说信息:', it);
                }
                console.log('共计', i, '本小说');
            } break;
            case '4':
                console.log('退出程序');
                db.close();
                Deno.exit(0);
            break;
            default:
                console.log('输入错误，请重新输入');
                break;
        }
    }
}

if (import.meta.main) main();