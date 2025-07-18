// fileSplitter.ts
import { ensureDir, move } from "https://deno.land/std/fs/mod.ts";
import { join } from "https://deno.land/std/path/mod.ts";

async function splitTxtFilesIntoFolders(
    sourceDir: string,
    filesPerFolder = 60,
) {
    try {
        // 验证目录是否存在
        try {
            await Deno.stat(sourceDir);
        } catch {
            throw new Error(`目录不存在: ${sourceDir}`);
        }

        // 读取目录中的所有txt文件
        const files = [];
        for await (const dirEntry of Deno.readDir(sourceDir)) {
            if (dirEntry.isFile && dirEntry.name.toLowerCase().endsWith(".txt")) {
                files.push(dirEntry.name);
            }
        }

        if (files.length === 0) {
            console.log("没有找到任何txt文件");
            return;
        }

        // 计算需要的文件夹数量
        const folderCount = Math.ceil(files.length / filesPerFolder);
        console.log(`共找到 ${files.length} 个txt文件，将分配到 ${folderCount} 个文件夹中`);

        // 创建文件夹并移动文件
        for (let i = 1; i <= folderCount; i++) {
            const folderName = i.toString();
            const folderPath = join(sourceDir, folderName);

            // 确保文件夹存在
            await ensureDir(folderPath);

            // 计算当前文件夹应该包含的文件范围
            const startIdx = (i - 1) * filesPerFolder;
            const endIdx = Math.min(i * filesPerFolder, files.length);

            // 移动文件
            for (let j = startIdx; j < endIdx; j++) {
                const fileName = files[j];
                const sourcePath = join(sourceDir, fileName);
                const destPath = join(folderPath, fileName);
                try {
                    await move(sourcePath, destPath, { overwrite: false });
                    console.log(`已移动: ${fileName} -> ${folderName}/`);
                } catch (moveError) {
                    console.error(`移动文件失败 ${fileName}:`, moveError);
                }
            }
        }

        console.log(`完成！共创建 ${folderCount} 个文件夹。`);
    } catch (error) {
        console.error("发生错误:", error instanceof Error ? error.message : error);
        Deno.exit(1);
    }
}

export default async function main(){
    // 从命令行参数获取目标文件夹
    const sourceDirectory = Deno.args[0];
    if (!sourceDirectory) {
        console.error("请指定目标文件夹路径");
        console.log("使用方法: deno run --allow-read --allow-write --allow-net fileSplitter.ts <目标文件夹>");
        Deno.exit(1);
    }

    // 执行文件分割
    splitTxtFilesIntoFolders(sourceDirectory);
}
