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

const builtins: Record<string, [() => Promise<any>, string, boolean]> = {
    // name: [function, description, mutexRequired]
    "downovel": [dowNovel, "下载小说", false],
    "downcomic": [downComic, "下载漫画", false],
    "conv": [convMain, "使用外置ffmpeg，转换文件格式", false],
    "2epub": [epubMain, "转换txt文件到epub格式", false],
    "2txt": [txtMain, "转换epub文件到txt格式", false],
    "part": [partMain, "将txt文件分割成文件夹(每文件夹60个文件)", false],
    "downmusic": [neastMain, "下载网易云音乐歌单", false],
    "server": [serverMain, "启动下载服务器(不稳定，待完整测试)", true],
    "t2cn": [t2cnMain, "将(带繁体文本的)txt文件转换为简体中文格式", false],
    'lanzou': [lanzouMain, '下载蓝奏云分享文件', false]
};

function splitShellCommand(cmd: string): string[] {
    const args: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < cmd.length; i++) {
        const c = cmd[i];
        if (c === " " && !inQuotes) {
            if (current) {
                args.push(current);
                current = "";
            }
        } else if (c === '"' || c === "'") {
            if (current && !inQuotes) throw new SyntaxError(`意料之外的引号字符串：${cmd.substring(i-2)}`);
            inQuotes = !inQuotes;
        } else {
            current += c;
        }
    }

    if (current) {
        args.push(current);
    }

    return args;
}

const args = Array.from(Deno.args);
if (args.length == 0){
    // repl
    const startedCorutine = {} as Record<string, Promise<any>[]>;
    while (true) try{
        const input = prompt(">>");
        if (!input) continue;
        const [cmd,...rest] = splitShellCommand(input);
        if(!cmd) continue;
        if(cmd === 'help'){
            showHelp();
            continue;
        }else if(cmd === 'exit'){
            Deno.exit(0);
        }else if(cmd === 'wait'){
            const waitCMD = rest[0];
            if(!waitCMD){
                console.error(`wait 命令需要指定子模块名`);
                continue;
            }
            if(!startedCorutine[waitCMD]){
                console.error(`找不到子模块${waitCMD}`);
                continue;
            }
            if(startedCorutine[waitCMD].length == 0){
                console.log(`模块${waitCMD}已完成`);
                continue;
            }
            console.log(`等待模块${waitCMD}完成...`);
            await Promise.all(startedCorutine[waitCMD]);
            console.log(`模块${waitCMD}已完成`);
            continue;
        }
        const fn = builtins[cmd]?.[0];
        if (!fn) {
            console.error(`找不到子模块：${cmd}`);
            continue;
        }
        if(builtins[cmd][2] && startedCorutine[cmd]?.length == 0){
            console.error(`模块${cmd}需要等待上一个任务结束才能执行，无法并行执行\n或者，尝试 "wait ${cmd}" 命令等待结束？`);
            continue;
        }
        if(!(cmd in startedCorutine)) startedCorutine[cmd] = [];
        try {
            Deno.args.splice(0);
            Deno.args.push(...rest);
            const prom = fn();
            prom.then(() => startedCorutine[cmd].splice(startedCorutine[cmd].findIndex(p => p === prom)));
            prom.catch(e => console.error(`模块${cmd}执行失败`, e));
            startedCorutine[cmd].push(prom);
        } catch (e) {
            console.error(`模块${cmd}执行失败`, e);
        }
    }catch(e){
        console.error(e);
    }
}

function showHelp(){
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
}

if (args[0] == 'help') {
    showHelp();
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