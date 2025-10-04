// file: filterFilesWeighted.ts
import { basename, join } from "node:path";

// 计算Levenshtein距离（编辑距离）函数
function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // 替换
                    matrix[i][j - 1] + 1,     // 插入
                    matrix[i - 1][j] + 1      // 删除
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// 计算相似度（0-1之间，1表示完全相同）
function similarity(a: string, b: string): number {
    const distance = levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    return 1 - distance / maxLength;
}

// 将文件大小字符串转换为字节数（如 "2.7 M" -> 2831155）
function parseFileSize(sizeStr: string): number {
    const units: Record<string, number> = {
        'B': 1,
        'K': 1024,
        'M': 1024 * 1024,
        'G': 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^([\d.]+)\s*([BKMGT])?/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2]?.toUpperCase() || 'B';
    return value * (units[unit] || 1);
}

// 计算综合评分（文件大小权重60%，相似度权重40%）
function calculateScore(similarity: number, sizeStr: string): number {
    const sizeScore = parseFileSize(sizeStr) / (1024 * 1024); // 转换为MB为单位
    const normalizedSize = Math.min(sizeScore / 10, 1); // 假设最大10MB为满分
    return (normalizedSize * 0.3) + (similarity * 0.7);
}

// 读取现有的files.json
const filesJsonPath = join(import.meta.dirname!, "files.json");
const filesData = JSON.parse(await Deno.readTextFile(filesJsonPath));

// 获取当前目录下的所有文件
const foundFiles: Array<{
    file: any,
    similarity: number,
    fileName: string,
    sizeScore: number,
    combinedScore: number
}> = [];

for await (const entry of Deno.readDir('.')) {
    if (entry.isFile) {
        const fileName = entry.name;

        // 为当前文件找到最佳匹配记录
        let bestMatch = {
            similarity: 0,
            index: -1,
            sizeScore: 0,
            combinedScore: 0
        };

        filesData.forEach((file: any, index: number) => {
            const targetName = file.name_all || basename(file._path);
            const sim = similarity(fileName, targetName);
            const sizeScore = parseFileSize(file.size || "0");
            const combined = calculateScore(sim, file.size || "0");

            if (combined > bestMatch.combinedScore) {
                bestMatch = {
                    similarity: sim,
                    index,
                    sizeScore,
                    combinedScore: combined
                };
            }
        });

        if (bestMatch.index !== -1 && bestMatch.similarity > 0.3) {
            foundFiles.push({
                file: filesData[bestMatch.index],
                similarity: bestMatch.similarity,
                fileName,
                sizeScore: bestMatch.sizeScore,
                combinedScore: bestMatch.combinedScore
            });
            console.log(`找到匹配: ${fileName} <-> ${filesData[bestMatch.index].name_all} (${bestMatch.similarity.toFixed(2)}, ${filesData[bestMatch.index].size}`);
        }
    }
}

// 按综合评分降序排序
foundFiles.sort((a, b) => b.combinedScore - a.combinedScore);

// 提取排序后的文件数据
const sortedFiles = foundFiles.map(item => ({
    ...item.file,
    match_similarity: item.similarity,
    matched_file: item.fileName,
    file_size_bytes: item.sizeScore,
    combined_score: item.combinedScore
}));

// 将找到的文件保存到files_weighted.json
const outputPath = join(import.meta.dirname!, "files_weighted.json");
await Deno.writeTextFile(outputPath, JSON.stringify(sortedFiles, null, 2));

console.log(`筛选完成，共找到${sortedFiles.length}个文件`);
console.log(`最佳匹配文件: ${sortedFiles[0]?.name_all} 
    (相似度: ${sortedFiles[0]?.match_similarity.toFixed(2)}, 
     大小: ${sortedFiles[0]?.size}, 
     综合评分: ${sortedFiles[0]?.combined_score.toFixed(2)})`);
console.log(`结果已保存到 ${outputPath}`);
