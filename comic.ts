import { BatchDownloader, exists, fetch2, moduleExists, removeIllegalPath, similarTitle, sleep } from "./main.ts";
import { generateEpub, EpubContentOptions, EpubOptions } from './genepub.ts';
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { basename } from "jsr:@std/path@^1.0.8";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { readline } from "./exe.ts";
import { create } from 'jsr:@quentinadam/zip';
// import { Zip }

const out = 'out/', retry_count = 3;
await ensureDir(out);

interface ComicOptions extends EpubOptions {
    tags?: string[];
    originSite?: string;
};

const args = parseArgs(Deno.args, {
    string: ['name', 'outdir', 'sleep', 'format', 'cover'],
    boolean: ['help', 'no-multi'],
    alias: {
        h: 'help',
        n: 'name',
        o: 'outdir',
        s: 'sleep',
        f: 'format',
        c: 'cover',
        m: 'no-multi'
    },
    default: {
        format: 'cbz'
    }
});

const xmlEncode = (str: string) => str.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export async function mkCbz(data: EpubContentOptions[], meta: ComicOptions, outFolder: string) {
    const fetchFunc = meta.networkHandler ?? fetch2;
    const bd = new BatchDownloader(1, 10, fetchFunc, undefined, (param, timeStart, timeEnd) => {
        console.log(`DOWNLOADING 下载 ${String(param[0])} in ${timeEnd - timeStart}ms`);
    });   // 初始单协程，当过慢时再增加协程数
    const bootTime = Date.now();
    const imageArray = data.map(chapter => Array.from(chapter.data.matchAll(/<img src="([^"]+)"/g)).map(m => m[1]));
    let downloadedSize = 0, downloadedCount = 0, restImages = imageArray.reduce((acc, cur) => acc + cur.length, 0);
    console.log(`INFO 开始下载 ${data.length} 章，共 ${restImages} 张图片`);
    for(let chap = 1; chap <= data.length; chap++){
        const chapter = data[chap - 1], name = chap + '_' + removeIllegalPath(chapter.title) + '.cbz',
            path = outFolder + '/' + name,
            images = imageArray[chap - 1];

        // create ComicInfo.xml
        const xml =`
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <Title>${xmlEncode(chapter.title)}</Title>
    <Notes>Created by @imzlh/denovel zComicLib V1.0.0, ${new Date().toISOString()}</Notes>
    <Web>${meta.originSite ?? 'unknown'}</Web>
    <Author>${meta.author ?? 'annoymous'}</Author>
    <Publisher>${meta.publisher ?? 'zComicLib/2'}</Publisher>
    <PageCount>${images.length}</PageCount>
    <Writer>${meta.author ?? 'annoymous'}</Writer>
    <Tags>${meta.tags?.join(', ') ?? '漫画'}</Tags>
    <LanguageISO>zh</LanguageISO>
    <Format>TBP</Format>
    <Manga>Yes</Manga>
    <Pages>
        ${images.map((_, i) => `<Page Image="${(i +1).toString().padStart(3, '0')}" />`).join('')}
    </Pages>
</ComicInfo>`.trim();

        // download images
        const imageres = [] as Uint8Array[];
        await Promise.all(images.map(async (img, i) => { while(true){ try{
            const res = await bd.fetch(img, {
                maxRetries: 10,
                timeoutSec: 10
            }, false, false);
            if(!res || !res.ok) throw new Error(`下载失败: ${img}`);

            const downloaded = (imageres[i] = await res.bytes()).byteLength;
            if(downloaded < 1 * 1024){
                console.log('WARN 文件大小过小，正在重试(', downloaded ,'B)');
                await sleep(retry_count * 3000);
                continue;
            }
            restImages --;

            // use average of last 4 speeds to estimate remaining time
            downloadedSize += downloaded;
            if((downloadedCount ++) % 8 == 0){
                const time = (Date.now() - bootTime) / downloadedCount,
                    avgSpeed = downloadedSize / (Date.now() - bootTime) * 1000 / 1024;

                console.clear();

                // 64k/s or 10s
                if( avgSpeed < 64 && bd.maxCoroutine <= 8 ){
                    if(args["no-multi"]){
                        console.log(`WARN (time: ${time / 1000}s) 下载速度 ${avgSpeed.toFixed(2)}KB/s低于预期，建议删除"--no-multi"提升下载体验！`);
                    }else{
                        bd.maxCoroutine += 2;
                        console.log(`INFO (time: ${time / 1000}s) 下载速度 ${avgSpeed.toFixed(2)}KB/s低于预期，提升并发数: ${bd.maxCoroutine}`);
                    }
                }else{
                    const eta = (restImages / downloadedCount) * (Date.now() - bootTime) / 1000;
                    console.log(`INFO 下载速度 ${avgSpeed.toFixed(2)}KB/s，协程 ${bd.maxCoroutine}，预计剩余${eta.toFixed(2)}s`);
                }
            }
            break;
        }catch(e){
            console.warn(`下载错误: ${img} ${e instanceof Error ? e.message : e}`);
            imageres[i] = new Uint8Array(0);
        }}}));

        // create cbz
        const res = await create(imageres.map((img, i) => ({
            name: (i + 1).toString().padStart(3, '0') + '.' + images[i].split('.').pop()!,
            data: img,
            lastModification: new Date()
        })).concat([ { name: 'ComicInfo.xml', data: new TextEncoder().encode(xml), lastModification: new Date() } ]));
        await Deno.writeFile(path, res);
        console.log(`INFO (${chap})已保存${name}`);
    }

    // download cover
    if (meta.cover) {
        try {
            const startTime = Date.now();
            const res = await bd.fetch(meta.cover, {}, false, false);
            if (!res.ok) throw new Error(`下载失败: ${(await res.text()).substring(0, 60)}`);

            Deno.writeFile(outFolder + '/cover.' + (new URL(meta.cover).pathname.split('.').pop()?.substring(0, 5) || 'jpg')!, await res.bytes());
            console.log(`DOWNLOADING 下载 ${meta.cover} in ${Date.now() - startTime}ms`);
        } catch (e) {
            console.warn(`下载失败: ${meta.cover} ${(e as Error).message}`);
        }
    }
}

export default async function main(){
    if(args.help){
        console.log(`zComicLib V1.0.0
下载漫画，支持输出cbz(ComicInfo.xml)或者epub格式。

用法:
    comic [起始URL] -n [漫画名] -c [封面URL]

参数:
    -n, --name <name>    漫画名，默认为当前时间戳
    -o, --outdir <dir>   输出目录，默认为out/
    -s, --sleep <sec>    指定最大下载间隔，默认为1秒（0~1）
    -f, --format <fmt>   输出格式(cbz/epub)，默认为epub
    -c, --cover <url>    封面URL，默认为无
    -m, --no-multi       禁用并发下载，默认为启用

示例:
    comic https://www.example.com/comic/ -n 无名漫画 -c https://www.example.com/comic/cover.jpg -f epub
`);
        Deno.exit(0);
    }

    const chaps: EpubContentOptions[] = [];
    let mod: Record<string, any>;
    const sleeptime = args.sleep ? parseFloat(args.sleep) : 1;
    const info = {} as ComicOptions;

    if(args.format && !['cbz', 'epub'].includes(args.format)){
        throw new Error('输出格式指定错误,目前只支持cbz或epub。');
    }

    let start: string | null;
    if(typeof args._[0] == 'string' && await exists(args._[0])){
        // read exported file
        if(!args._[0] || !args._[0].endsWith('.txt'))
            throw new Error('文件格式错误，请指定.txt文件');
        const file = Deno.readTextFileSync(args._[0]);
        const fname = basename(args._[0]);

        // get info from file
        const __dot = fname.indexOf('.');
        if(!__dot) throw new Error('文件名格式错误，请不要改名，保留[小说名].[网站名].txt');
        info.title = fname.slice(0, __dot);
        const site = info.originSite = fname.slice(__dot + 1, fname.lastIndexOf('.'));
        mod = await moduleExists(`./comiclib/${site}.ts`)
            ? await import(`./comiclib/${site}.ts`)
            : await import(`./comiclib/${site.split('.').slice(-2).join('.')}.ts`);

        // parse
        let currentChap = {
            data: '',
            title: ''
        };
        const lines = file.split('\n');
        if(!lines.shift()?.startsWith('zComicLib V2')){
            throw new Error('文件格式错误(版本：zComicLib V2).');
        }
        start = lines.shift()!;
        try{
            Object.assign(info, JSON.parse(lines.shift()!));
            name = info.title;
            if(!start) throw 1;
        }catch{
            throw new Error('文件过早结束或格式错误，无法继续');
        }

        for(let line of lines){
            line = line.trim();
            if(line.startsWith('#')){
                const title = line.slice(1).trim();
                currentChap.title = title;
                chaps.push(currentChap);
                currentChap = {
                    data: '',
                    title: ''
                };
            }else if(line){
                currentChap.data += '<img src="' + (line) + '" />\n';
            }
        }

        console.log(`INFO 从文件中读取了${chaps.length}章`);
    }else{
        if(Deno.stdin.isTerminal() || Deno.env.has('DENOVEL_TERMINAL'))
            start = args._[0] as string || await readline('输入起始URL >> ');
        else
            start = JSON.parse(Deno.readTextFileSync('debug.json')).url;
        if(!start) Deno.exit(0);

        // 解析
        const urlStart = new URL(start);
        info.originSite = urlStart.hostname.split('.').slice(-2).join('.');
        if(!await moduleExists(`./comiclib/${info.originSite}.ts`)){
            info.originSite = urlStart.hostname;
            if(!await moduleExists(`./comiclib/${info.originSite}.ts`)){
                console.error(`没有找到站点 ${info.originSite} 的漫画下载脚本.`);
                Deno.exit(1);
            }
        }
        
        const site = info.originSite;
        mod = await import(`./comiclib/${site}.ts`);
        const funcNext = mod.default as (url: string) => AsyncGenerator<string, [string, string], string>;

        if('getInfo' in mod) try{
            const { title: _name, cover: _cover, firstPage, author, tags, summary } 
                = await mod.getInfo(start) as ComicMainInfo;
            name = _name.trim();
            info.cover = _cover?.trim();
            if(!firstPage) throw new Error('未找到漫画第一页');
            start = String(firstPage);
            info.author = author?.trim();
            info.tags = tags?.map(t => t.trim()) ?? [];
            info.description = summary?.trim() ?? '';
        }catch(e){ console.error(`自动化获取漫画信息失败: ${(e as Error).message}`); }
        !name && (name = args.name || await readline('输入漫画名 >> '));
        !info.cover && (info.cover = args.cover || await readline('输入封面URL >> '));

        // 缓冲TXT文件
        const txt = await Deno.open(`${out}/${removeIllegalPath(name)}.${site}.txt`, { create: true, write: true }),
            txtWriter = new TextEncoder();

        // meta
        txt.writeSync(txtWriter.encode('zComicLib V2 - ' + Date.now().toString() + '\n' + start + '\n' + JSON.stringify(info) + '\n\n'));

        let chaptitle = '', urlNext = start, prevChap = '', chapTxt = '';
        mainLoop: while(urlNext){
            const iter = funcNext(urlNext);
            let i = 0, retry = 0;
            while(true) try{
                const { value, done } = await iter.next();
                if(done) {
                    [chaptitle, urlNext] = value;
                    break;
                }
                txt.write(txtWriter.encode(value + '\n'));
                chapTxt += `<p><img src="${value}" width="100%" /></p>`;
                i++;
            }catch(e){
                console.error(`下载失败: ${(e as Error).message}`);
                retry++;
                if(retry > retry_count) {
                    console.error(`下载失败: 超过最大重试次数.`);
                    break mainLoop;
                }
            }

            if(!similarTitle(prevChap, chaptitle)){
                chaps.push({
                    data: chapTxt,
                    title: chaptitle
                });
                chapTxt = '';
                await txt.write(txtWriter.encode('\n# ' + chaptitle + '\n\n'));
            }
            prevChap = chaptitle;
            
            console.log(`INFO ${chaps.length} ${chaptitle}(${i})`);

            await sleep(sleeptime * Math.random());
        }

        await txt.sync();
        txt.close();
    }

    // 配置
    const info2: typeof info = {
        ...info,
        publisher: typeof info.author == 'string' ? info.author : info.author?.join(', ') ?? 'annoymous',
        originSite: start ?? info.originSite,
        networkHandler: mod.fetchHandler ?? fetch2
    };

    // 生成epub
    const filename = (name || Date.now().toString()).replace(/[\\/:*?"<>|]/g, '_') + '.' + (args.format || 'epub');
    if(args.format == 'epub'){
        await generateEpub(info2, out + '/' + filename);
    }else if(args.format == 'cbz'){
        await ensureDir(out + '/' + name);
        await mkCbz(chaps, info2, out + '/' + name);
    }else{
        // not supported yet
        console.log(`暂不支持输出${args.format}格式.`);
    }

    // 保存
    // const filename = (name || Date.now().toString()).replace(/[\\/:*?"<>|]/g, '_') + '.epub';
    // Deno.writeFileSync(out + '/' + filename, epub);
    console.log(`保存成功: ${filename}`);
}

if(import.meta.main) main();