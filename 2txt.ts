import { parseArgs } from "jsr:@std/cli/parse-args";
import { basename, dirname, extname, join } from "jsr:@std/path";
import * as zip from 'jsr:@quentinadam/zip';
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { parse as parseXML, XmlNode, RegularTagNode, OrphanTagNode } from 'jsr:@melvdouc/xml-parser';
import { toEpub } from "./2epub.ts";
import { exists, processContent, tryReadTextFile } from "./main.ts";
import { ensure } from "./_dep.ts";
import { readline } from "./exe.ts";
import { extractDOCXContent, extractPDFContent, extractEPUBContent, extractPagesFromDOCX, extractPagesFromPDF } from "jsr:@baiq/document-parser";


class ElementArray<T extends XmlNode> extends Array<T> {
    static fromXML(xml: string){
        return new ElementArray(...parseXML(xml));
    }

    static getText(node: XmlNode): string{
        switch(node.kind){
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

    static override from(element: XmlNode[]){
        return new ElementArray(...element.filter(node => node.kind == 'REGULAR_TAG_NODE' || node.kind == 'ORPHAN_TAG_NODE'));
    }

    get children(): ElementArray<XmlNode>{
        return new ElementArray(...this.flatMap(node => node.kind == 'REGULAR_TAG_NODE'? node.children : []));
    }

    selectNode(name: string, attrs?: Record<string, RegExp | string | undefined>, deep = false) {
        const nodes = new ElementArray<RegularTagNode | OrphanTagNode>();
        name = name.toLowerCase();
        for (const _node of this) {
            const node = _node as XmlNode;
            if(node.kind != 'REGULAR_TAG_NODE' && node.kind != 'ORPHAN_TAG_NODE') continue;
            if (node.tagName.toLowerCase() == name) {
                if (attrs) {
                    for (const [key, value] of Object.entries(attrs)) {
                        if(!node.attributes || !(key in node.attributes)) continue; // 属性不存在
                        if(value && (typeof value == 'string' ? node.attributes[key] !== value : !value.test(node.attributes[key]))) 
                            continue; // 属性值不匹配
                    }
                }
                nodes.push(node);
            }else if(deep){
                // 递归查找子节点
                if(node.kind == 'REGULAR_TAG_NODE')
                    nodes.push(...ElementArray.from(node.children).selectNode(name, attrs, deep));
            }
        }
        return nodes;
    }

    selectSubNode(name: string, attrs?: Record<string, RegExp | undefined>, deep = false) {
        return this.children.selectNode(name, attrs, deep);
    }

    get textContent(): string{
        return this.map(ElementArray.getText).join('');
    }
}

/**
 * EPUB转TXT
 * @param data 输入的文件内容
 * @param input 输入的文件名
 * @param output 输出位置
 */
export async function toTXT2(source: Uint8Array, outdir: string, options = {
    addTitle: true,
    removeHTMLTitle: true
}) {
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

    function getF(path: string){
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

    if (isNaN(meta.version) || meta.version < 2) {
        throw new Error("Unsupported EPUB version: " + meta.version);
    }

    // 生成ID目录
    const idMap: Record<string, string> = {};
    // for (const el of opf.querySelectorAll('package > manifest > item[id][href]')) {
    for(const el of opf.selectNode('package').selectSubNode('manifest').selectSubNode('item')) {
        const id = el.attributes?.id!, href = el.attributes?.href!;
        if (id in idMap) throw new Error(`Duplicate ID in manifest: ${id}`);
        idMap[id] = href;
    }

    // 提取章节内容
    const chapters: string[] = [];
    // for (const el of opf.querySelectorAll('package > spine itemref[idref]')) {
    for(const el of opf.selectNode('package').selectSubNode('spine').selectSubNode('itemref', { idref: undefined })) {
        const idref = el.attributes?.idref!;
        const filePath = idMap[idref];
        if (!filePath){
            console.log(`Warning: 未找到ID为${idref}的章节文件`);
            continue;
        }
        // Table Of Contents
        if(filePath.includes('toc')){
            // console.debug(`跳过目录文件: ${filePath}`);
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

        // 删除标题
        if(options.removeHTMLTitle){
            document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => h.remove());
        }

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
        const title = document.querySelector('head > title')?.innerText.trim();
        if(undefined === title || title == '目录') continue;
        const contentTxt = processContent(document.body).trim();
        if(contentTxt.split(/\r\n/).slice(0, 2).some(l => l.includes(title)) || !options.addTitle)
            // FIXME: 也许无法处理原生标题，使用下一种？
            txt += '\r\n' + contentTxt + '\r\n\r\n';
        else
            txt += `第${i}章 ${title}\r\n${contentTxt}\r\n\r\n`;
    } catch (e) {
        console.error(`Error parsing chapter ${i + 1}: ${(e as Error).message}`);
    }

    const outputPath = join(outdir, 'content.txt');
    Deno.writeTextFile(outputPath, txt);
    return txt;
}

/**
 * 任何格式(epub/pdf/docx)转TXT
 * @param data 输入的文件内容
 * @param input 输入的文件名
 * @param output 输出位置
 */
export async function toTXT(source: string, outdir: string, options = {
    addTitle: true,
    removeHTMLTitle: true
}): Promise<string> {
    let doc;
    switch(basename(source).split('.').pop()){
        case "epub":
            return toTXT2(await Deno.readFile(source), outdir, options);
        // break;
        case "pdf":
            doc = await extractPDFContent(source, outdir);
        break;
        case "docx":
            doc = await extractDOCXContent(source, outdir);
        break;
        default:
            throw new Error("不支持的文件格式");
    }

    let txt = '';
    if(!doc.pages.length) throw new Error("文档为空");
    for(const page of doc.pages){
        txt += page.paragraphs.join('\r\n') + '\r\n\r\n';
    }
    await Deno.writeTextFile(join(outdir, 'content.txt'), txt);
    return txt;
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

interface ConvertOptions {
    output: string;
    name: string;
    delete: boolean;
    force: boolean;
    'to-epub': boolean;
    'no-images': boolean;
    'keep-txt': boolean;
    'add-title': boolean;
    'remove-html-title': boolean;
    'chapter-max': string;
    help: boolean;
    _: string[];
}

interface ConvertConfig {
    inputPath: string;
    outputDir: string;
    baseName: string;
    options: ConvertOptions;
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
    console.log(`
docx/pdf/epub -> TXT 转换工具 v2.0

用法:
  deno run -A 2txt.ts [选项] <输入文件或目录>

选项:
  -o, --output <路径>       设置输出路径 (默认: 输入文件同目录)
  -n, --name <名称>         设置输出文件名 (不含扩展名)
  -e, --to-epub             转换完毕后重新生成epub(可以实现pdf/docx转epub)
  -i, --no-images           忽略图片 (仅生成文本)
  -d, --delete              转换后删除原文件
  -k, --keep-txt            (仅epub转epub时)保留原txt文件(夹)
  -f, --force               忽略错误继续处理
  -c, --chapter-max <N>     设置最大章节数 (0=无限制)
  -h, --help                显示帮助信息
  -t, --add-title           保留原标题
  -r, --remove-html-title   移除html标题

示例:
  1. EPUB转TXT: 
     deno run -A 2txt.ts input.epub -o output.txt
  2. 批量转换目录: 
     deno run -A 2txt.ts ./epubs -o ./txts -i
  3. TXT转EPUB: 
     deno run -A 2txt.ts input.txt -e -n "书名"
  4. 干净的epub(正文内没有标题)，请务必指定"-t"参数：
     deno run -A 2txt.ts input.epub -o output.txt -t
`);
}

/**
 * 解析命令行参数
 */
function parseCommandLineArgs(): ConvertOptions {
    return parseArgs(Deno.args, {
        string: ['output', 'name', 'chapter-max'],
        boolean: ['to-epub', 'no-images', 'help', 'delete', 'force', 'keep-txt', 'add-title', 'remove-html-title'],
        alias: {
            o: 'output',
            e: 'to-epub',
            i: 'no-images',
            h: 'help',
            d: 'delete',
            f: 'force',
            n: 'name',
            c: 'chapter-max',
            t: 'add-title',
            r: 'remove-html-title',
            k: 'keep-txt'
        },
        default: {
            output: '',
            name: '',
            delete: false,
            force: false,
            "to-epub": false,
            "no-images": false,
            "chapter-max": "10000",
            "add-title": false,
            "remove-html-title": true,
            "keep-txt": false
        }
    }) as ConvertOptions;
}

/**
 * 验证参数有效性
 */
function validateArgs(args: ConvertOptions): void {
    if (args["to-epub"] && args['delete']) {
        console.error("错误：不能同时指定-e和-d选项");
        console.error("-e: 产生epub, -d: 删除原文件, 这样程序的行为是浪费CPU + 删除文件");
        console.info("或许, 你只是希望删除生成的文件夹?默认转epub后会自动删除!");
        Deno.exit(1);
    }
}

/**
 * 获取输入路径
 */
async function getInputPath(args: ConvertOptions): Promise<string> {
    const inputPath = args._?.[0] || 
        await readline("请输入输入文件或目录：");
    
    if (!inputPath) {
        console.error("错误：必须指定输入文件或目录");
        Deno.exit(1);
    }
    
    return inputPath.toString();
}

/**
 * 验证输入路径是否存在
 */
async function validateInputPath(inputPath: string): Promise<Deno.FileInfo> {
    try {
        return await Deno.stat(inputPath);
    } catch (e) {
        console.error(`路径无效：${inputPath}`);
        Deno.exit(1);
    }
}

/**
 * 创建转换配置
 */
async function createConvertConfig(filePath: string, options: ConvertOptions): Promise<ConvertConfig> {
    const outputDir = options.output || dirname(filePath);
    const baseName = options.name || basename(filePath).split('.')[0];
    
    await ensureDir(join(outputDir, baseName));
    const resolvedOutputDir = await Deno.realPath(join(outputDir, baseName));
    
    return {
        inputPath: filePath,
        outputDir: resolvedOutputDir,
        baseName,
        options
    };
}

/**
 * 执行文档转换为TXT
 */
async function convertToTxt(config: ConvertConfig): Promise<string> {
    console.log(`开始转换：${config.inputPath} -> ${config.outputDir}`);
    
    const txt = await toTXT(config.inputPath, config.outputDir, {
        addTitle: config.options["add-title"],
        removeHTMLTitle: config.options["remove-html-title"]
    });
    
    console.log(`转换成功：${config.inputPath} -> ${config.outputDir}/content.txt`);
    return txt;
}

/**
 * 转换TXT为EPUB
 */
function convertToEpub(txt: string, config: ConvertConfig): Promise<boolean> {
    return new Promise((resolve) => {
        const epubPath = dirname(config.inputPath) + '/' + config.baseName + '.epub';
        console.log(`开始生成EPUB：${epubPath}`);
        
        const success = toEpub(txt, config.inputPath, epubPath, {
            thenCB: () => {
                console.log(`EPUB生成成功：${epubPath}`);
                handlePostConversion(config);
                resolve(true);
            },
            per_page_max: parseInt(config.options["chapter-max"] || "10000")
        });
        
        if (!success) {
            resolve(false);
        }
    });
}

/**
 * 处理转换后的清理工作
 */
function handlePostConversion(config: ConvertConfig): void {
    // 删除原文件
    if (config.options.delete) {
        try {
            Deno.removeSync(config.inputPath);
            console.log(`已删除原文件：${config.inputPath}`);
        } catch (e) {
            console.error(`删除原文件失败：${config.inputPath}`, e);
        }
    }
    
    // 删除生成的TXT文件夹
    if (!config.options["keep-txt"]) {
        try {
            Deno.removeSync(config.outputDir, { recursive: true });
            console.log(`已删除TXT文件夹：${config.outputDir}`);
        } catch (e) {
            console.error(`删除TXT文件夹失败：${config.outputDir}`, e);
        }
    }
}

/**
 * 处理单个文件
 */
async function processSingleFile(filePath: string, options: ConvertOptions): Promise<void> {
    try {
        console.log(`正在处理：${filePath}`);
        
        const config = await createConvertConfig(filePath, options);
        const txt = await convertToTxt(config);
        
        if (options["to-epub"]) {
            const success = await convertToEpub(txt, config);
            if (!success) {
                throw new Error("EPUB转换失败");
            }
        }
        
    } catch (e) {
        if ((e instanceof Error) && e.message.includes("format")) {
            console.error(`不正常的epub文件：压缩包损坏`);
            await Deno.remove(filePath, { recursive: true });
        } else {
            console.error(`处理失败：${filePath}`, e);
            if (!options.force) {
                console.log('Hint: 尝试使用"-f"参数忽略错误继续处理')
                throw e;
            }
        }
    }
}

/**
 * 处理TXT转EPUB（从已有的content.txt文件）
 */
async function processTxtToEpub(dirPath: string, options: ConvertOptions): Promise<void> {
    const contentPath = join(dirPath, 'content.txt');
    
    if (!await exists(contentPath)) {
        return;
    }
    
    try {
        console.log(`发现TXT文件，开始转换：${contentPath}`);
        
        const outputDir = options.output || dirname(contentPath);
        const baseName = options.name || basename(dirname(contentPath));
        const epubPath = dirname(contentPath) + '/' + baseName + '.epub';
        
        const txt = tryReadTextFile(contentPath);
        
        const success = await new Promise<boolean>((resolve) => {
            const result = toEpub(txt, contentPath, epubPath, {
                thenCB: () => {
                    console.log(`TXT转EPUB成功：${epubPath}`);
                    
                    if (options.delete) {
                        try {
                            Deno.removeSync(contentPath);
                            console.log(`已删除原文件：${contentPath}`);
                        } catch (e) {
                            console.error(`删除原文件失败：${contentPath}`, e);
                        }
                    }
                    
                    if (!options["keep-txt"]) {
                        try {
                            Deno.removeSync(dirname(contentPath), { recursive: true });
                            console.log(`已删除TXT文件夹：${dirname(contentPath)}`);
                        } catch (e) {
                            console.error(`删除TXT文件夹失败：${dirname(contentPath)}`, e);
                        }
                    }
                    
                    resolve(true);
                },
                per_page_max: parseInt(options["chapter-max"] || "10000")
            });
            
            if (!result) {
                resolve(false);
            }
        });
        
        if (!success) {
            throw new Error("TXT转EPUB失败");
        }
        
    } catch (e) {
        console.error(`TXT转EPUB处理失败：${dirPath}`, e);
        if (!options.force) {
            throw e;
        }
    }
}

/**
 * 处理目录（批量转换）
 */
async function processDirectory(dirPath: string, options: ConvertOptions): Promise<void> {
    console.log(`开始处理目录：${dirPath}`);
    
    for await (const dirEntry of Deno.readDir(dirPath)) {
        const fullPath = join(dirPath, dirEntry.name);
        
        try {
            if (dirEntry.isFile) {
                // 处理支持的文件格式
                const supportedExtensions = ['.epub', '.pdf', '.docx'];
                if (supportedExtensions.some(ext => dirEntry.name.endsWith(ext))) {
                    await processSingleFile(fullPath, options);
                }
            } else if (dirEntry.isDirectory && options["to-epub"]) {
                // 处理包含content.txt的目录（TXT转EPUB）
                await processTxtToEpub(fullPath, options);
            }
        } catch (e) {
            console.error(`处理失败：${dirEntry.name}`, e);
            if (!options.force) {
                throw e;
            }
        }
    }
    
    console.log(`目录处理完成：${dirPath}`);
}

/**
 * 主函数
 */
export default async function main(): Promise<void> {
    try {
        // 解析命令行参数
        const args = parseCommandLineArgs();
        
        // 显示帮助信息
        if (args.help) {
            showHelp();
            Deno.exit(0);
        }
        
        // 验证参数
        validateArgs(args);
        
        // 获取并验证输入路径
        const inputPath = await getInputPath(args);
        const inputStat = await validateInputPath(inputPath);
        
        // 根据输入类型进行处理
        if (inputStat.isFile) {
            await processSingleFile(inputPath, args);
        } else if (inputStat.isDirectory) {
            await processDirectory(inputPath, args);
        } else {
            console.error(`不支持的路径类型：${inputPath}`);
            Deno.exit(1);
        }
        
        console.log("所有处理完成");
        
    } catch (e) {
        console.error("程序执行出错：", e);
        Deno.exit(1);
    }
}

// 执行主函数
if (import.meta.main) {
    await main()
    globalThis.addEventListener("unhandledrejection", (e) => e.preventDefault())
}
