/**
 * 过滤【灵梦】小说广告
 */

import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { dirname } from "https://deno.land/std@0.224.0/path/dirname.ts";
import { basename } from "jsr:@std/path@^1.0.8/basename";
import { exists } from "./main.ts";
import { parseArgs } from "jsr:@std/cli/parse-args";

// warn: 不安全，需要进一步调试
const chars = `
零一二三四五六七八九十〇
①②③④⑤⑥⑦⑧⑨⑩
依（）紦玲柒锍盈〶
〓/〤.〳尹〉弍冷③2⊙企】
=%裠无尹妻疤〥〤冷⒎;榴〤y〵祁扒〤
〓舞丝陆'企[尔~厁〷另事〥〯玖起厁师〜
"印 起扒  玐0-7（六）y"i靈夢
鸸氿溜」⑤氵捌⒎〹易〙③
熘0」（二）倭三F寺虾ba肆Z
陾揪〡〇〪鷗 山捌气〖印〘 掺〃
（一）⒉龄衫倭澪七罒岜君羊
坝厁球韭〇企⒐V覇
裙聊IIjiu$溜焐3虾齐引衫
霓爾^彡li%n]g寺⒐qi彡死
`.replaceAll('\n', '');

const set = new Set<string>();
for(let chr of chars){
    if(('a' <= chr && chr <= 'z') || ('A' <= chr && chr <= 'Z')) continue;
    if('[]&-\\'.includes(chr)) chr = '\\' + chr;
    set.add(chr);
}
const regexp = new RegExp(`[${Array.from(set).join('')}\\^a-z]{10,30}`, 'gi');

// 灵/m@e-*/n#g/首^发
const sc = '\/@-*/#^%$&~`!'.split('').map(c => '\\' + c).join('');
const repexp = [
    /[\r\n]+\s*本书由【灵梦】[\s\S]+?私聊群主。\s*/g,
    new RegExp(`(?:灵[${sc}]{1,3}|l[${sc}]{1,3}i[${sc}]{1,3}n[${sc}]{1,3}g[${sc}]{1,3})(?:梦[${sc}]{1,3}|m[${sc}]{1,3}e[${sc}]{1,3}n[${sc}]{1,3}g[${sc}]{1,3})首[${sc}]{1,3}发`, 'gi')
];

export { regexp, repexp };
const except_reg = /零一二三四五六七八九十〇1-9a-zA-Z/g;

export function filterNoAds(content: string): string {
    let occurrence = 0;
    for(const exp of repexp){
        occurrence += (content.match(exp) || []).length;
        content = content.replace(exp, '');
    }
    // content = content.replaceAll(regexp, (txt) => {
    //     // 80%中文才替换
    //     // const occurances = (txt.match(except_reg)?.length || 1) -1;
    //     // if(occurances >= txt.length * .8) return txt;
    //     // else 
    //     console.error(txt);//debug
    //     occurrence ++;
    //     return '(_' + txt.substring(1) + txt.substring(txt.length - 1) + '_)'
    // });

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