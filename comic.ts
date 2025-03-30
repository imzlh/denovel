import { exists } from "./main.ts";
import { EPub, EpubContentOptions } from './genepub.ts';
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";

const out = 'out/', retry_count = 3;
await ensureDir(out);

if(import.meta.main){
    const start = Deno.args[0] || prompt('输入起始URL >> ');
    if(!start) Deno.exit(0);

    // 解析
    const urlStart = new URL(start),
        site = urlStart.hostname;
    if(!await exists(`./comiclib/${site}.ts`)){
        console.error(`没有找到站点 ${site} 的漫画下载脚本.`);
        Deno.exit(1);
    }
    const funcNext = (await import(`./comiclib/${site}.ts`)).default as (input: string) => AsyncGenerator<string, [string, string], string>;

    const name = Deno.args[1] || prompt('输入漫画名 >> ');
    const cover = Deno.args[2] || prompt('输入封面URL >> ');

    // 缓冲TXT文件
    const txt = await Deno.open(`${out}/${site}.txt`, { create: true, write: true }),
        txtWriter = new TextEncoder();

    let urlNext = urlStart.href, chaptitle = '';
    const chaps: EpubContentOptions[] = []
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

    // 生成epub
    const filename = (name || Date.now().toString()).replace(/[\\/:*?"<>|]/g, '_') + '.epub';
    await new EPub({
        "cover": cover ?? undefined,
        "title": name ?? '无名漫画',
        "tocTitle": name + "目录",
        "lang": "zh-CN",
        "description": "来自于 " + site + "的漫画",
        "content": chaps,
        "verbose": true
    }, out + '/' + filename).render();


    // 保存
    // const filename = (name || Date.now().toString()).replace(/[\\/:*?"<>|]/g, '_') + '.epub';
    // Deno.writeFileSync(out + '/' + filename, epub);
    console.log(`保存成功: ${filename}`);
    await txt.sync();
    txt.close();
}