import { normalize } from 'https://deno.land/std/path/normalize.ts'
import { globToRegExp } from "https://deno.land/std/path/glob_to_regexp.ts";
import { basename } from "https://deno.land/std/path/basename.ts";
import { dirname } from "https://deno.land/std/path/dirname.ts";
import ProgressBar from "https://deno.land/x/progressbar/progressbar.ts";
import { percentageWidget } from "https://deno.land/x/progressbar/widgets.ts";
import { ensureDir } from "https://deno.land/std/fs/ensure_dir.ts";
import { delay } from "https://deno.land/std/async/delay.ts";
import { tree, ensure, replaceFmt} from './_dep.ts';
import { parseArgs } from 'jsr:@std/cli/parse-args';
import { removeIllegalPath } from './main.ts';

export default async function main() {
    const arg = parseArgs(Deno.args, {
        string: ['from', 'to', 'delete', 'input', 'output', 'ab', 'ac', 'vb', 'vc', 'fps', 'vf', 'filter', 'af'],
        boolean: ['help', 'recursive'],
        alias: {
            f: 'from',
            t: 'to',
            d: 'delete',
            i: 'input',
            o: 'output',
            a: 'ab',
            b: 'ac',
            v: 'vb',
            c: 'vc',
            r: 'fps',
            l: 'filter',
            h: 'help',
            s:'recursive',
        }
    });
    if(arg.help){
        console.log(`
FFTool V1
扫描全部文件(包括子目录)，批量转换指定文件到指定格式
需要预先安装ffmpeg

Args available:
    --from <glob>
    --to <format>
    --delete <size?:sizeString>
    --output
    --input
    --ab
    --ac
    --vb
    --vc
    --fps
    --vf
    --filter
    --recursive
    `);
        Deno.exit(0);
    }
    if (typeof arg.from != 'string' || typeof arg.to != 'string')
        throw new Error('--from --to 必须定义，详见帮助(--help)');
    
    let size = 0;
    if (arg.delete) size = parseInt(arg.delete);

    let filterSize = 0;
    if (arg.filter) filterSize = parseInt(arg.filter);

    if (arg.delete !== undefined)
        if (!await ensure('将要删除' + (filterSize == 0? '所有' : '大于' + filterSize / 1024 + 'KB') + '需转换的文件，继续吗?'))
            Deno.exit(1);

    let progress = 0;

    for await (const file of tree(arg.input || './', globToRegExp(arg.from), arg.recursive)) try{
        const infilesize = await Deno.stat(file).then(s => s.size);
        if(infilesize < filterSize){
            continue;
        }

        const args = ['-i', file],
            out = removeIllegalPath(replaceFmt(file, arg.to));
        if (arg.ab) args.push('-ab', arg.ab.toString());
        if (arg.vb) args.push('-vb', arg.vb);
        if (arg.vc) args.push('-c:v', arg.vc);
        if (arg.ac) args.push('-c:a', arg.ac);
        if (arg.fps) args.push('-r', arg.fps.toString());
        if (arg.vf) args.push('-vf', arg.vf);
        
        await ensureDir(dirname(file));
        progress++;

        console.clear();
        console.log(progress, ') ', '任务:', basename(file), '--> (format)', arg.to);
        console.log(args);

        new Deno.Command('ffmpeg', {
            stdin: 'inherit',
            stdout: 'inherit',
            stderr: 'inherit',
            args: args.concat(['-y', out])
        }).outputSync()

        if (arg.delete !== undefined) {
            let outSize
            try {
                outSize = await Deno.stat(out);
            } catch {
                console.error('<!> 转换失败，文件未输出');
                await delay(3000);
                continue;
            }

            if (size && size >= outSize.size)
                console.warn('文件大小小于限制，未删除文件');
            else await Deno.remove(file);
        }
    }catch(e){
        console.error('<!> 转换失败，原因:', e);
    }
}

if(import.meta.main) main();