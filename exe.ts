/**
 * denovel可执行
 */

import dowNovel from "./main.ts";
import downComic from "./comic.ts";
import convMain from './conv.ts';
import epubMain from './2epub.ts';
import txtMain from './2txt.ts';
import partMain from './part.ts';
import neastMain from './neast.ts';
import serverMain from './server.ts';
import t2cnMain from './t2cn.ts';
import lanzouMain from './lanzoudl.ts';

const builtins: Record<string, [() => void, string]> = {
    "downovel": [dowNovel, "下载小说"],
    "downcomic": [downComic, "下载漫画"],
    "conv": [convMain, "使用外置ffmpeg，转换文件格式"],
    "2epub": [epubMain, "转换txt文件到epub格式"],
    "2txt": [txtMain, "转换epub文件到txt格式"],
    "part": [partMain, "将txt文件分割成文件夹(每文件夹60个文件)"],
    "downmusic": [neastMain, "下载网易云音乐歌单"],
    "server": [serverMain, "启动下载服务器(不稳定，待完整测试)"],
    "t2cn": [t2cnMain, "将(带繁体文本的)txt文件转换为简体中文格式"],
    'lanzou': [lanzouMain, '下载蓝奏云分享文件']
};

const args = Array.from(Deno.args);
if (args.length === 0 || args[0] == 'help') {
    console.log(
`@imzlh/denovel
Copyright (c) 2025-${new Date().getFullYear()} imzlh

用法：
    denovel <子模块名> [模块参数]
    
可用模块：
${Object.entries(builtins).map(([name, [fn, desc]]) => `    ${name}\t${desc}`).join('\n')}
详细帮助请使用 \`denovel <子模块名> -h\`

示例：
    denovel downovel -n test.html -o /path/to/output -s 5 -r 10 -c utf-8 -l -u https://www.baidu.com -t 60
` 
    );
    Deno.exit(0);
}

const cmd = args.shift()!;
const fn = builtins[cmd]?.[0];
if (!fn) {
    console.error(`找不到子模块：${cmd}`);
    Deno.exit(1);
}

try {
    fn();
} catch (e) {
    console.error(`模块${cmd}执行失败`, e);
    Deno.exit(1);
}