/**
 * denovel可执行
 */

import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

const useModule = (m: string) => () => import(`./${m}.ts`).then(m => m.default());
const builtins: Record<string, [() => Promise<any>, string, boolean]> = {
    // 需要交互的不能async执行
    // name: [function, description, asyncAble]
    "downovel": [useModule("main"), "下载小说", false],
    "downcomic": [useModule("comic"), "下载漫画", false],
    "conv": [useModule("conv"), "转换文件格式", true],
    "2epub": [useModule("2epub"), "转换txt文件到epub格式", true],
    "2txt": [useModule("2txt"), "转换epub文件到txt格式", true],
    "part": [useModule("part"), "将txt文件分割成文件夹(每文件夹60个文件)", true],
    "downmusic": [useModule("neast"), "下载网易云音乐歌单", false],
    "server": [useModule("server"), "启动下载服务器(不稳定，待完整测试)", true],
    "t2cn": [useModule("t2cn"), "将(带繁体文本的)txt文件转换为简体中文格式", false],
    'lanzou': [useModule("lanzoudl"), '下载蓝奏云分享文件', false],
    "cbz2img": [useModule("cbz2img"), "将cbz文件转换为长图片", true],
    "copy": [useModule("copy"), "带多样化功能的复制文件夹下文件工具", true],
    "find": [useModule("findkeyword"), "查找文件中包含指定关键字的文件，并输出和归类", true],
    "update": [useModule("updateshelf"), "更新书库，自动下载更新内容", true],
    "17c": [useModule("17c"), "猜猜看，这是什么", false],
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
    while(!(res = await rd.read()).done) await cb(res.value);
}
const resizeAndWrite = (data: Uint8Array, target: { value: Uint8Array }) => {
    const rt = target.value;
    target.value = new Uint8Array(data.length + rt.byteLength);
    target.value.set(rt, 0);
    target.value.set(data, rt.byteLength);
}
const decode = async (data: Uint8Array) => {
    const text = new TextDecoder().decode(data);
    text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    let pos = 0, prevpos = 0;
    while(-1 != (pos = text.indexOf("\n", prevpos))){
        await Deno.stdout.write(new TextEncoder().encode(
            text.substring(prevpos, pos +1)
        ));
        prevpos = pos +1;
    }
}
const coWrite = async (pipe: WritableStream, abort: AbortSignal) => {
    const wr = pipe.getWriter();
    const buf = new Uint8Array(1024);
    let done = false;
    wr.closed.then(() => done = true);
    while(!abort.aborted && !done){
        const read = await Deno.stdin.read(buf);
        if(!read || done) break;
        try{
            await wr.write(buf.subarray(0, read));
        }catch{ /* broken pipe */ }
    }
}
type BufRef = { value: Uint8Array, stdin: WritableStreamDefaultWriter };
async function spawn(args: string[], asyncAble: boolean = false, bufref?: BufRef, abort?: AbortSignal) {
    const cmd = new Deno.Command(Deno.execPath(), {
        args: args,
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'piped',
        env: {
            DENOVEL_TERMINAL: "true"
        }
    }).spawn();
    if(asyncAble){
        // @ts-ignore
        assert(bufref instanceof Object);
        bufref!.stdin = cmd.stdin.getWriter();
        bufref!.value = new Uint8Array(0);
        await Promise.all([
            coRead(cmd.stdout, d => resizeAndWrite(d, bufref!)),
            coRead(cmd.stderr, d => resizeAndWrite(d, bufref!))
        ]);
    }else{
        coRead(cmd.stderr, d => decode(d));
        let ctrl;
        if(!abort) {
            ctrl = new AbortController();
            abort = ctrl.signal;
        }
        coWrite(cmd.stdin, abort);
        await coRead(cmd.stdout, d => decode(d));
        if(ctrl) ctrl.abort();
    }
}

export async function readline(prompt: string) {
    await Deno.stdout.write(new TextEncoder().encode(prompt + ' '));
    const CRLF = new TextEncoder().encode("\r\n");
    const buf = new Uint8Array(1024);
    let offset = 0;
    while(true){
        const data = await Deno.stdin.read(buf.subarray(offset));
        if(!data) continue;
        for(let i = offset; i < offset + data; i++){
            if(buf[i] == CRLF[1] || buf[i] == CRLF[0]){
                const line = new TextDecoder().decode(buf.subarray(0, i));
                return line;
            }
        }
        offset += data;
    }
}

async function exeMain(){
    const args = Array.from(Deno.args);
    if (args.length == 0){
        // repl
        const startedCorutine = {} as Record<string, BufRef & { done: boolean | undefined } | undefined>;
        while (true) try{
            const input = await readline("densh # ");
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
                    console.log(`[i] 异步任务${name}执行完毕`);
                    startedCorutine[name]!.done = true;
                }).catch((e) => {
                    console.error(`[!] 异步任务${name}执行失败`, e);
                    startedCorutine[name]!.done = true;
                });
                console.log(`异步任务 ${name} 启动成功，输入"log ${name}"获取日志`);
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
                await spawn(commands, false);
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
        console.log('执行', Deno.args);
        fn();
    } catch (e) {
        console.error(`模块${cmd}执行失败`, e);
        Deno.exit(1);
    }
}

if (import.meta.main) {
    exeMain();
}