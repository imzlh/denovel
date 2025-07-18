import { parseArgs } from "jsr:@std/cli/parse-args";
import { basename, dirname, extname, join } from "jsr:@std/path";
import * as zip from 'jsr:@quentinadam/zip';
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { parse as parseXML, XmlNode, RegularTagNode, OrphanTagNode } from 'jsr:@melvdouc/xml-parser';
import { toEpub } from "./2epub.ts";
import { exists, processContent, tryReadTextFile } from "./main.ts";
import { ensure } from "./_dep.ts";

class ElementArray<T extends XmlNode> extends Array<T> {
    static fromXML(xml: string) {
        return new ElementArray(...parseXML(xml));
    }

    static getText(node: XmlNode): string {
        switch (node.kind) {
            case "BAD_NODE":
                return "";
            case "TEXT_NODE":
                return node.value;
            case "COMMENT_NODE":
                return "";
            case "REGULAR_TAG_NODE":
                return node.children.map(ElementArray.getText).join('');
            case "ORPHAN_TAG_NODE":
                return "";
        }
    }

    static override from(element: XmlNode[]) {
        return new ElementArray(...element.filter(node => node.kind == 'REGULAR_TAG_NODE' || node.kind == 'ORPHAN_TAG_NODE'));
    }

    get children(): ElementArray<XmlNode> {
        return new ElementArray(...this.flatMap(node => node.kind == 'REGULAR_TAG_NODE' ? node.children : []));
    }

    selectNode(name: string, attrs?: Record<string, RegExp | string | undefined>, deep = false) {
        const nodes = new ElementArray<RegularTagNode | OrphanTagNode>();
        name = name.toLowerCase();
        for (const _node of this) {
            const node = _node as XmlNode;
            if (node.kind != 'REGULAR_TAG_NODE' && node.kind != 'ORPHAN_TAG_NODE') continue;
            if (node.tagName.toLowerCase() == name) {
                if (attrs) {
                    for (const [key, value] of Object.entries(attrs)) {
                        if (!node.attributes || !(key in node.attributes)) continue; // 属性不存在
                        if (value && (typeof value == 'string' ? node.attributes[key] !== value : !value.test(node.attributes[key])))
                            continue; // 属性值不匹配
                    }
                }
                nodes.push(node);
            } else if (deep) {
                // 递归查找子节点
                if (node.kind == 'REGULAR_TAG_NODE')
                    nodes.push(...ElementArray.from(node.children).selectNode(name, attrs, deep));
            }
        }
        return nodes;
    }

    selectSubNode(name: string, attrs?: Record<string, RegExp | undefined>, deep = false) {
        return this.children.selectNode(name, attrs, deep);
    }

    get textContent(): string {
        return this.map(ElementArray.getText).join('');
    }
}

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
    const container = ElementArray.fromXML(new TextDecoder().decode(keyfile["META-INF/container.xml"]));
    const rootfileEl = container.selectNode('container').selectSubNode('rootfiles').selectSubNode('rootfile', { 'full-path': undefined })[0];
    if (!rootfileEl)
        throw new Error("Invalid EPUB file: rootfile not found or not valid");

    const rootfile_path = rootfileEl.attributes?.["full-path"]!;
    const rootfile = files.find(file => file.name === rootfile_path);
    if (!rootfile)
        throw new Error("Invalid EPUB file: rootfile not found");

    function getF(path: string) {
        const f = dirname(rootfile_path) + '/' + path;
        return files.find(file => file.name === f);
    }

    // 解析OPF文件
    const opf = ElementArray.fromXML(new TextDecoder().decode(rootfile.data));
    const dcMeta = opf.selectNode('metadata', undefined, true)!;
    const meta = {
        version: parseFloat(opf.selectNode('package', { version: undefined })?.[0]?.attributes?.version || '0'),
        title: dcMeta.selectSubNode('dc:title')?.textContent,
        author: (dcMeta.selectSubNode('dc:creator')?.textContent),
        publisher: dcMeta.selectSubNode('dc:publisher')?.textContent,
        date: dcMeta.selectSubNode('dc:date')?.textContent,
        cover: opf.selectSubNode('meta[name="cover"]')[0]?.attributes?.content,
        description: opf.selectSubNode('dc:description').textContent,
    };
    console.log(meta);

    if (isNaN(meta.version) || meta.version < 2) {
        throw new Error("Unsupported EPUB version: " + meta.version);
    }

    // 生成ID目录
    const idMap: Record<string, string> = {};
    // for (const el of opf.querySelectorAll('package > manifest > item[id][href]')) {
    for (const el of opf.selectNode('package').selectSubNode('manifest').selectSubNode('item')) {
        const id = el.attributes?.id!, href = el.attributes?.href!;
        if (id in idMap) throw new Error(`Duplicate ID in manifest: ${id}`);
        idMap[id] = href;
    }

    // 提取章节内容
    const chapters: string[] = [];
    // for (const el of opf.querySelectorAll('package > spine itemref[idref]')) {
    for (const el of opf.selectNode('package').selectSubNode('spine').selectSubNode('itemref', { idref: undefined })) {
        const idref = el.attributes?.idref!;
        const filePath = idMap[idref];
        if (!filePath) {
            console.log(`Warning: 未找到ID为${idref}的章节文件`);
            continue;
        }
        const chapter = getF(filePath);
        if (!chapter) throw new Error(`Chapter file not found: ${filePath}`);
        const content = new TextDecoder().decode(chapter.data);
        chapters.push(content);
    }

    // 生成TXT
    let txt = '';
    for (let i = 0; i < chapters.length; i++) try {
        const chapter = chapters[i];
        const document = new DOMParser().parseFromString(chapter, 'text/html');

        // 提取图片
        const imgs = Array.from(document.querySelectorAll('img[src]'));
        for (const img of imgs) try {
            const src = img.getAttribute('src')!;
            const imgData = getF(src);
            if (!imgData) throw new Error(`Image file not found: ${src}`);

            // write to file
            const imgDir = join(outdir, dirname(src));
            await ensureDir(imgDir);
            await Deno.writeFile(join(outdir, src), imgData.data);

            // redirect
            img.setAttribute('src', 'file://' + outdir + '/' + src);
        } catch (e) {
            console.error(`Error parsing image in chapter ${i + 1}: ${(e as Error).message}`);
        }

        // 标题
        const title = document.querySelector('head > title')?.innerText;
        if (title == '目录') continue;

        txt += `第${i}章 ${title}\r\n${processContent(document.body)}\r\n\r\n`;
    } catch (e) {
        console.error(`Error parsing chapter ${i + 1}: ${(e as Error).message}`);
    }

    const outputPath = join(outdir, 'content.txt');
    return Deno.writeTextFile(outputPath, txt);
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

export default async function main() {
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
            c: 'chapter-max'
        },
        default: {
            output: '',
            name: '',
            delete: false,
            force: false,
            "to-epub": false,
            "no-images": false,
            "chapter-max": 0
        }
    });

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
    // 获取输入路径参数
    const inputPath = args._[0] || prompt("请输入输入文件或目录：") || "E:\\docs\\Documents\\6.1\\潘小姐想变回男孩子.txt.epub";
    if (!inputPath) {
        console.error("错误：必须指定输入文件或目录");
        Deno.exit(1);
    }

    // 验证输入路径有效性
    let inputStat: Deno.FileInfo;
    try {
        inputStat = await Deno.stat(inputPath.toString());
    } catch (e) {
        console.error(`路径无效：${inputPath}`);
        Deno.exit(1);
    }

    // 创建文件处理器
    const processor = {
        async handleFile(filePath: string) {
            try {
                console.log(`正在处理：${filePath}`);

                // 读取文件内容
                const fileData = await Deno.readFile(filePath);

                // 生成输出路径
                const outputDir = args.output || dirname(filePath);
                const baseName = args.name || basename(filePath).split('.')[0];
                await ensureDir(join(outputDir, baseName));
                const outputPath = await Deno.realPath(join(outputDir, baseName));

                // 执行转换操作
                console.log(`开始转换：${filePath} -> ${outputPath}`);
                await toTXT(
                    fileData,
                    outputPath
                );
                if (args["to-epub"]) {
                    console.log(dirname(filePath) + '/' + baseName + '.epub');
                    if (!toEpub(
                        tryReadTextFile(outputPath + '/content.txt'),
                        filePath,
                        dirname(filePath) + '/' + baseName + '.epub',
                        {
                            thenCB: () => {
                                console.log(`转换成功：${filePath} -> ${outputPath}.epub`);

                                // 转换成功后处理原文件
                                if (args.delete) {
                                    Deno.removeSync(filePath);
                                    console.log(`已删除原文件：${filePath}`);
                                }
                            },
                            per_page_max: parseInt(args["chapter-max"] as string || "10000")
                        }
                    )) {
                        throw new Error("转换失败");
                    }
                }
            } catch (e) {
                if((e instanceof Error) && e.message.includes("Could not locate directory")){
                    console.error(`不正常的epub文件：压缩包损坏`);
                    await Deno.remove(filePath, { recursive: true });
                }else{
                    console.error(`处理失败：${filePath}`, e);
                }
            }
        }
    };

    // 处理单个文件
    if (inputStat.isFile) {
        await processor.handleFile(inputPath.toString());
    }
    // 处理目录（批量转换）
    else if (inputStat.isDirectory) {
        for await (const dirEntry of Deno.readDir(inputPath.toString())) try {
            if (dirEntry.isFile && dirEntry.name.endsWith('.epub'))
                await processor.handleFile(join(inputPath.toString(), dirEntry.name));
            else if (dirEntry.isDirectory && await exists(join(inputPath.toString(), dirEntry.name, 'content.txt')) && args["to-epub"]) {
                const filePath = join(inputPath.toString(), dirEntry.name, 'content.txt'),
                    outputDir = args.output || dirname(filePath),
                    baseName = args.name || basename(filePath).split('.')[0];
                await ensureDir(join(outputDir, baseName));
                const outputPath = await Deno.realPath(join(outputDir, baseName));
                console.log(`开始转换：${filePath} -> ${outputPath}.epub`);
                if (!toEpub(
                    tryReadTextFile(outputPath + '/content.txt'),
                    filePath,
                    dirname(filePath) + '/' + baseName + '.epub',
                    {
                        thenCB: () => {
                            console.log(`转换成功：${filePath} -> ${outputPath}.epub`);

                            // 转换成功后处理原文件
                            if (args.delete) {
                                Deno.removeSync(filePath);
                                console.log(`已删除原文件：${filePath}`);
                            }
                        },
                        per_page_max: parseInt(args["chapter-max"] as string || "10000")
                    }
                )) {
                    throw new Error("转换失败");
                }
            }
        } catch (e) {
            console.error(`处理失败：${dirEntry.name}`, e);
        }
        console.log(`处理完成：${inputPath}`);
    }

    console.log("处理完成");
}

// 执行主函数
if (import.meta.main) {
    await main()
    globalThis.addEventListener("unhandledrejection", (e) => e.preventDefault())
}
