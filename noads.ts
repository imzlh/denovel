/**
 * 过滤【灵梦】小说广告
 */

import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { dirname } from "https://deno.land/std@0.224.0/path/dirname.ts";
import { basename } from "jsr:@std/path@^1.0.8/basename";
import { exists } from "./main.ts";
import { parseArgs } from "jsr:@std/cli/parse-args";
import pinyin from "https://cdn.skypack.dev/pinyin@2.9.1";

// throw new Error('不要使用！目前还不可用！');

// 灵/m@e-*/n#g/首^发
const sc = '\/@-*/#^%$&~`!'.split('').map(c => '\\' + c).join('');
const repexp = [
    /[\r\n]+\s*本书由【灵梦】[\s\S]+?私聊群主。\s*/g,
    new RegExp(`(?:灵[${sc}]{1,3}|l[${sc}]{1,3}i[${sc}]{1,3}n[${sc}]{1,3}g[${sc}]{1,3})(?:梦[${sc}]{1,3}|m[${sc}]{1,3}e[${sc}]{1,3}n[${sc}]{1,3}g[${sc}]{1,3})首[${sc}]{1,3}发`, 'gi')
];

const getPy = (char: string) => pinyin(char, { style: "normal", heteronym: true })[0] as string[];
const py = Array.from('零一二三四五六七八九').map(getPy);

// 扩展数字匹配规则（示例，可按需补充）
const NUM_REGEX = /[零一二三四五六七八九十①②③④⑤⑥⑦⑧⑨⑩⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑]|(wu|liu|qi|ba|jiu|shi)/i;

function checkAds(content: string[]): undefined | { start: number, end: number } {
    // 标记数字和特殊字符混合区
    let start = -1;
    let hasNumber = false;
    
    for (let i = 0; i < content.length; i++) {
        const isNum = NUM_REGEX.test(content[i]); // 数字类字符
        const isSpecial = !/^[\p{Script=Han}a-zA-Z]$/u.test(content[i]); // 非汉字/字母的符号
        
        // 开始/继续可疑区间
        if (isNum || isSpecial) {
            if (start === -1) start = i;
            if (isNum) hasNumber = true;
        } else {
            // 遇到正常字符时，若区间包含数字则验证
            if (start !== -1 && hasNumber) {
                const end = i - 1;
                if (end - start + 1 >= 3) { // 至少3个元素含数字和符号
                    return { start, end };
                }
            }
            start = -1;
            hasNumber = false;
        }
    }
    
    // 处理末尾残留区间
    if (start !== -1 && hasNumber && content.length - start >= 3) {
        return { start, end: content.length - 1 };
    }
    
    return undefined;
}


function forEachByte(content: string, ref_ads?: { value: number }) {
    const queue: string[] = [];
    let lastAds = 0;
    const contentPieces: string[] = [];
    const maxQueueSize = 100;
    let i = 0;

    while (i < content.length) {
        const chr = content[i];
        
        // 优化队列维护：直接限制队列长度
        if (queue.length >= maxQueueSize) {
            queue.shift();
        } else {
            queue.push(getPy(chr)[0]);
            i++;
        }

        // 精确触发检测时机（当队列首次填满或后续维护时）
        if (queue.length === maxQueueSize) {
            const res = checkAds(queue);
            if (res) {
                // 计算绝对位置时考虑队列实际长度
                const windowStart = i - maxQueueSize;
                const absoluteStart = Math.max(windowStart + res.start, lastAds);
                const absoluteEnd = windowStart + res.end;

                // 防御性边界检查
                if (absoluteEnd >= content.length) break;
                if (absoluteStart > absoluteEnd) continue;

                contentPieces.push(
                    content.slice(lastAds, absoluteStart)
                );
                lastAds = absoluteEnd + 1;

                // 精准跳转逻辑（避免死循环核心）
                i = absoluteEnd + 1;
                queue.length = 0; // 清空队列避免残留状态
                if (ref_ads) ref_ads.value++;
                continue; // 跳过后续队列维护
            }
        }
    }

    contentPieces.push(content.slice(lastAds));
    return contentPieces.join('');
}


export function filterNoAds(content: string): string {
    let occurrence = 0;
    for(const exp of repexp){
        occurrence += (content.match(exp) || []).length;
        content = content.replace(exp, '');
    }
    const ref_ads = { value: 0 };
    content = forEachByte(content, ref_ads);
    occurrence += ref_ads.value;
    console.log(`Filtered ${occurrence} ads in ${content.length} characters.`);
    return content;
}

if (import.meta.main) {
    const args = parseArgs(Deno.args, {
        string: ['output'],
        boolean: ['help', 'delete'],
        alias: {
            o: 'output',
            h: 'help',
            d: 'delete'
        }
    });

    if (args.help) {
        console.log(`Replace AD content in txt file(s).
    
    Usage:
      deno run noads.ts [options] <input>
    
    Options:
        -o, --output <output>  Output dir (default: auto-generated)
        -h, --help             Show help
        -d, --delete           Delete input file after conversion
    
    Example:
      deno run noads.ts input.txt -o output.txt`);
        Deno.exit(0);
    }

    const input = args._[0];
    const output = dirname(args.output || input as string);
    if (typeof input !== 'string')
        throw new Error('Input file is required');
    const finfo = await Deno.stat(input);
    let files = [] as string[];
    if(finfo.isDirectory) {
        files = await Array.fromAsync(Deno.readDir(input)).then(data => 
            data.filter(item => item.isFile && item.name.endsWith('.txt')).map(item => item.name)
        );
    } else {
        files = [input];
    }

    console.time('convert');
    await ensureDir(output);
    for(const file of files) try{
        if(file.endsWith('.2.txt')) continue;
        const ofile = output + '/' + basename(file) + '.2.txt';
        // if(await exists(ofile)){
        //     console.log(`"${ofile}" already exists, skip`);
        //     continue;
        // }
        
        const data = Deno.readTextFileSync(file);
        const res = filterNoAds(data);
        Deno.writeTextFileSync(args.delete ? file : ofile, res);
    }catch(e) {
        console.error(`Error converting "${file}": ${(e as Error).message}`);
    }

    console.log('Done!');
}