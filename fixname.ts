// 修复蓝奏关键词屏蔽导致的文件名残缺问题
// 使用示例: deno run --allow-read --allow-write rename-files.ts

import { basename } from "https://deno.land/std@0.224.0/path/basename.ts";

// 相似度计算函数 (Levenshtein距离算法)
function similarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const distance = levenshteinDistance(s1, s2);
    return (longer.length - distance) / parseFloat(longer.length.toString());
}

// 计算Levenshtein距离
function levenshteinDistance(s1: string, s2: string): number {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

// 从文件内容中提取标题
function extractTitle(content: string, fname: string): string | null {
    const lines = content.split(/[\r\n]+/);
    let authorIndex = -1;

    // 查找作者行
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('作者')) {
            authorIndex = i;
            break;
        }
    }

    // 如果找到作者行，且前面有内容行，则认为作者行前一行是标题
    if (authorIndex > 0) {
        const titleCandidate = lines[authorIndex - 1].trim();

        // 验证标题候选：长度合理
        if (titleCandidate &&
            titleCandidate.length >= 2 &&
            titleCandidate.length <= 50) {
            return titleCandidate.replace(/^\=+/g, '');
        }
    }

    // 备用方案：查找可能包含完整书名的行
    let i = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if(i ++ >= 20) return null;
        if(similarity(trimmed, fname) > 0.8)
            return trimmed;
    }

    return null;
}

// 主函数
async function main() {
    console.log('开始扫描并修复TXT文件名...\n');

    try {
        // 获取当前目录下所有TXT文件
        const files: string[] = [];
        for await (const dirEntry of Deno.readDir(".")) {
            if (dirEntry.isFile && dirEntry.name.endsWith('.txt')) {
                files.push(dirEntry.name);
            }
        }

        if (files.length === 0) {
            console.log('未找到任何TXT文件');
            return;
        }

        console.log(`找到 ${files.length} 个TXT文件\n`);

        let renamedCount = 0;

        // 处理每个文件
        for (const file of files) {
            try {
                console.log(`处理文件: ${file}`);

                // 读取文件内容
                // const contentHex = Deno.readFileSync(file).slice(0, 8192);
                // let content;
                // for (const codec of ['utf-8', 'gbk', 'utf-16']) try{
                //     content = new TextDecoder(codec, {
                //         fatal: true,
                //         ignoreBOM: false
                //     }).decode(contentHex);
                // }catch{}
                // if(!content) {
                //     console.log(`  无法识别文件编码，跳过: ${file}\n`);
                //     continue;
                // }
                // console.log(content);
                const content = Deno.readTextFileSync(file);

                // 提取标题
                const extractedTitle = extractTitle(content, basename(file, '.txt'));

                if (!extractedTitle) {
                    console.log(`  无法从文件内容中提取标题，跳过: ${file}\n`);
                    continue;
                }

                // 计算相似度
                const currentName = file.replace('.txt', '');
                const sim = similarity(currentName, extractedTitle);

                console.log(`  当前文件名: ${currentName}`);
                console.log(`  提取的标题: ${extractedTitle}`);
                console.log(`  相似度: ${(sim * 100).toFixed(2)}%`);

                if (sim == 1){
                    console.log(`  相似度为100%，跳过: ${file}\n`);
                    continue;
                }

                // 相似度阈值设定为0.3，可根据实际情况调整
                if (sim < 0.6) {
                    console.log(`  相似度过低，可能误识别，跳过: ${file}\n`);
                    continue;
                }

                // 构建新文件名
                const newFilename = `${extractedTitle}.txt`;

                // 避免重名冲突
                let finalNewFilename = newFilename;
                let counter = 1;

                while (await fileExists(finalNewFilename)) {
                    finalNewFilename = `${extractedTitle}⊙${counter}.txt`;
                    counter++;
                }

                // 重命名文件
                if (file !== finalNewFilename) {
                    await Deno.rename(file, finalNewFilename);
                    console.log(`  重命名为: ${finalNewFilename}\n`);
                    renamedCount++;
                } else {
                    console.log(`  文件名已正确，无需修改\n`);
                }

            } catch (error) {
                console.error(`  处理文件时出错 ${file}:`, error);
            }
        }

        console.log(`处理完成! 共重命名了 ${renamedCount} 个文件`);

    } catch (error) {
        console.error('扫描目录时出错:', error);
    }
}

// 检查文件是否存在
async function fileExists(filename: string): Promise<boolean> {
    try {
        await Deno.stat(filename);
        return true;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return false;
        }
        throw error;
    }
}

// 执行主函数
if (import.meta.main) {
    main();
}