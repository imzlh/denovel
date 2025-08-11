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

/**
 * 任何格式(epub/pdf/docx)转TXT
 * @param data 输入的文件内容
 * @param input 输入的文件名
 * @param output 输出位置
 */
export async function toTXT(source: string, outdir: string): Promise<string> {
    let doc;
    switch(basename(source).split('.').pop()){
        case "epub":
            doc = await extractEPUBContent(source, outdir);
        break;
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
docx/pdf/epub  -> TXT 转换工具 v2.0

用法:
  deno run -A 2txt.ts [选项] <输入文件或目录>

选项:
  -o, --output <路径>   设置输出路径 (默认: 输入文件同目录)
  -n, --name <名称>     设置输出文件名 (不含扩展名)
  -e, --to-epub        转换完毕后重新生成epub(可以实现pdf/docx转epub)
  -i, --no-images      忽略图片 (仅生成文本)
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
    const inputPath = args._[0] || await readline("请输入输入文件或目录：") || "E:\\docs\\Documents\\6.1\\潘小姐想变回男孩子.txt.epub";
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

                // 生成输出路径
                const outputDir = args.output || dirname(filePath);
                const baseName = args.name || basename(filePath).split('.')[0];
                await ensureDir(join(outputDir, baseName));
                const outputPath = await Deno.realPath(join(outputDir, baseName));

                // 执行转换操作
                console.log(`开始转换：${filePath} -> ${outputPath}`);
                const txt = await toTXT(
                    filePath,
                    outputPath
                );
                if (args["to-epub"]) {
                    console.log(dirname(filePath) + '/' + baseName + '.epub');
                    if (!toEpub(
                        txt,
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
                if((e instanceof Error) && e.message.includes("format")){
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
            if (dirEntry.isFile && ['.epub', '.pdf', '.docx'].some(ext => dirEntry.name.endsWith(ext)))
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
