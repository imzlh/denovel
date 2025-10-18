#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env
import { parseArgs } from "@std/cli";
import { checkIsTraditional, readline, useLogger } from "../src/core/utils.ts";
import { downloadFromTXT, downloadNovel, logger } from "../src/core/novel.ts";
import Events from '../src/core/event.ts';
import { useLifeCycle } from "../src/core/lifecycle.ts";

async function main(_args: string[]) {
    const args = parseArgs(_args, {
        string: ['name', 'outdir', 'charset', 'sleep', 'retry', 'timeout', 'cover'],
        boolean: ['help', 'epub', 'parted', 'translate', 'no-overwrite'],
        alias: {
            h: 'help',
            n: 'name',
            o: 'outdir',
            s: 'sleep',
            r: 'retry',
            c: 'charset',
            t: 'timeout',
            e: 'epub',
            p: 'parted',
            l: 'translate',
            b: 'cover',
            w: 'no-overwrite'
        },
        default: {
            outdir: './downloads/',
            sleep: '1',
            retry: '3',
            charset: 'utf-8',
            timeout: '10'
        }
    });

    if (args.help) {
        console.log(`用法: main.ts [options] [url|file]
参数:
    -h, --help              显示帮助信息
    -n, --name              输出文件名，默认为index.html
    -o, --outdir            输出目录，默认为当前目录
    -s, --sleep             间隔时间防止DDOS护盾deny，单位秒，默认0
    -r, --retry             最大重试次数，默认10
    -c, --charset           网页编码，默认从网站中获取
    -t, --timeout           超时时间，单位秒，默认30
    -p, --parted            指定输入源为分完页的文本，这时不会输出自动生成的标题
    -e, --epub              输出epub文件
    -l, --translate         翻译模式，将输出的繁体翻译为简体中文
    -w, --no-overwrite      禁止覆盖已有文件
    -b, --cover             封面URL，默认为空
        --error-count       指定多少次连续少内容时退出，默认10
    -g, --login             打开浏览器窗格。在这个窗格中，任何cookie都会被记录下来
                            特别适用于登陆账号！
    -d, --data-dir          指定配置文件夹
        --open-config-dir   打开配置目录，用于备份/恢复配置。

示例:
    - 下载来自www.baidu.com的繁体简体中文小说，输出到"output/test.txt"中
      main.ts -n test.txt -o /path/to/output -s 5 -r 10 -c utf-8 -l -u https://www.baidu.com -t 60
    - 更新由denovel生成的"a.txt"文件(小说有更新，继续下载。无需再次指定参数，全自动)
      main.ts a.txt
`);
        return;
    }

    const globalExitSignal = new AbortController();
    Events.on('exit', () => globalExitSignal.abort());

    const arg_0 = args._[0];
    if(typeof arg_0 === 'string' && arg_0.endsWith('.txt')){
        console.log('从文件下载小说');
        await useLogger(downloadFromTXT(arg_0, {
            sig_abort: globalExitSignal.signal
        }), logger);
        return;
    }

    let start_url;
    // let cover: string | null = null;
    const logs = [];
    if (args.epub) logs.push('epub模式');
    if (args.translate) logs.push('翻译模式');
    if (!args.parted) logs.push('分页模式');
    if(!args.sleep) console.warn('警告：缺少-s参数，可能导致DDOS防护拦截');
    console.log.apply(console, logs);

    const initArgs = {
        traditional: false,
        to_epub: args.epub,
        outdir: args.outdir,
        disable_parted: args.parted,
        translate: args.translate,
        disable_overwrite: args['no-overwrite'],
        sig_abort: globalExitSignal.signal
    } as Parameters<typeof downloadNovel>[1];

    if (Deno.stdin.isTerminal() || Deno.env.has('DENOVEL_TERMINAL')){
        start_url = arg_0 || await readline("请输入起始URL >> ") || '';
        // cover = args.cover || await readline("请输入封面URL(可选,自动) >> ");
    } else {
        start_url = JSON.parse(Deno.readTextFileSync('debug.json')).url;
        console.log('从debug.json中读取url:', start_url);
        initArgs.no_input = true;
        initArgs.book_name = 'debug';
    }
    if (!start_url) return;

    initArgs.traditional = await checkIsTraditional(new URL(start_url));
    // await downloadNovel(start_url, initArgs);
    await useLogger(downloadNovel(start_url, initArgs), logger);
}

if (import.meta.main) useLifeCycle(main, Deno.args);
