// txt_mover.ts
import { copy, move, ensureDir, walk } from "https://deno.land/std/fs/mod.ts";
import { join, basename } from "https://deno.land/std/path/mod.ts";

class TxtFileMover {
    private sizeThreshold: number;

    constructor(sizeThreshold: number = 100 * 1024) { // 默认100KB
        this.sizeThreshold = sizeThreshold;
    }

    /**
     * 检查文件是否存在
     */
    private async fileExists(path: string): Promise<boolean> {
        try {
            await Deno.stat(path);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取文件大小
     */
    private async getFileSize(path: string): Promise<number> {
        try {
            const stat = await Deno.stat(path);
            return stat.size;
        } catch (error) {
            throw new Error(`无法获取文件大小: ${error}`);
        }
    }

    /**
     * 计算文件大小差异
     */
    private getSizeDifference(size1: number, size2: number): number {
        return Math.abs(size1 - size2);
    }

    /**
     * 处理单个txt文件
     */
    private async processTxtFile(sourcePath: string, targetDir: string): Promise<boolean> {
        const fileName = basename(sourcePath);
        const targetPath = join(targetDir, fileName);

        // 获取源文件大小
        let sourceSize: number;
        try {
            sourceSize = await this.getFileSize(sourcePath);
        } catch (error) {
            console.error(`获取源文件大小失败: ${error}`);
            return false;
        }

        // 检查目标文件是否存在
        const targetExists = await this.fileExists(targetPath);

        if (targetExists) {
            // 获取目标文件大小
            let targetSize: number;
            try {
                targetSize = await this.getFileSize(targetPath);
            } catch (error) {
                console.error(`获取目标文件大小失败: ${error}`);
                return false;
            }

            // 计算大小差异
            const sizeDiff = this.getSizeDifference(sourceSize, targetSize);

            // 如果大小差异在阈值范围内
            if (sizeDiff <= this.sizeThreshold) {
                console.log(`跳过: ${fileName} (大小差异 ${this.formatSize(sizeDiff)} 在阈值 ${this.formatSize(this.sizeThreshold)} 内)`);

                // 如果目标文件比源文件大，且差异在阈值内，执行拷贝
                if (targetSize > sourceSize && sizeDiff <= this.sizeThreshold) {
                    console.log(`拷贝: ${fileName} (目标文件比源文件大 ${this.formatSize(sizeDiff)})`);
                    return await this.copyFile(sourcePath, targetPath);
                }

                return false;
            }
        }

        // 执行移动操作
        try {
            // 确保目标目录存在
            await ensureDir(targetDir);

            await move(sourcePath, targetPath, { overwrite: true });
            console.log(`移动: ${fileName} -> ${targetDir}`);
            return true;
        } catch (error) {
            console.error(`移动失败: ${fileName} - ${error}`);
            return false;
        }
    }

    /**
     * 拷贝文件
     */
    private async copyFile(sourcePath: string, targetPath: string): Promise<boolean> {
        try {
            await copy(sourcePath, targetPath, { overwrite: true });
            return true;
        } catch (error) {
            console.error(`拷贝失败: ${error}`);
            return false;
        }
    }

    /**
     * 格式化文件大小显示
     */
    private formatSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)}${units[unitIndex]}`;
    }

    /**
     * 移动源目录中的所有txt文件到目标目录
     */
    async moveTxtFiles(sourceDir: string, targetDir: string): Promise<void> {
        // 检查源目录是否存在
        if (!await this.fileExists(sourceDir)) {
            console.error(`源目录不存在: ${sourceDir}`);
            return;
        }

        // 确保目标目录存在
        await ensureDir(targetDir);

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        console.log(`开始处理: ${sourceDir} -> ${targetDir}`);
        console.log(`大小阈值: ${this.formatSize(this.sizeThreshold)}\n`);

        // 遍历源目录中的所有txt文件
        for await (const entry of walk(sourceDir, {
            exts: ['.txt'],
            includeDirs: false,
            includeFiles: true
        })) {
            const result = await this.processTxtFile(entry.path, targetDir);

            if (result === true) {
                successCount++;
            } else if (result === false) {
                skipCount++;
            } else {
                errorCount++;
            }
        }

        console.log(`\n处理完成:`);
        console.log(`  ✓ 成功移动: ${successCount} 个文件`);
        console.log(`  ○ 跳过: ${skipCount} 个文件`);
        console.log(`  ✗ 失败: ${errorCount} 个文件`);
    }
}

// 显示使用帮助
function showHelp() {
    console.log(`
TXT文件移动工具

用法:
  deno run --allow-read --allow-write txt_mover.ts <源目录> <目标目录> [阈值KB]

参数:
  源目录    - 包含txt文件的源目录
  目标目录  - 移动文件的目标目录
  阈值KB   - 可选，大小阈值，单位KB (默认: 100)

示例:
  deno run --allow-read --allow-write txt_mover.ts ./source ./target
  deno run --allow-read --allow-write txt_mover.ts ./source ./target 50
  `);
}

// 主函数
async function main() {
    // 检查参数
    if (Deno.args.length < 2 || Deno.args.includes('--help') || Deno.args.includes('-h')) {
        showHelp();
        return;
    }

    const sourceDir = Deno.args[0];
    const targetDir = Deno.args[1];

    // 解析可选的大小阈值参数
    let sizeThreshold = 100 * 1024; // 默认100KB
    if (Deno.args.length >= 3) {
        const thresholdKB = parseInt(Deno.args[2]);
        if (!isNaN(thresholdKB) && thresholdKB > 0) {
            sizeThreshold = thresholdKB * 1024;
        } else {
            console.error('错误: 大小阈值必须是正整数');
            showHelp();
            return;
        }
    }

    // 创建移动器并执行
    const mover = new TxtFileMover(sizeThreshold);
    await mover.moveTxtFiles(sourceDir, targetDir);
}

// 如果直接运行此文件，执行主函数
if (import.meta.main) {
    main().catch(console.error);
}

export { TxtFileMover };