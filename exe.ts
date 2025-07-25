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
    // name: [function, description, asyncAble]
    "downovel": [dowNovel, "下载小说", false],
    "downcomic": [downComic, "下载漫画", false],
    "conv": [convMain, "使用外置ffmpeg，转换文件格式", true],
    "2epub": [epubMain, "转换txt文件到epub格式", true],
    "2txt": [txtMain, "转换epub文件到txt格式", true],
    "part": [partMain, "将txt文件分割成文件夹(每文件夹60个文件)", true],
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

const coRead = async (pipe: ReadableStream, cb: (data: Uint8Array) => any) => {
    const rd = pipe.getReader();
    let res;
    while(!(res = await rd.read()).done) cb(res.value);
}
const resizeAndWrite = (data: Uint8Array, target: { value: Uint8Array }) => {
    const rt = target.value;
    console.log(new TextDecoder().decode(data));
    target.value = new Uint8Array(data.length + rt.byteLength);
    target.value.set(rt, 0);
    target.value.set(data, rt.byteLength);
}
const coWrite = async (pipe: WritableStream, abort: AbortSignal) => {
    const wr = pipe.getWriter();
    const buf = new Uint8Array(1024);
    let done = false;
    wr.closed.then(() => done = true);
    while(!abort.aborted && !done){
        const read = await Deno.stdin.read(buf);
        if(!read) break;
        await wr.write(buf.subarray(0, read));
    }
}
type BufRef = { value: Uint8Array, stdin: WritableStreamDefaultWriter };
async function spawn(args: string[], asyncAble: boolean = false, bufref?: BufRef, abort: AbortSignal = new AbortController().signal) {
    const cmd = new Deno.Command(Deno.execPath(), {
        args: args,
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'piped'
    }).spawn();
    console.log(Deno.execPath(), args);
    if(asyncAble){
        // @ts-ignore
        if(!bufref) bufref = {};
        bufref!.stdin = cmd.stdin.getWriter();
        bufref!.value = new Uint8Array(0);
        coRead(cmd.stdout, d => resizeAndWrite(d, bufref!));
        coRead(cmd.stderr, d => resizeAndWrite(d, bufref!));
    }else{
        await Promise.all(
            [
                coRead(cmd.stdout, d => console.log(new TextDecoder().decode(d))),
                coRead(cmd.stderr, d => console.error(new TextDecoder().decode(d))),
                coWrite(cmd.stdin, abort)
            ]
        );
    }
}

const args = Array.from(Deno.args);
if (args.length == 0){
    // repl
    const startedCorutine = {} as Record<string, BufRef & { done: boolean | undefined } | undefined>;
    while (true) try{
        const input = prompt(">>");
        if (!input) continue;
        const commands = splitShellCommand(input), cmd = commands[0];
        if(!cmd) continue;
        if(cmd === 'help'){
            showHelp();
            console.log(`
repl指令：
    help            显示帮助
    exit            退出repl
    start <任务名>   启动异步任务（不会阻塞，之后你可以继续输入指令）
    log <任务名>     显示异步任务日志
    <任务名>         启动同步任务
`);
            continue;
        }else if(cmd === 'exit'){
            Deno.exit(0);
        }else if(cmd === 'start'){
            if(commands.length < 2){
                console.error('缺少异步任务名');
                continue;
            }
            const name = commands[1];
            if(name in startedCorutine && !startedCorutine[name]?.done){
                console.error(`异步任务${name}正在执行，请等待结束后再执行`);
                continue;
            }
            if(!builtins[name]){
                console.error(`异步执行错误：找不到子模块：${name}`);
                continue;
            }
            if(!builtins[name][2]){
                console.error(`模块${name}不能并行执行，无法使用start指令`);
                continue;
            }

            // @ts-ignore will be filled by spawn
            startedCorutine[name] = {};
            spawn(commands.slice(1), true, startedCorutine[name]).then(() => {
                console.log(`异步任务${name}执行完毕`);
                startedCorutine[name]!.done = true;
            }).catch((e) => {
                console.error(`异步任务${name}执行失败`, e);
                startedCorutine[name]!.done = true;
            });
            continue;
        }else if(cmd == 'log'){
            if(commands.length < 2){
                console.error('缺少异步任务名');
                continue;
            }
            const name = commands[1];
            if(!startedCorutine[name]){
                console.error(`异步任务${name}不存在`);
                continue;
            }
            const bufref = startedCorutine[name];
            console.log(new TextDecoder().decode(bufref.value));
            bufref.value = new Uint8Array(0);
            continue;
        }

        const fn = builtins[cmd]?.[0];
        if (!fn) {
            console.error(`找不到子模块：${cmd}`);
            continue;
        }
        try {
            await spawn(commands, true);
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

const cmd = Deno.args.shift()!;
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