import { normalize } from 'https://deno.land/std/path/normalize.ts'
import { globToRegExp } from "https://deno.land/std/path/glob_to_regexp.ts";
import { basename } from "https://deno.land/std/path/basename.ts";
import { dirname } from "https://deno.land/std/path/dirname.ts";
import ProgressBar from "https://deno.land/x/progressbar/progressbar.ts";
import { percentageWidget } from "https://deno.land/x/progressbar/widgets.ts";
import { ensureDir } from "https://deno.land/std/fs/ensure_dir.ts";
import { delay } from "https://deno.land/std/async/delay.ts";
import { tree, ensure, replaceFmt, arg, help } from './_dep.ts';

export default async function main(){
    help(`
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
    `);
    if (typeof arg.from != 'string' || typeof arg.to != 'string')
        throw new Error('--from --to 必须定义，详见帮助(--help)');

    if (arg.delete)
        if (!await ensure('将要删除需转换的文件，继续吗?'))
            Deno.exit(1);

    let size = 0;
    if (typeof arg.delete == 'number') size = arg.delete;

    let progress = 0;

    for await (const file of tree(arg.input || './', globToRegExp(arg.from))) {
        const args = ['-i', file],
            out = replaceFmt(file, arg.to);
        if (arg.ab && typeof arg.ab == 'number') args.push('-ab', arg.ab.toString());
        if (arg.vb && typeof arg.vb == 'string') args.push('-vb', arg.vb);
        if (arg.vc && typeof arg.vc == 'string') args.push('-c:v', arg.vc);
        if (arg.ac && typeof arg.ac == 'string') args.push('-c:a', arg.ac);
        if (arg.fps && typeof arg.fps == 'number') args.push('-r', arg.fps.toString());
        if (arg.vf && typeof arg.vf == 'string') args.push('-vf', arg.vf);
        
        await ensureDir(dirname(file));
        progress++;

        console.clear();
        console.log(progress, ') ', '任务:', basename(file), '--> (format)', arg.to);

        new Deno.Command('ffmpeg', {
            stdin: 'inherit',
            stdout: 'inherit',
            stderr: 'inherit',
            args: args.concat(['-y', out])
        }).outputSync()

        if (arg.delete) {
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
    }
}

if(import.meta.main) await main();
