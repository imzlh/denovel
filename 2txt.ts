import { parseArgs } from "jsr:@std/cli/parse-args";
import { basename, dirname, extname, join } from "jsr:@std/path";
import * as zip from 'jsr:@quentinadam/zip';
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { toEpub } from "./2epub.ts";

/**
 * EPUB转TXT
 * @param data 输入的文件内容
 * @param input 输入的文件名
 * @param output 输出位置
 */
export async function toTXT(source: Uint8Array, outdir: string): Promise<void> {
    // 释放所有文件
    const files = await zip.extract(source);

    // 提取关键文件
    const keyfile: Record<string, Uint8Array | null> = {
        mimetype: null,
        "META-INF/container.xml": null
    };
    for (const file of files) {
        if (keyfile[file.name] === null) {
            keyfile[file.name] = file.data;
        }
    }

    if (keyfile.mimetype === null || keyfile["META-INF/container.xml"] === null
        || new TextDecoder().decode(keyfile.mimetype) !== "application/epub+zip")
        throw new Error("Invalid EPUB file: mimetype or container.xml not found or not valid");

    // 解析container.xml
    const container = new DOMParser().parseFromString(new TextDecoder().decode(keyfile["META-INF/container.xml"]), 'text/html');
    const rootfileEl = container.querySelector('rootfile[media-type="application/oebps-package+xml"][full-path]');
    if (!rootfileEl)
        throw new Error("Invalid EPUB file: rootfile not found or not valid");

    const rootfile_path = rootfileEl.getAttribute("full-path")!;
    const rootfile = files.find(file => file.name === rootfile_path);
    if (!rootfile)
        throw new Error("Invalid EPUB file: rootfile not found");

    function getF(path: string){
        const f = dirname(rootfile_path) + '/' + path;
        return files.find(file => file.name === f);
    }

    // 解析OPF文件
    const opf = new DOMParser().parseFromString(new TextDecoder().decode(rootfile.data), 'text/html');
    const dcMeta = opf.querySelector('metadata')!;
    const meta = {
        version: parseFloat(opf.querySelector('package[version]')?.getAttribute('version')!),
        title: dcMeta.getElementsByTagName('dc:title')[0]?.textContent,
        author: (dcMeta.getElementsByTagName('dc:creator')[0]?.textContent),
        publisher: dcMeta.getElementsByTagName('dc:publisher')[0]?.textContent,
        date: dcMeta.getElementsByTagName('dc:date')[0]?.textContent,
        cover: opf.getElementsByTagName('meta[name="cover"]')[0]?.getAttribute('content'),
        description: opf.getElementsByTagName('dc:description')[0]?.textContent,
    };
    console.log(meta);

    if (isNaN(meta.version) || meta.version < 2) {
        throw new Error("Unsupported EPUB version: " + meta.version);
    }

    // 生成ID目录
    const idMap: Record<string, string> = {};
    for (const el of opf.querySelectorAll('package > manifest > item[id][href]')) {
        const id = el.getAttribute('id')!, href = el.getAttribute('href')!;
        console.log(`ID: ${id} => ${href}`);
        if(el.getAttribute('media-type') === 'application/xhtml+xml'){
            if (id in idMap) throw new Error(`Duplicate ID in manifest: ${id}`);
            idMap[id] = href;
        }
    }

    // 提取章节内容
    const chapters: { content: string, title: string }[] = [];
    for (const el of opf.querySelectorAll('package > spine itemref[idref]')) {
        const idref = el.getAttribute('idref')!;
        const filePath = idMap[idref];
        if (!filePath){
            console.log(`Warning: 未找到ID为${idref}的章节文件`);
            continue;
        }
        const chapter = getF(filePath);
        if (!chapter) throw new Error(`Chapter file not found: ${filePath}`);
        const content = new TextDecoder().decode(chapter.data);
        chapters.push({
            content,
            title: el.parentElement?.getElementsByTagName('dc:title')[0]?.textContent || idref
        });
    }
    console.log(chapters.map(c => c.title));

    // 生成TXT
    let txt = '';
    await ensureDir(outdir);
    for (let i = 0; i < chapters.length; i++) try {
        const chapter = chapters[i];
        const document = new DOMParser().parseFromString(chapter.content, 'text/html');

        // 提取图片
        const imgs = Array.from(document.querySelectorAll('img[src]'));
        for (const img of imgs) try {
            const src = img.getAttribute('src')!;
            const imgData = getF(src);
            if (!imgData) throw new Error(`Image file not found: ${src}`);

            // write to file
            await ensureDir(outdir + dirname(src));
            await Deno.writeFile(outdir + src, imgData.data);

            // redirect
            img.setAttribute('src', 'file://.' + src);
        } catch (e) {
            console.error(`Error parsing image in chapter ${i + 1}: ${(e as Error).message}`);
        }

        txt += `第${i}章 ${chapter.title}\r\n${document.body.innerText.trim()}\r\n\r\n`;
    } catch (e) {
        console.error(`Error parsing chapter ${i + 1}: ${(e as Error).message}`);
    }

    return Deno.writeTextFile(outdir + '/content.txt', txt);
}

interface ConvertOptions {
    output: string;
    name: string;
    delete: boolean;
    force: boolean;
    'to-epub': boolean;
    'no-images': boolean;
    help: boolean;
}

async function main() {
    // 增强型参数解析
    const args = parseArgs(Deno.args, {
        string: ['output', 'name'],
        boolean: ['to-epub', 'no-images', 'help', 'delete', 'force'],
        alias: {
            o: 'output',
            e: 'to-epub',
            i: 'no-images',
            h: 'help',
            d: 'delete',
            f: 'force',
            n: 'name',
            c: 'chapterMax'
        },
        default: {
            output: '',
            name: '',
            delete: false,
            force: false,
            toEpub: false,
            noImages: false,
            chapterMax: 0
        }
    });

    // 改进的帮助信息
    if (args.help) {
        console.log(`
EPUB/TXT转换工具 v1.2

用法:
  deno run -A 2txt.ts [选项] <输入文件或目录>

选项:
  -o, --output <路径>   设置输出路径 (默认: 输入文件同目录)
  -n, --name <名称>     设置输出文件名 (不含扩展名)
  -e, --to-epub         TXT转EPUB模式 (默认: EPUB转TXT)
  -i, --no-images       忽略图片 (仅生成文本)
  -d, --delete         转换后删除原文件
  -f, --force          忽略错误继续处理
  -c, --chapterMax <N> 设置最大章节数 (0=无限制)
  -h, --help           显示帮助信息

示例:
  1. EPUB转TXT: 
     deno run -A 2txt.ts input.epub -o output.txt
  2. 批量转换目录: 
     deno run -A 2txt.ts ./epubs -o ./txts -i
  3. TXT转EPUB: 
     deno run -A 2txt.ts input.txt -e -n "书名"
`);
        Deno.exit(0);
    }

    // 输入验证
    const input = args._[0] || "E:\\docs\\Documents\\6.8\\紫韵.txt.epub";
    if (typeof input !== 'string') {
        console.error("错误: 必须指定输入文件或目录");
        Deno.exit(1);
    }

    try {
        const finfo = await Deno.stat(input);
        let files: string[] = [];

        if (finfo.isDirectory) {
            // 改进的目录处理
            for await (const entry of Deno.readDir(input)) {
                if (entry.isFile) {
                    const ext = entry.name.split('.').pop()?.toLowerCase();
                    if ((args.toEpub && ext === 'txt') || (!args.toEpub && ext === 'epub')) {
                        files.push(join(input, entry.name));
                    }
                }
            }
            if (files.length === 0) {
                console.error(`错误: 目录中没有找到符合条件的文件 (${args.toEpub ? '*.txt' : '*.epub'})`);
                Deno.exit(1);
            }
        } else {
            // 文件扩展名验证
            const ext = input.split('.').pop()?.toLowerCase();
            if ((args.toEpub && ext !== 'txt') || (!args.toEpub && ext !== 'epub')) {
                console.error(`错误: 输入文件格式不匹配 (应为 ${args.toEpub ? '*.txt' : '*.epub'})`);
                Deno.exit(1);
            }
            files = [input];
        }

        // 输出目录处理
        const outputDir = args.output ? dirname(args.output) : dirname(input);
        await ensureDir(outputDir);

        // 并行处理文件
        console.time('转换耗时');
        await Promise.all(files.map(file => processFile(file, args)));
        console.timeEnd('转换耗时');

        console.log('✅ 转换完成');
    } catch (error) {
        console.error(`❌ 发生错误: ${error}`);
        Deno.exit(1);
    }
}

async function processFile(file: string, args: ConvertOptions) {
    try {
        const fileName = basename(file, extname(file));
        const outputName = args.name || fileName;
        const outputBase = join(
            args.output ? dirname(args.output) : dirname(file),
            args.output && !extname(args.output) ? args.output : outputName
        );

        if (args["to-epub"]) {
            // TXT转EPUB处理
            const txtContent = await Deno.readTextFile(file);
            const epubPath = `${outputBase}.epub`;
            toEpub(txtContent, file, epubPath, () => {
                console.log(`生成EPUB: ${epubPath}`);
            });
        } else {
            // EPUB转TXT处理
            const epubData = await Deno.readFile(file);
            const outputPath = args["no-images"] ? `${outputBase}.txt` : `${outputBase}/content.txt`;

            await toTXT(epubData, args["no-images"] ? outputPath : `${outputBase}/`);

            if (args["no-images"]) {
                console.log(`生成TXT: ${outputPath}`);
            } else {
                console.log(`生成TXT及资源: ${outputPath}`);
            }
        }

        // 原文件删除处理
        if (args.delete) {
            await Deno.remove(file);
            console.log(`已删除原文件: ${file}`);
        }
    } catch (error) {
        if (!args.force) throw error;
        console.error(`⚠️ 处理文件失败 ${file}: ${error}`);
    }
}

// 启动主程序
if (import.meta.main) {
    main();
}
