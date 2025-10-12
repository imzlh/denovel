/**
 * 解析这些特殊小说名称
 * - 当大号穿越异世遇上创世神小号⊙1-extra卷第20章（完本）.txt
 * - 【灵梦特殊广告书】崩坏，活下去⊙48w[多看阅读].epub
 * - 【南锦】我的丧尸女王每天都想跟我贴贴⊙完本.txt
 * - 御兽：悟性逆天，开局须佐套大佛无广告【去除大部分】.txt
 */

import { assert, assertEquals, fail } from "https://deno.land/std@0.92.0/testing/asserts.ts";

const regexp = /^(?:[【\[].+?[】\]]\s*)?(.+?)⊙(?:([^-]+)-([^（]+))?.*?(（完本）)?\.(txt|epub)$/i;

Deno.test("normalize", () => {
    for(const name of [
        "当大号穿越异世遇上创世神小号⊙1-extra卷第20章（完本）.txt",
        "【灵梦特殊广告书】崩坏，活下去⊙48w[多看阅读].epub",
        "【南锦】我的丧尸女王每天都想跟我贴贴⊙完本.txt",
        "_1加功德，我真不是气运之子啊⊙1-151.txt"
    ]){
        const match = name.match(regexp);
        if (match) {
            console.log(match);
        } else {
            fail("match failed");
        }
    }
});

if(import.meta.main && Deno.args.length > 0){
    const dir = Deno.args[0];
    Deno.chdir(dir);
    const filemap: Record<string, [string, number][]> = {};
    for (const entry of Deno.readDirSync(".")) {
        if (entry.isFile) {
            const name = entry.name;
            const match = name.match(regexp);
            if (match) {
                let [_, _title, start, end, finished, ext] = match;
                _title = _title.trim().split('⊙')[0];
                const title = _title + '.' + ext;
                if(!(title in filemap)){
                    filemap[_title] = [];
                }
                const obj = filemap[_title];
                obj.push([name, Deno.statSync(name).size]);
            }else if(name.includes("无广告")){
                const title = name.split("无广告")[0] + '.' + name.split(".").pop();
                if(!(title in filemap)) filemap[title] = [];
                const obj = filemap[title];
                obj.push([name, Deno.statSync(name).size]);
            }else if(name.endsWith(".txt") || name.endsWith(".epub")){
                // 已经预处理的小说
                const key = name.split('.')[0].split('⊙')[0];
                if(!(key in filemap)) filemap[key] = [];
                const obj = filemap[key];
                obj.push([name, Deno.statSync(name).size]);
            }else{
                console.log(`ignore "${name}"`);
            }
        }
    }
    for(const title in filemap){
        const obj = filemap[title];
        obj.sort((a, b) => b[1] - a[1]);
        const keep = obj.pop()!;
        for(const [name, size] of obj){
            console.log(`rm "${name}" (size=${size})`);
            Deno.removeSync(name);
        }
        const extname = keep[0].split(".").pop()!;
        if(keep[0] == `${title}.${extname}`){
            console.log(`ignore "${title}" (biggest)`)
        }else{
            console.log(`mv "${keep[0]}" to "${title}.${extname}" (biggest)`);
            Deno.renameSync(keep[0], `${title}.${extname}`);
        }
    }
}