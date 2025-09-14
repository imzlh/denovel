import { parseArgs } from "jsr:@std/cli/parse-args";
import { basename, dirname } from "jsr:@std/path";
import { generateEpub, EpubContentOptions, EpubOptions } from "./genepub.ts";
import { exists, PRESERVE_EL, tryReadTextFile, WRAP_EL, fromHTML, Status } from "./main.ts";
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";

// deno-lint-ignore no-control-regex
const rep = /[\x00-\x1F\x7F-\x9F\u200B-\u200F\uFEFF]/g;
const MAX_CHARS_PER_CHAPTER = 1e5 * 1;
const MIN_CHARS_PER_CHAPTER = 10;   // 10字最少

// 1~奇怪的传单
// chapter 1~偷吃？不，没有
// No、001姬的时代
// 倒仙初淋夏时雨 : 001 无家可归的夏大小姐
//  1~猎魔人？求爱？
// 第一季 一	我，消失了
// [第一卷  01、文艺委员]
// [1] 人生出了点小小的意外
// \n远去\n==============
// 第一节 重生
// 一，被害，重生
// 第一卷：我变成女孩子了？ 男孩子就应该喜欢女装！
//     二 归来的女仆
// 1～长的很可爱的大哥哥( ´･ω･)
//    ────────────────────────\n\n    序章
// Part.0 『为什么会变成这样的人』
// Part.12 『完美假面』no.1
// 第一卷第一章庄周梦蝶
const regexp = [
    /[\r\n]+(?:正文\s*)?第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*第\s*[零一二三四五六七八九十百千万亿0-9]+[章节回话集]([^\r\n]*)[\r\n]+/gi,
    /[\r\n]+(?:正文\s*)?第\s*[零一二三四五六七八九十百千万亿0-9]+[章节回话集]([^\r\n]*)[\r\n]+/gi,
    /[\r\n]+(?:正文\s*)?(?:Vol\.?\s*[0-9IVXLC]+\s*[：:]*\s*)?(?:Chapter|Chapt|Ch|卷)\s*[0-9IVXLC]+([^\r\n]*)[\r\n]+/gi,
    /[\r\n]+(?:正文\s*)?(?:第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*)?(?:序章|前言|楔子|尾声|后记|番外)([^\r\n]*)[\r\n]+/gi,
    /[\r\n]+(?:正文\s*)?(?:第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*)?[零一二三四五六七八九十百千万亿0-9]+(?:\s*、\s*|\s+)([^\r\n]+)[\r\n]+/gi,
    
    /[\r\n]+\s*(?:(?:chapter|part|ep)\.?\s*)\d+\s+[、. ：:~，·～．『]\s*(.*)\s*』?[\r\n]+/gi,
    /[\r\n]+\s*No[、.．]\d+\s*(.+)\s*[\r\n]+/gi,
    /[\r\n]+\s*(?:正文\s*)?\d+＜(.+)＞\s*[\r\n]+/gi,

    /[\r\n]+(?:正文\s*)?(?:第\s*[零一二三四五六七八九十百千万亿0-9]+卷\s*[：:]*\s*)?第\s*[零一二三四五六七八九十百千万亿0-9]+[～~\-－][零一二三四五六七八九十百千万亿0-9]+[章节回话集][^\r\n]*[\r\n]+/gi,
    /[\r\n]+\s*(?:正文\s*)?\[?\d+\]?\s*[、. ：:~，．·～]\s*(.+)\s*[\r\n]+/gi,
    /[\r\n]+\s*[\-零一二三四五六七八九十百千万亿0-9序]+[、. ：:~，·．～]\s*(.+)\s*[\r\n]+/gi,
    /[\r\n]+\s*(?:(?:chapter|part|ep)\.?\s*)[零一二三四五六七八九十百千万亿序0-9]+\s*(.+?)\s*[\r\n]+/gi,
    /[\r\n]+.{0,20}\s*[：:]\s*\d+\s+(.+)\s*[\r\n]+/gi,
    /[\r\n]+(.+)[\r\n]+([=\-─])\2{5,}[\r\n]+/gi,

    /[\r\n]+\s*第\s*[\-零一二三四五六七八九十百千万亿0-9]+卷\s*(?:.+)\s+(.+)\s*[\r\n]+/gi,
    /\s+第\s*[\-零一二三四五六七八九十百千万亿0-9]+\s*[章集季]\s*(.+)\s+/gi,
    /[\r\n]+\s*[\-零一二三四五六七八九十百千万亿序0-9]+\s+(.+)\s*[\r\n]+/gi
];

// 「宫城，拿这个的下一集给我。」
// 【谢啦。】
type SpecialTag = {
    [key: string]: string[];
};

const specialTag: SpecialTag = {
    'dialog': ['「', '」'],
    'quote': ['【', '『', '】', '』'],
    'comment': ['<', '>', '(', ')']
};

function addTags(text: string, sTag = specialTag): string {
    const stack: { tag: string, char: string }[] = [];
    let result = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        for (const tag in sTag) {
            if (sTag[tag].includes(char)) {
                if (sTag[tag].indexOf(char) % 2 === 0) {
                    stack.push({ tag, char });
                    result += `<${tag}>${char}`;
                } else {
                    if (stack.length > 0 && stack[stack.length - 1].char === sTag[tag][sTag[tag].indexOf(char) - 1]) {
                        result += `${char}</${stack.pop()?.tag}>`;
                    } else {
                        result += char;
                    }
                }
                continue;
            }
        }

        result += char;
    }

    while (stack.length > 0) {
        result += `</${stack.pop()?.tag}>`;
    }

    return result;
}

function splitByIndent(text: string): { title: string, data: string }[] {
    const result: { title: string, data: string }[] = [];
    let lines = text.split(/\r?\n/);

    // 原函数的备用分割逻辑
    if (lines.length == 0) lines = text.split('\r');
    if (lines.length == 0) lines = text.replaceAll(/\s{2,}/, t => '\n' + t.substring(1)).split('\n');
    if (lines.length == 0) return [{ title: "前言", data: text }];

    let currentTitle: string = "";
    let currentData: string[] = [];
    let pendingTitles: string[] = [];
    let isFirstSection = true;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") continue; // 跳过空行

        const indent = line.match(/^\s*/)?.[0].length || 0;

        if (indent === 0) {
            // 无缩进行为标题
            if (isFirstSection) {
                pendingTitles.push(trimmed);
            } else {
                pendingTitles.push(trimmed);
            }
        } else {
            // 有缩进行为内容
            if (isFirstSection && pendingTitles.length > 0) {
                currentTitle = pendingTitles.pop() || "";
                if (pendingTitles.length > 0) {
                    currentData.push(...pendingTitles);
                }
                pendingTitles = [];
                isFirstSection = false;
            }

            if (!isFirstSection && pendingTitles.length > 0) {
                if (currentTitle !== "") {
                    result.push({
                        title: currentTitle.slice(0, 50),
                        data: currentData.join('\n')
                    });
                }
                currentTitle = pendingTitles.pop() || "";
                currentData = [];
                pendingTitles = [];
            }

            currentData.push(line);
        }
    }

    // 处理最后的pendingTitles
    if (pendingTitles.length > 0) {
        if (isFirstSection) {
            currentTitle = pendingTitles.pop() || "";
            currentData = pendingTitles;
        } else {
            if (currentTitle !== "") {
                result.push({
                    title: currentTitle.slice(0, 50),
                    data: currentData.join('\n')
                });
            }
            currentTitle = pendingTitles.pop() || "";
            currentData = [];
        }
    }

    // 添加最后一个章节
    if (currentTitle !== "" || currentData.length > 0) {
        result.push({
            title: currentTitle.slice(0, 50),
            data: currentData.join('\n')
        });
    }

    return result;
}

function fromPreg(rawTxt: string, matches: Iterable<RegExpMatchArray>, merge: boolean = false) {
    const result: [string, string][] = [];
    let currentContentStart = 0;
    let pendingTitle = '';
    let pendingContent = '';

    for (const match of matches) {
        const index = match.index ?? -1;
        if (index < 0) continue;

        const title = (match[1] || '').trim();
        const contentEnd = index;

        // 总是累积内容，根据条件决定是否分割
        pendingContent += rawTxt.slice(currentContentStart, contentEnd);
        currentContentStart = index;

        if (!merge || (pendingContent.length >= MIN_CHARS_PER_CHAPTER &&
            pendingContent.length <= MAX_CHARS_PER_CHAPTER)) {
            if (pendingTitle || pendingContent) {
                result.push([pendingTitle, pendingContent]);
            }
            pendingTitle = title;
            pendingContent = '';
        } else {
            pendingContent += title; // 合并标题到内容
        }
    }

    // 处理剩余内容
    pendingContent += rawTxt.slice(currentContentStart);
    if (pendingTitle || pendingContent) {
        result.push([pendingTitle, pendingContent]);
    }

    return result.filter(([t, c]) => t || c); // 过滤空条目
}


function maxC(str: string, max: number) {
    if (str.length > max) {
        return str.slice(0, max - 3) + '...';
    }
    return str;
}

// 移除[a][/a]类tag
const removeTags = (str: string) => str.replaceAll(
    /\[\/?[a-z]+\]/g, ''
);

export function processTXTContent(text: string, jpFormat = false) {
    if(!PRESEL) PRESEL = PRESERVE_EL.concat(WRAP_EL);
    text = encodeContent(text, jpFormat);
    text = text.replaceAll(/\[img\=\d+,\d+\](.+?)\[\/img\]/g, (_, it) => {
        return it ? `<img src="${it.replaceAll('一', '-')}" referrerpolicy="no-referrer" />` : ''
    });
    // [comment]
    text = text.replaceAll(/\[comment\](.+?)\[\/comment\]/g, '<!-- $1 -->');
    const tagSt = [] as Array<string>;
    text = text.replaceAll(/\[(\/)?([a-z]{1,10})\]/g, (_, has_slash, tag) => {
        const popRes = has_slash ? tagSt.pop() : undefined;
        if (!PRESEL.includes(tag) || (has_slash && popRes != tag)) return _;
        if (has_slash && !popRes) throw new Error(`[${tag}] not matched: unexpected close tag`);
        if (has_slash) return `</${tag}>`;
        tagSt.push(tag);
        return `<${tag}>`;
    })
    return text;
}

let PRESEL: string[];
/**
 * TXT转换成EPUB
 * @param data 输入的文件内容
 * @param input 输入的文件名
 * @param output 输出位置
 */
export function toEpub(data: string, input: string, output: string, option: {
    thenCB?: () => any, per_page_max?: number, merge?: boolean, jpFormat?: boolean,
    reporter?: (status: Status, message: string) => void, networkHandler?: typeof fetch
}): boolean {
    input = input ? input.replace(/\.txt$/i, '') : '<inmemory>';
    data = data.replaceAll(/　+/g, '\r\n');  // 特殊中文空格，我们认为是换行
    if (!PRESEL) PRESEL = PRESERVE_EL.concat(WRAP_EL);
    if (!option.reporter) option.reporter = (s, m) => console.log(`[ ${Status[s]} ] ${m}`);

    // 检查是否是zComicLib?
    if (data.trimStart().startsWith('zComicLib/')) {
        option.reporter(Status.ERROR, '请使用comic.ts处理zComicLib漫画缓存文件!');
    }

    // 分卷
    const chaps: Array<EpubContentOptions> = [];
    let max: number = 0;

    const options: EpubOptions = {
        title: basename(input),
        description: "Generated by 2epub",
        content: chaps,
        // verbose: true,
        downloadAudioVideoFiles: true,
        lang: "zh-CN",
        logHandler: (level, message) => option.reporter!(Status.DOWNLOADING, `[${level}] ${message}`),
        networkHandler: option.networkHandler
    };

    let matches: Array<[string, string]> = [];
    let pregmatches: RegExpExecArray[] = [];
    const per_page_max = option.per_page_max || MAX_CHARS_PER_CHAPTER;
    for (const reg of regexp) {
        pregmatches = Array.from(data.matchAll(reg));
        max = Math.max(max, pregmatches.length);
        // console.debug(`Found ${matches.length} matches for ${reg}`);
        if (pregmatches.length * per_page_max >= data.length) {
            matches = fromPreg(data, pregmatches, option.merge);
            break;
        }
    }
    if (pregmatches.length * per_page_max < data.length) {
        const idParsed = splitByIndent(data);
        if (idParsed.length * per_page_max < data.length) {
            option.reporter(Status.ERROR, `章节数过少，疑似分片错误，请确保章节数 >= 1且遵循 “第x章 ....”`);
            option.reporter(Status.ERROR, '生成失败' + 'count: ' + max + ' length: ' + data.length + 'adv: ' + (data.length / max));
            return false;
        } else {
            option.reporter(Status.WARNING, '使用缩进分卷风险很大，请小心删除，检查内容是否有效');
            chaps.push(...idParsed);
        }
    } else {
        // debug
        if (output == undefined) {
            console.log(matches.map(m => m[0]));
            return false;
        }

        let first = true;
        let beforeText = '';
        for (const c of matches) {
            let text: string;
            try{
                text = processTXTContent(c[1], option.jpFormat);
            }catch(e){
                option.reporter(Status.WARNING, `ParseError: ` + (e as Error).message + '\n' + 'content declare tag will be preserved');
                text = c[1];
            }

            chaps.push({
                title: maxC(c[0].replaceAll(/\s+/g, ' '), 60) || (first ? '前言' : ''),
                data: text,
            });
            if (first) beforeText = c[1];
            first = false;
        }

        const match = beforeText.match(/作者[：:]\s*(.+?)\s*[\r\n]+/);
        if (match) {
            options.author = maxC(match[1], 20);
        }

        const ctxmatch = data.match(/简介[：:]\s*([\s\S]+?)(?=\r?\n{2,}|-{10,})/m);
        if (ctxmatch) {
            options.description = removeTags(ctxmatch[1].trim());
        }


        // image
        const imgmatch = beforeText.match(/(?:^|\s)封面[：:]\s*(\S+)/);
        if (imgmatch) {
            options.cover = imgmatch[1];
        } else {
            const match2 = beforeText.match(/https?:\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp)/i);
            if (match2) {
                options.cover = match2[0];
            }
        }
    }

    // 生成 epub 文件
    option.reporter(Status.CONVERTING, '生成EPUB文件: ' + output + option.jpFormat ? 'using jp format' : '' + '...');
    generateEpub(options, output).then(() => {
        option.reporter!(Status.DONE, '生成成功: ' + output);
        if (option.thenCB) option.thenCB();
    }).catch(e => {
        option.reporter!(Status.ERROR, `生成失败: ${e instanceof Error ? e.message : String(e)}`);
    });

    return true;
}

export const encodeContent = (str: string, jpFormat = false) => {
    str = '<p>' + fromHTML(str)
        .replace(/\s*[\r\n]+\s*/g, '</p><p>')
        .replace(rep, '') + '</p>';
    str = str.replaceAll(/\<p\> *\<\/p\>/g, '');

    // 特殊优化 for 日/韩轻小说
    if (jpFormat) {
        str = addTags(str)
    }

    return str;
}

export default async function main() {
    const args = parseArgs(Deno.args, {
        string: ['output', 'chapter-max'],
        boolean: ['help', 'delete', 'force', 'delete-exist', 'test-title', 'jp-format', 'merge'],
        alias: {
            o: 'output',
            h: 'help',
            d: 'delete',
            f: 'force',
            e: 'delete-exist',
            c: 'chapter-max',
            t: 'test-title',
            j: 'jp-format',
            m: 'merge'
        }
    });

    if (args.help) {
        console.log(`Convert TXT to EPUB file
    
Usage:
  deno run 2epub.ts [options] <input>
    
Options:
    -o, --output <output>  Output dir (default: auto-generated)
    -h, --help             Show help
    -d, --delete           Delete input file after conversion
    -f, --force            Overwrite existing output file
    -e, --delete-exist     Delete source file if existing output file
    -c, --chapter-max <n>  Max chars per chapter (default: 1w)
    -t, --test-title <t>   Test title whether it can be processed correctly
    -m, --merge            Merge chapters less than 10 chars into one chapter
    -j, --jp-format        Format for special translated books(mostly for Japanese/Korean light novel)
    -m, --merge            Merge chapters less than 10 chars into one chapter(mostly for 2txt processed text)
    
Example:
    deno run 2epub.ts input.txt -m -o output.epub`);
        Deno.exit(0);
    }

    if (args["test-title"]) {
        let input = args._[0] || prompt('Input title >> ');
        if (typeof input !== 'string') Deno.exit(0);
        input = '\r\n' + input + '\r\n';
        for (const reg of regexp) {
            if (input.match(reg)) {
                console.log(`"${input.trim()}" can be processed correctly by ${reg}`);
                console.log('result:', reg.exec(input));
                Deno.exit(0);
            }
        }
        console.error(`"${input.trim()}" cannot be processed correctly`);
        Deno.exit(1);
    }

    const input = args._[0] ?? 'E:\\docs\\Documents\\novelout\\downloads\\战败后诞下勇者的未亡人魔王小姐.txt';
    const output = dirname(args.output || input as string);
    if (typeof input !== 'string')
        throw new Error('Input file is required');
    const finfo = await Deno.stat(input);
    let files = [] as string[];
    if (finfo.isDirectory) {
        files = await Array.fromAsync(Deno.readDir(input)).then(data =>
            data.filter(item => item.isFile && /\.txt$/i.test(item.name)).map(item => item.name)
        );
    } else {
        files = [input];
    }

    let chapMax = MAX_CHARS_PER_CHAPTER;
    if (args['chapter-max']) chapMax = parseInt(args['chapter-max']);
    if (isNaN(chapMax) || chapMax < 1) chapMax = MAX_CHARS_PER_CHAPTER;

    console.time('convert');
    await ensureDir(output);
    for (const file of files) try {
        const ofile = output + '/' + basename(file, '.txt') + '.epub';
        if (await exists(ofile)) {
            if (args['delete-exist']) {
                console.log(`"${ofile}" already exists, delete source file`);
                Deno.removeSync(ofile);
                continue;
            }

            if (!args.force) {
                console.log(`"${ofile}" already exists, skip`);
                continue;
            }
        }

        const data = tryReadTextFile(file);
        const res = toEpub(data, file, ofile, {
            per_page_max: chapMax,
            merge: args.merge,
            jpFormat: args["jp-format"]
        });
        if (res)
            console.log(`"${file}" has been converted to "${basename(file, '.txt')}.epub"`);
        console.timeLog('convert');
        if (args.delete && res) Deno.removeSync(file);
    } catch (e) {
        console.error(`Error converting "${file}": ${(e as Error).message}`);
    }
    console.timeEnd('convert');

    console.log('Done!');
}

if (import.meta.main) main();