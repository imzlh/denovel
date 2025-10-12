// 去 特殊符号
// const pattern = /^(.+?)[⊙◎@#￥$●\-](?:.+?)\s*\.txt$/
// 《我，装备锻造者》 作者：因果（全本）
// const pattern = /^.*《(.+)》\s*/
// 去除前缀www.pxdd.cc 
// const pattern = /^www\.pxdd\.cc\s*(.+)$/
// 去(1)
// const pattern = /^(.+?)\s*\((\d+)\)/
// 去【xx】『西』〖夜狮首发〗［日月］
// const pattern = /^[【\[『〖［](?:.+)[\]］】』〗]《?(.+)\.txt$/;
// 去末尾括号
// const pattern = /^(.+?)\s*[(（\[『〖【].+[』】〗)）\]]\.txt$/;
// 去末尾半个括号
// const pattern = /^(.+?)\s*[(（\[『〖【』】〗)）\]]\.txt$/;
// 去前括号
// const pattern = /^[（\(].+[）\)](.+)\.txt$/
// 去 作者：
// const pattern = /^(.+?)\s*_?作者[：\:](.+)\.txt$/;
// 去 两边空白
// const pattern = /^\s*(.+)\s*\.txt$/;
// 以空白分割
// const pattern = /^\s*(.+?)\s+.*\.txt$/;
// 去 头_《
// const pattern = /^\d*[_\.《@\【]+(.+)\.txt$/;
// 去 尾_
// const pattern = /^(.+?)[_\.\[\]]+(?:_全本_)?\.txt$/;
// 去 头 CWM_
// const pattern = /^CWM_?(.+)\.txt$/;
// 去 如1-244
// const pattern = /^(.+?)\s*(\d+-\d+|\d+)[^\d]*\.txt$/;
// 去末尾数字
// const pattern = /^(\S+)\d+\.txt$/;
// 去 至第xx章
// const pattern = /^(.+?)\s*至第?([\d一二三四五六七八九十百千]+)章.*\.txt$/;
// 书名在 # 后面
// const pattern = /^(?:.+?)\s*#\s*(.+)\s*\.txt$/;
// 多_＆
// const pattern = /^([^a-z刺].+?)\s*[_＆]+.*\.txt$/i;
// 去除末尾来自XXX群...

import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

// const pattern = /^(.+?)\s*来自.{1,3}群\d+?\.txt$/i;
for (const f of Deno.readDirSync('./')){
    if(!f.name.endsWith('.txt')) continue;
    // const match = pattern.exec(f.name)
    // if (match && match[1] && !/^[a-z0-9\-_\.]$/i.test(match[1])) {
    //     if(f.name == match[1] + '.txt') continue;
    //     Deno.renameSync(`./${f.name}`, `./${match[1].trim()}.txt`)
    //     console.log(`Renamed ${f.name} to ${match[1]}.txt`)
    // }
    // 输出名字<3字符的文本，提示是否删除
    await ensureDir('trash')
    if (f.name.length <= 6) {
        console.log(f.name)
        // move to trash
        Deno.renameSync(`./${f.name}`, `./trash/${f.name}`)
    }
}