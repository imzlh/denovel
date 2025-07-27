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
export async function mkCbz(data: EpubContentOptions[], meta: EpubOptions, origin: string, outFolder: string) {
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
    <Web>${origin}</Web>
    <Authors>${meta.author}</Authors>
    <Publisher>${meta.publisher || ''}</Publisher>
    <PageCount>${images.length}</PageCount>
    <LanguageISO>zh</LanguageISO>
    <Format>TBP</Format>
    <Manga>Yes</Manga>
    <Pages>
        ${images.map((_, i) => `<Page Image="${(i +1).toString().padStart(3, '0')}" />`).join('')}
    </Pages>
</ComicInfo>`.trim();

        // download images
        const imageres = [] as Uint8Array[];
        await Promise.all(images.map(async (img, i) => { try{
            const res = await bd.fetch(img, {
                maxRetries: 10
            }, false, false);
            if(!res || !res.ok) throw new Error(`下载失败: ${img}`);

            const downloaded = (imageres[i] = await res.bytes()).byteLength;
            restImages --;

            // use average of last 4 speeds to estimate remaining time
            if(downloadedCount % 8 == 0){
                const time = (Date.now() - bootTime) / downloadedCount,
                    avgSpeed = downloadedSize / (Date.now() - bootTime) * 1000 / 1024;

                console.clear();

                // 64k/s or 10s
                if( avgSpeed < 64 || time > 10 * 1000 ){
                    if(args["no-multi"]){
                        console.log(`WARN (time: ${time / 1000}s) 下载速度 ${avgSpeed.toFixed(2)}KB/s低于预期，建议删除"--no-multi"提升下载体验！`);
                    }else{
                        bd.maxCoroutine += 2;
                        console.log(`INFO (time: ${time / 1000}s) 下载速度 ${avgSpeed.toFixed(2)}KB/s低于预期，提升并发数: ${bd.maxCoroutine}`);
                    }
                }else{
                    const eta = (restImages / downloadedCount) * (Date.now() - bootTime) / 1000;
                    console.log(`INFO 下载速度 ${avgSpeed.toFixed(2)}KB/s，预计剩余${eta.toFixed(2)}s`);
                }
            }
            downloadedCount ++;
            downloadedSize += downloaded;
        }catch(e){
            console.warn(`下载错误: ${img} ${e instanceof Error ? e.message : e}`);
            imageres[i] = new Uint8Array(0);
        }}));

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

            Deno.writeFile(outFolder + '/cover.' + (meta.cover.split('.').pop()?.substring(0, 5) || 'jpg')!, await res.bytes());
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

    let name: string | undefined, cover: string | undefined, site: string;
    const chaps: EpubContentOptions[] = [];
    let mod: Record<string, any>;
    let sleeptime = args.sleep ? parseFloat(args.sleep) : 1;

    if(args.format && !['cbz', 'epub'].includes(args.format)){
        throw new Error('输出格式指定错误,目前只支持cbz或epub。');
    }

    let start: string | null;
    if(typeof args._[0] == 'string' && await exists(args._[0])){
        // read exported file
        const file = Deno.readTextFileSync(args._[0]);
        const fname = basename(args._[0]);

        // get info from file
        const __dot = fname.indexOf('.');
        name = fname.slice(0, __dot);
        site = fname.slice(__dot + 1, fname.lastIndexOf('.'));
        mod = await moduleExists(`./comiclib/${site}.ts`)
            ? await import(`./comiclib/${site}.ts`)
            : await import(`./comiclib/${site.split('.').slice(-2).join('.')}.ts`);

        // parse
        let currentChap = {
            data: '',
            title: ''
        };
        const lines = file.split('\n');
        if(!lines.shift()?.startsWith('zComicLib V1')){
            throw new Error('文件格式错误(版本：zComicLib V1).');
        }
        start = lines.shift()!;
        cover = lines.shift()!;
        if(!cover || !start) throw new Error('文件过早结束，格式错误');

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
        site = urlStart.hostname.split('.').slice(-2).join('.');
        if(!await moduleExists(`./comiclib/${site}.ts`)){
            site = urlStart.hostname;
            if(!await moduleExists(`./comiclib/${site}.ts`)){
                console.error(`没有找到站点 ${site} 的漫画下载脚本.`);
                Deno.exit(1);
            }
        }
        mod = await import(`./comiclib/${site}.ts`);
        const funcNext = mod.default as (url: string) => AsyncGenerator<string, [string, string], string>;

        if('getInfo' in mod) try{
            const { title: _name, cover: _cover, firstPage } = await mod.getInfo(start) as ComicMainInfo;
            name = _name.trim();
            cover = _cover?.trim();
            if(!firstPage) throw new Error('未找到漫画第一页');
            start = String(firstPage);
        }catch(e){ console.error(`自动化获取漫画信息失败: ${(e as Error).message}`); }
        !name && (name = args.name || await readline('输入漫画名 >> '));
        !cover && (cover = args.cover || await readline('输入封面URL >> '));

        // 缓冲TXT文件
        const txt = await Deno.open(`${out}/${removeIllegalPath(name)}.${site}.txt`, { create: true, write: true }),
            txtWriter = new TextEncoder();

        // meta
        txt.writeSync(txtWriter.encode('zComicLib V1 - ' + Date.now().toString() + '\n' + start + '\n' + cover + '\n\n'));

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
            }
            prevChap = chaptitle;
            
            console.log(`INFO ${chaps.length} ${chaptitle}(${i})`);

            await Promise.all([ sleep(
                sleeptime * Math.random()
            ), txt.write(txtWriter.encode('\n# ' + chaptitle + '\n\n')) ]);
        }

        await txt.sync();
        txt.close();
    }

    // 生成epub
    const filename = (name || Date.now().toString()).replace(/[\\/:*?"<>|]/g, '_') + '.' + (args.format || 'epub');
    if(args.format == 'epub'){
        await generateEpub({
            "cover": cover ?? undefined,
            "title": name ?? '无名漫画',
            "tocTitle": name + "目录",
            "lang": "zh-CN",
            "description": "来自于 " + site + "的漫画",
            "content": chaps,
            "verbose": true,
            "networkHandler": mod.networkHandler    // 自定义网络请求函数
        }, out + '/' + filename);
    }else if(args.format == 'cbz'){
        await ensureDir(out + '/' + name);
        await mkCbz(chaps, {
            "cover": cover ?? undefined,
            "title": name ?? '无名漫画',
            "tocTitle": name + "目录",
            "lang": "zh-CN",
            "description": "来自于 " + site + "的漫画",
            "content": chaps,
            "verbose": true,
            "networkHandler": mod.networkHandler    // 自定义网络请求函数
        }, start, out + '/' + name);
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