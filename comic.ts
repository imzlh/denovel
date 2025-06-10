import { args, exists } from "./main.ts";
import { EPub, EpubContentOptions } from './genepub.ts';
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { basename } from "jsr:@std/path@^1.0.8";

const out = 'out/', retry_count = 3;
await ensureDir(out);

if(import.meta.main){
    let name: string | null, cover: string | null, site: string;
    const chaps: EpubContentOptions[] = [];
    let mod: Record<string, any>;

    if(typeof args._[0] == 'string'){
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
        if(Deno.stdin.isTerminal())
            start = Deno.args[0] || prompt('输入起始URL >> ');
        else
            start = JSON.parse(Deno.readTextFileSync('debug.json')).url;
        if(!start) Deno.exit(0);

        // 解析
        const urlStart = new URL(start);
        site = urlStart.hostname;
        if(!await exists(`./comiclib/${site}.ts`)){
            console.error(`没有找到站点 ${site} 的漫画下载脚本.`);
            Deno.exit(1);
        }
        mod = await import(`./comiclib/${site}.ts`);
        const funcNext = mod.default as (input: string) => AsyncGenerator<string, [string, string], string>;

        name = Deno.args[1] || prompt('输入漫画名 >> ');
        cover = Deno.args[2] || prompt('输入封面URL >> ');

        // 缓冲TXT文件
        const txt = await Deno.open(`${out}/${name}.${site}.txt`, { create: true, write: true }),
            txtWriter = new TextEncoder();

        //
        txt.writeSync(txtWriter.encode('zComicLib V1 - ' + Date.now().toString() + '\n' + cover + '\n\n'));

        let urlNext = urlStart.href, chaptitle = '';
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

            await Promise.all([ delay(500), txt.write(txtWriter.encode('\n# ' + chaptitle + '\n\n')) ]);
        }

        await txt.sync();
        txt.close();
    }

    // 生成epub
    const filename = (name || Date.now().toString()).replace(/[\\/:*?"<>|]/g, '_') + '.epub';
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

    // 保存
    // const filename = (name || Date.now().toString()).replace(/[\\/:*?"<>|]/g, '_') + '.epub';
    // Deno.writeFileSync(out + '/' + filename, epub);
    console.log(`保存成功: ${filename}`);
}