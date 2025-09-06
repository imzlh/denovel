/**
 * 同步高性能文件复制工具（支持过滤和进度显示）
 * 使用示例：
 *   deno run --allow-read --allow-write copy.ts -s src -d dest -k .txt -z 10m -m 1k -c 5
 */

import { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
import { join } from "https://deno.land/std@0.224.0/path/join.ts";
import { progress } from "jsr:@ryweal/progress";
import constants from "node:constants";
import { accessSync } from "node:fs";

// 解析带单位的大小字符串（如 10m → 10485760）
function parseSize(size: string): number {
    const match = size.match(/^(\d+)([kmg])?$/i);
    if (!match) throw new Error(`无效大小格式: ${size}`);

    const value = parseInt(match[1]);
    const unit = (match[2] || "b").toLowerCase();

    switch (unit) {
        case "k": return value * 1024;
        case "m": return value * 1024 * 1024;
        case "g": return value * 1024 * 1024 * 1024;
        default: return value;
    }
}

// 同步复制文件（带进度条）
function copyFileWithProgressSync(
    srcPath: string,
    destPath: string,
    fileSize: number
): void {
    const srcFile = Deno.openSync(srcPath, { read: true });
    const destFile = Deno.createSync(destPath);

    try {
        const progressBar = progress("COPY [[bar]] [[count]]/[[total]] [[rate]]\n", {
            total: fileSize,
            unit: "MB",
            unitScale: 1024 * 1024,
            shape: {
                bar: { start: "[", end: "]", completed: "█", pending: " " },
                total: { mask: "###.##" },
                count: { mask: "###.##" },
            },
        });

        const buf = new Uint8Array(1024 * 1024 * 4);
        let bytesCopied = 0;

        while (bytesCopied < fileSize) {
            const n = srcFile.readSync(buf);
            if (n === null) break;

            destFile.writeSync(buf.subarray(0, n));
            bytesCopied += n;
            progressBar.next(n);
        }
    } finally {
        const srcStat = srcFile.statSync();
        destFile.syncSync();
        srcFile.close();
        destFile.close();

        try{
            Deno.utimeSync(destPath, Date.now(), srcStat.mtime ?? Date.now());
        }catch(e){
            console.error('无法同步修改时间,这通常不会有什么问题', (e as Error).message);
        }
    }
}

const GENRE_KEYWORDS: Record<string, string[]> = {
    // 动漫相关
    '综漫': ['综漫', '斗罗', '柯南', '战锤', '幻想乡', '星穹铁道', '火影', '海贼', '死神', 'fate', '型月', '从零开始', 'mygo'],
    '轻小说': ['废萌', '弱气', '恶役', '魔王', '龙', '精灵', '幻想', '转生', '异世界', '冒险者', '公会', '魔法学院', '技能', '状态栏'],

    // 奇幻玄幻
    '西方奇幻': ['骑士', '魔法', '巫师', '精灵', '矮人', '巨龙', '圣剑', '魔王城', '佣兵', '吸血鬼', '狼人', '圣光'],
    '东方玄幻': ['修仙', '修真', '金丹', '元婴', '渡劫', '飞升', '灵气', '法宝', '剑气', '仙尊', '天庭', '魔道', '正道'],
    '武侠': ['江湖', '武功', '内力', '剑气', '掌门', '秘籍', '武林', '大侠', '少林', '武当', '峨眉', '华山', '轻功'],

    // 科幻
    '硬科幻': ['太空', '飞船', '激光', '人工智能', '机器人', '外星人', '未来', '科技', '星际', '曲速', '量子', '纳米', '克隆'],
    '软科幻': ['时间旅行', '平行世界', '虚拟现实', '意识上传', '赛博朋克', ' Cyberpunk', '仿生人', '神经连接'],
    '太空歌剧': ['帝国', '联邦', '舰队', '星际战争', '殖民星球', '外星文明', '超空间', '星门'],

    // 悬疑惊悚
    '诡异': ['诡异', '怪谈', '诅咒', '精神病院', '克苏鲁', 'SCP', '恐怖', '惊悚', '灵异', '邪神', '古神', 'san值', '收容'],
    '侦探推理': ['谋杀', '侦探', '推理', '谜题', '线索', '嫌疑人', '不在场证明', '密室', '凶手', '真相'],
    '犯罪黑帮': ['黑帮', '犯罪', '毒品', '枪战', '卧底', '警察', '杀手', '走私', '洗钱', '地下世界'],

    // 现实题材
    '都市': ['都市', '职场', '爱情', '校园', '青春', '恋爱', '公司', '白领', '大学生', '公寓', '地铁', '咖啡厅'],
    '历史': ['历史', '古代', '王朝', '皇帝', '将军', '战争', '谋略', '宫廷', '穿越历史', '改变历史', '三国', '唐朝', '宋朝'],
    '军事': ['军事', '战争', '士兵', '指挥官', '战术', '战略', '坦克', '战机', '军舰', '特种部队', '间谍', '情报'],

    // 特殊题材
    '体育竞技': ['体育', '篮球', '足球', '网球', '游泳', '奥运会', '冠军', '训练', '比赛', '运动员', '教练', 'NBA'],
    '美食': ['美食', '厨师', '料理', '烹饪', '食谱', '食材', '餐馆', '美味', '舌尖', '烘焙', '小吃'],
    '游戏': ['游戏', '玩家', '副本', 'BOSS', '装备', '等级', '技能', '公会', 'PVP', '电竞', '全息', 'VR', 'LOL'],

    // 情感类型
    '恋爱': ['恋爱', '爱情', '告白', '约会', '分手', '初恋', '暗恋', '情侣', '婚姻', '求婚', '吃醋', '三角恋'],
    '治愈': ['治愈', '温馨', '温暖', '感动', '友情', '亲情', '成长', '救赎', '希望', '阳光', '微笑'],
    '悲剧': ['悲剧', '死亡', '离别', '痛苦', '绝望', '牺牲', '眼泪', '悲伤', '虐心', '遗憾', '命运'],

    // 风格类型
    '搞笑': ['搞笑', '幽默', '吐槽', '逗比', '沙雕', '欢乐', '爆笑', '无厘头', '恶搞', '段子'],
    '热血': ['热血', '战斗', '激情', '信念', '伙伴', '梦想', '胜利', '不屈', '斗志', '爆发'],
    '黑暗': ['黑暗', '残酷', '人性', '背叛', '阴谋', '权力', '欲望', '堕落', '毁灭', '复仇'],
};

function guess(filename: string) {
    const guesses: string[] = [];
    const lowerName = filename.toLowerCase();

    for (const [k, v] of Object.entries(GENRE_KEYWORDS)) {
        if (v.some(keyword => lowerName.includes(keyword))) {
            guesses.push(k);
        }
    }

    if (guesses.length) return guesses;
}

// 主复制函数（同步版）
function copyFilesSync(
    srcDir: string,
    destDir: string,
    filter: {
        keyWords?: string[];
        reverseKeyWords?: string[];
        preset?: string[];
        reversePreset?: string[];

        maxTotalSize?: number;
        minFileSize?: number;
        maxFileCount?: number;

        randomIndex?: boolean;
    }
): void {
    // 同步创建目标目录
    try {
        Deno.mkdirSync(destDir, { recursive: true });
    } catch (e) {
        if (!(e instanceof Deno.errors.AlreadyExists)) {
            throw e;
        }
    }

    let totalSize = 0;
    let fileCount = 0;
    const copiedFiles: string[] = [];

    // 同步遍历目录
    const files = Array.from(Deno.readDirSync(srcDir)).filter(e => e.isFile);
    let __i = 0;
    while(true) {
        const fid = filter.randomIndex ? Math.floor(Math.random() * files.length) : __i ++;
        const entry = files.splice(fid, 1)[0];

        if (fileCount % 8 == 0){
            console.clear();
        }

        const filePath = join(srcDir, entry.name);
        const fileStat = Deno.statSync(filePath);

        // 应用过滤条件
        if (filter.minFileSize && fileStat.size < filter.minFileSize) {
            console.log(` - ${name} 不符合 minFileSize 限制 (${formatSize(fileStat.size)})`)
            continue;
        }
        if (filter.maxTotalSize && totalSize + fileStat.size > filter.maxTotalSize) {
            break;
        }
        if (filter.maxFileCount && fileCount >= filter.maxFileCount) {
            break;
        }
        if (
            (filter.keyWords && !filter.keyWords.some(kw => entry.name.includes(kw))) ||
            (filter.reverseKeyWords && filter.reverseKeyWords.some(kw => entry.name.includes(kw)))
        ) {
            console.log(` - ${name} 不符合 keyWords 限制`);
            continue;
        }
        const guesses = guess(entry.name);
        if (
            (filter.preset && guesses && filter.preset.every(p => !guesses.includes(p))) ||
            (filter.reversePreset && guesses && !filter.reversePreset.some(p => guesses.includes(p)))
        ) {
            console.log(` - ${name} 不符合 preset 限制`);
            continue;
        }

            // 执行复制
            const destPath = join(destDir, entry.name);
        console.log(`[${fileCount + 1}] 复制 ${entry.name} (${formatSize(fileStat.size)}, modified=${fileStat.mtime})`);

        try {
            copyFileWithProgressSync(filePath, destPath, fileStat.size);
            totalSize += fileStat.size;
            fileCount++;
            copiedFiles.push(entry.name);
        } catch (err) {
            console.error(`复制 ${entry.name} 失败: ${err instanceof Error ? err.message : err}`);
            break;
        }
    }

    // 输出摘要
    console.log("\n复制完成:");
    console.log(`- 文件数: ${fileCount}`);
    console.log(`- 总大小: ${formatSize(totalSize)}`);
    console.log(`- 文件列表: ${copiedFiles.join(", ")}`);
}

// 格式化文件大小（B/KB/MB/GB）
function formatSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(2)}${units[unitIndex]}`;
}

// 主程序
export async function main() {
    const args = parseArgs(Deno.args, {
        string: ["size", "singleMinSize", "count"],
        collect: ["keyWords", "reverse-preset", "preset"],
        boolean: ["help", "random"],
        alias: {
            k: "keyWords",
            z: "size",
            m: "singleMinSize",
            c: "count",
            p: "preset",
            v: "reverse-preset",
            r: "random",
            h: "help",
        },
        default: {
            src: ".",
            dest: ".",
        },
    });

    if (args.help) {
        console.log(`轻TXT出库程序
使用说明:
    deno run -A copy.ts 源目录 目标目录 ...

参数:
    -k, --keyWords <words>          关键字过滤 (多个用逗号分隔)
    -z, --size <size>               总大小限制 (如 10m)
    -m, --singleMinSize <size>      单文件最小大小限制 (如 1k)
    -c, --count <count>             文件数量限制 (整数)
    -p, --preset <preset>           筛选预设小说类型(从标题自动推断,实验性)
    -v, --reverse-preset <preset>   排除预设小说类型(从标题自动推断,实验性)
    -r, --random                    随机复制文件,默认按文件系统顺序复制

示例:
    deno run -A copy.ts -s e:/docs/ -d e:/backup/ -k .txt -z 10m -m 1k -c 5
`);
        Deno.exit(0);
    }

    const [src, dest] = args._ as [string, string];
    if ([typeof src, typeof dest].some(t => t !== "string")) {
        console.error("缺少参数: 源目录 目标目录");
        Deno.exit(1);
    }

    try {
        // 参数验证
        accessSync(src, constants.R_OK);

        copyFilesSync(src, dest, {
            keyWords: args.keyWords as string[],
            maxTotalSize: args.size ? parseSize(args.size) : undefined,
            minFileSize: args.singleMinSize ? parseSize(args.singleMinSize) : undefined,
            maxFileCount: args.count ? parseInt(args.count) : undefined,
            reversePreset: args["reverse-preset"] as string[],
            preset: args.preset as string[],
            randomIndex: args.random
        });
    } catch (err) {
        console.error("错误:", err);
        Deno.exit(1);
    }
}

if (import.meta.main) main();