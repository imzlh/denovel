#!/usr/bin/env -S deno run --allow-read --allow-write

import { decodeHTML5 } from "npm:entities";
import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";

function countHtmlEntities(content: string): number {
    const entityPattern = /&#?[a-zA-Z0-9]+;/g;
    const matches = content.match(entityPattern);
    return matches ? matches.length : 0;
}

async function unescapeHtmlInFile(filePath: string, noBackup: boolean = false): Promise<void> {
    console.log(`\n处理文件: ${filePath}`);
    
    try {
        const content = await Deno.readTextFile(filePath);
        const fileSize = (content.length / 1024).toFixed(2);
        console.log(`文件大小: ${fileSize} KB`);
        
        const entityCount = countHtmlEntities(content);
        if (entityCount === 0) {
            console.log("✓ 文件中没有需要解码的HTML实体");
            return;
        }
        console.log(`发现 ${entityCount} 个HTML实体需要解码`);
        
        const decodedContent = decodeHTML5(content);
        
        if (!noBackup) {
            const backupPath = `${filePath}.bak`;
            await Deno.writeTextFile(backupPath, content);
            console.log(`备份文件: ${backupPath}`);
        }
        
        await Deno.writeTextFile(filePath, decodedContent);
        const newSize = (decodedContent.length / 1024).toFixed(2);
        console.log(`✓ 解码完成，新文件大小: ${newSize} KB`);
        
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            console.error(`✗ 错误: 文件不存在`);
        } else if (error instanceof Deno.errors.PermissionDenied) {
            console.error(`✗ 错误: 没有权限访问文件`);
        } else {
            console.error(`✗ 处理文件时出错: ${error}`);
        }
    }
}

async function findTxtFiles(path: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
        const stat = await Deno.stat(path);
        if (stat.isFile) {
            if (path.toLowerCase().endsWith(".txt")) {
                files.push(path);
            }
            return files;
        }
        
        if (stat.isDirectory) {
            for await (const entry of walk(path, { exts: ["txt"], includeDirs: false })) {
                files.push(entry.path);
            }
        }
    } catch (error) {
        console.error(`✗ 遍历路径出错 ${path}: ${error}`);
    }
    
    return files;
}

if (import.meta.main) {
    const args = Deno.args;
    
    const noBackup = args.includes("--no-backup") || args.includes("-n");
    const recursive = args.includes("--recursive") || args.includes("-r");
    const paths = args.filter(arg => !arg.startsWith("-"));
    
    if (paths.length === 0) {
        console.log("HTML实体解码工具");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("\n用法:");
        console.log("  deno run --allow-read --allow-write unescape_html.ts [选项] <路径> [路径2...]");
        console.log("\n选项:");
        console.log("  -n, --no-backup    不创建备份文件（直接覆盖）");
        console.log("  -r, --recursive    递归遍历目录下所有 .txt 文件");
        console.log("\n功能:");
        console.log("  将文件中的HTML实体（如 &amp; &lt; &gt; &#x4F60;&#x597D; 等）解码为原始字符");
        console.log("  默认会自动备份原文件为 .bak 文件");
        console.log("  使用 -r 选项可遍历目录下所有 txt 文件");
        console.log("");
        Deno.exit(0);
    }
    
    console.log("HTML实体解码工具");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    let allFiles: string[] = [];
    
    if (recursive) {
        console.log("递归模式: 将遍历所有子目录中的 .txt 文件");
        for (const path of paths) {
            const files = await findTxtFiles(path);
            allFiles = allFiles.concat(files);
        }
    } else {
        allFiles = paths;
    }
    
    if (allFiles.length === 0) {
        console.log("\n✗ 未找到任何文件");
        Deno.exit(1);
    }
    
    console.log(`\n找到 ${allFiles.length} 个文件待处理`);
    
    for (const filePath of allFiles) {
        await unescapeHtmlInFile(filePath, noBackup);
    }
    
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("处理完成!");
}


