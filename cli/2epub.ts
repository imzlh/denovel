export default async function main() {
    const args = parseArgs(Deno.args, {
        string: ['output', 'chapter-max', 'pending-limit'],
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
            m: 'merge',
            l: 'pending-limit'
        }
    });

    if (args.help) {
        console.log(`将TXT文件转换为EPUB文件

使用方法:
  deno run 2epub.ts [选项] <输入文件>
  
选项:
    -o, --output <输出目录>    指定输出目录（默认：自动）
    -h, --help                显示帮助信息
    -d, --delete              转换完成后删除输入文件
    -f, --force               覆盖已存在的输出文件
    -e, --delete-exist        如果已存在输出文件，则删除源文件
    -c, --chapter-max <n>     每章最大字符数（默认：10000）
    -t, --test-title <标题>   测试标题是否能正确处理
    -m, --merge               将少于10个字符的章节合并为一个章节
    -j, --jp-format           特殊翻译书籍格式（主要用于日语/韩语轻小说）
    -l, --pending-limit <n>   启用待处理任务限制以避免内存溢出（默认：0，无限制）

示例:
    deno run 2epub.ts input.txt -m -o output.epub
`);
        Deno.exit(0);
    }

    if (args["test-title"]) {
        let input = args._[0] || prompt('Input title >> ');
        if (typeof input !== 'string') Deno.exit(0);
        input = '\r\n' + input + '\r\n';
        let i = 0;
        for (const reg of regexp) {
            i ++;
            if (input.match(reg)) {
                console.log(`"${input.trim()}" can be processed correctly by (id=${i}) ${reg}`);
                console.log('result:', reg.exec(input));
                Deno.exit(0);
            }
        }
        console.error(`"${input.trim()}" cannot be processed correctly`);
        Deno.exit(1);
    }

    const input = args._[0];
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
    const pendingLimit = parseInt(args['pending-limit'] || '0');
    if (args['chapter-max']) chapMax = parseInt(args['chapter-max']);
    if (isNaN(chapMax) || chapMax < 1) chapMax = MAX_CHARS_PER_CHAPTER;

    console.time('convert');
    await ensureDir(output);
    let pendingTasks = 0;
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
        let res;
        try{
            res = toEpub(data, file, ofile, {
                per_page_max: chapMax,
                merge: args.merge,
                jpFormat: args["jp-format"],
                thenCB() {
                    pendingTasks --;
                },
                networkHandler(inp, ini){
                    if(inp instanceof Request){
                        return fetch(inp);
                    }
                    inp = new URL(inp, ini?.referrer);
                    for (const host in hostReplace) {
                        if (inp.hostname == host){
                            // @ts-ignore replace hostname
                            inp.hostname = hostReplace[host];
                        }
                    }
                    return fetch2(inp, {
                        ... (ini ?? {}),
                        timeoutSec: 10
                    });
                }
            });
            if(res) pendingTasks ++;
        }catch(e){
            pendingTasks --;
            throw e;
        }
        while(pendingLimit != 0 && pendingTasks >= pendingLimit){
            console.log(`Pending task limit reached, waiting for ${pendingTasks} tasks to complete...`);
            await sleep(1);
        }
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