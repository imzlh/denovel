// 去 特殊符号
// const pattern = /^(.+?)[⊙◎@#￥$●\-](?:.*?)\s*\.(?:txt|epub)$/
// 《我，装备锻造者》 作者：因果（全本）
// const pattern = /^.*《(.+)》\s*/
// 去除前缀www.pxdd.cc 
// const pattern = /^www\.pxdd\.cc\s*(.+)$/
// 去除前缀soushu2022.com
// const pattern = /^soushu[0-9]{4}[\._-]com(.+)$/
// 去(1)
// const pattern = /^(.+?)\s*\((\d+)\)/
// 去【xx】『西』〖夜狮首发〗［日月］
// const pattern = /^[【\[『〖［](?:.+)[\]］】』〗]《?(.+)\.(?:txt|epub)$/;
// 去末尾括号
// const pattern = /^(.+?)\s*[(（\[『〖【].+[』】〗)）\]]\.(?:txt|epub)$/;
// 去末尾半个括号
// const pattern = /^(.+?)\s*[(（\[『〖【』】〗)）\]]\.(?:txt|epub)$/;
// 去前括号
// const pattern = /^[（\(].+[）\)](.+)\.(?:txt|epub)$/
// 去 作者：
// const pattern = /^(.+?)\s*_?作者[：\:](.+)\.(?:txt|epub)$/;
// 去 by
// const pattern = /^(.+?)\s*by\s*(.+)\.(?:txt|epub)$/;
// 去 至卷...
const pattern = /^(.+?)\s*至[卷第].+?\.(?:txt|epub)$/;
// 去 两边空白
// const pattern = /^\s*(.+)\s*\.(?:txt|epub)$/;
// 以空白分割
// const pattern = /^\s*(.+?)\s+.*\.(?:txt|epub)$/;
// 去 头_《
// const pattern = /^\d*[_\.《@\【]+(.+)\.(?:txt|epub)$/;
// 去 尾_
// const pattern = /^(.+?)[_\.\[\]]+(?:_全本_)?\.(?:txt|epub)$/;
// 去 头 CWM_
// const pattern = /^CWM_?(.+)\.(?:txt|epub)$/;
// 去 如1-244
// const pattern = /^(.+?)\s*(\d+-\d+|\d+)[^\d]*\.(?:txt|epub)$/;
// 去末尾数字
// const pattern = /^(\S+)\d+\.(?:txt|epub)$/;
// 去 至第xx章
// const pattern = /^(.+?)\s*至第?([\d一二三四五六七八九十百千]+)章.*\.(?:txt|epub)$/;
// 书名在 # 后面
// const pattern = /^(?:.+?)\s*#\s*(.+)\s*\.(?:txt|epub)$/;
// 多_＆
// const pattern = /^([^a-z刺].+?)\s*[_＆]+.*\.(?:txt|epub)$/i;
// 去除末尾来自XXX群...飞卢内部群
// const pattern = /^(.+?)\s*来自.{1,3}群\d+?\.(?:txt|epub)$/i;
// const pattern = /^(.+?)飞卢内部群\.(?:txt|epub)$/i;
// 去除单个(后的内容
// const pattern = /^(.+?)\s*\(([^)]*?)\./;
// 去除 多个txt
// const pattern = /^(.+?)\s*(\.txt)+$/i;

import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

// const pattern = /^(.+?)\s*来自.{1,3}群\d+?\.(?:txt|epub)$/i;
const extname = 'txt';
await ensureDir('trash')
for (const f of Deno.readDirSync('./')){
    if(!f.name.toLowerCase().endsWith('.' + extname)) continue;
    const match = pattern.exec(f.name)
    if (match && match[1] && !/^[a-z0-9\-_\.]$/i.test(match[1])) {
        if(f.name == match[1] + '.' + extname) continue;
        const oname = `./${match[1].trim()}.${extname}`;
        try{
            const stat = Deno.statSync(oname);
            if(stat.isFile) {
                // compare size
                const size1 = Deno.statSync(`./${f.name}`).size;
                const size2 = stat.size;
                if(Math.abs(size1 - size2) < 1024 * 10){
                    console.log(`Delete ${f.name} due to same size`);
                    Deno.renameSync(`./${f.name}`, `./trash/${f.name}`);
                    continue;
                } else {
                    console.log(`Overwrite ${oname} due to different size`)
                }
            }
        }catch{}
        Deno.renameSync(`./${f.name}`, oname);
        console.log(`Renamed ${f.name} to ${match[1]}.${extname}`)
    }
    // 输出名字<3字符的文本，提示是否删除
    // await ensureDir('trash')
    // if (f.name.length <= 6) {
    //     console.log(f.name)
    //     // move to trash
    //     Deno.renameSync(`./${f.name}`, `./trash/${f.name}`)
    // }
}