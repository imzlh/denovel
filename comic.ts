import { exists, moduleExists, sleep } from "./main.ts";
import { EPub, EpubContentOptions } from './genepub.ts';
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { basename } from "jsr:@std/path@^1.0.8";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { readline } from "./exe.ts";
// import { Zip }

const out = 'out/', retry_count = 3;
await ensureDir(out);

const args = parseArgs(Deno.args, {
    string: ['name', 'outdir', 'sleep', 'format', 'cover'],
    boolean: ['help'],
    alias: {
        h: 'help',
        n: 'name',
        o: 'outdir',
        s: 'sleep',
        f: 'format',
        c: 'cover'
    },
    default: {
        format: 'epub'
    }
});

// export async function downloadCbz(data: EpubContentOptions[], outFolder: string, fetchFunc: typeof fetch2 = fetch2) {
//     for(let chap = 1; chap <= data.length; chap++){
//         const chapter = data[chap - 1];

//         // ?? 是否应该分文件？
//     }
// }

export default async function main(){
    if(args.help){
        console.log(`zComicLib V1.0.0
下载漫画，支持输出cbz(ComicInfo.xml)或者epub格式。

用法:
    comic [起始URL] [漫画名] [封面URL]

参数:
    -n, --name <name>    漫画名，默认为当前时间戳
    -o, --outdir <dir>   输出目录，默认为out/
    -s, --sleep <sec>    指定最大下载间隔，默认为1秒（0~1）
    -f, --format <fmt>   输出格式(cbz/epub)，默认为epub
    -c, --cover <url>    封面URL，默认为无

示例:
    comic https://www.example.com/comic/ 无名漫画 https://www.example.com/comic/cover.jpg
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

    if(typeof args._[0] == 'string' && await exists(args._[0])){
        // read exported file
        const file = Deno.readTextFileSync(args._[0]);
        const fname = basename(args._[0]);

        // get info from file
        const __dot = fname.indexOf('.');
        name = fname.slice(0, __dot);
        site = fname.slice(__dot + 1, fname.lastIndexOf('.'));
        mod = await import(`./comiclib/${site}.ts`);

        // parse
        let currentChap = {
            data: '',
            title: ''
        };
        const lines = file.split('\n');
        if(!lines.shift()?.startsWith('zComicLib V1')){
            throw new Error('文件格式错误(版本：zComicLib V1).');
        }
        cover = lines.shift()!;
        if(!cover) throw new Error('文件过早结束，格式错误');

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
        let start: string | null;
        if(Deno.stdin.isTerminal() || Deno.env.has('DENOVEL_TERMINAL'))
            start = args._[0] as string || await readline('输入起始URL >> ');
        else
            start = JSON.parse(Deno.readTextFileSync('debug.json')).url;
        if(!start) Deno.exit(0);

        // 解析
        const urlStart = new URL(start);
        site = urlStart.hostname;
        if(!await moduleExists(`./comiclib/${site}.ts`)){
            console.error(`没有找到站点 ${site} 的漫画下载脚本.`);
            Deno.exit(1);
        }
        mod = await import(`./comiclib/${site}.ts`);
        const funcNext = mod.default as (url: string) => AsyncGenerator<string, [string, string], string>;

        if('getInfo' in mod) try{
            const { title: _name, cover: _cover, firstPage } = await mod.getInfo(start) as ComicMainInfo;
            name = _name;
            cover = _cover;
            if(!firstPage) throw new Error('未找到漫画第一页');
            start = String(firstPage);
        }catch(e){ console.error(`自动化获取漫画信息失败: ${(e as Error).message}`); }
        !name && (name = args.name || await readline('输入漫画名 >> '));
        !cover && (cover = args.cover || await readline('输入封面URL >> '));

        // 缓冲TXT文件
        const txt = await Deno.open(`${out}/${name}.${site}.txt`, { create: true, write: true }),
            txtWriter = new TextEncoder();

        // meta
        txt.writeSync(txtWriter.encode('zComicLib V1 - ' + Date.now().toString() + '\n' + cover + '\n\n'));

        let chaptitle = '', urlNext = start;
        mainLoop: while(urlNext){
            const iter = funcNext(urlNext);
            let chapTxt = '', i = 0, retry = 0;
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

            chaps.push({
                data: chapTxt,
                title: chaptitle
            });
            
            console.log(`INFO ${chaptitle}(${i})`);

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
        await new EPub({
            "cover": cover ?? undefined,
            "title": name ?? '无名漫画',
            "tocTitle": name + "目录",
            "lang": "zh-CN",
            "description": "来自于 " + site + "的漫画",
            "content": chaps,
            "verbose": true,
            "networkHandler": mod.networkHandler    // 自定义网络请求函数
        }, out + '/' + filename).render();
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