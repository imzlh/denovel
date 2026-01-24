import { parseArgs } from "jsr:@std/cli/parse-args";
import { basename, dirname, join } from "jsr:@std/path";
import { generateEpub, EpubContentOptions, EpubOptions } from "./genepub.ts";
import { exists } from "./main.ts";
import { FontkitNotRegisteredError } from "npm:pdf-lib@^1.17.1";
import { existsSync } from "node:fs";

interface NovelFile {
    id: number;
    title: string;
    filename: string;
    content: string;
    coverImage?: string;
}

/**
 * 从文件名中提取ID和标题
 * 格式: 21437161-最强魔法少女....txt
 */
function parseFilename(filename: string): { id: number; title: string } | null {
    const match = filename.match(/^(\d+)-(.+)\.txt$/);
    if (!match) return null;

    return {
        id: parseInt(match[1]),
        title: match[2]
    };
}

/**
 * 查找对应的封面图片
 */
async function findCoverImage(inputDir: string, id: number, title: string): Promise<string | undefined> {
    const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const baseFilename = `${id}-${title}`;

    for (const ext of extensions) {
        const coverPath = join(inputDir, `${baseFilename}.${ext}`);
        if (await exists(coverPath)) {
            return coverPath;
        }
    }

    return undefined;
}

/**
 * 处理图片标记，将 [uploadedimage:ID] 转换为 <img> 标签
 * 注意：genepub 会通过 rehype 插件扫描 HTML 中的 <img> 标签来识别图片
 */
function processImages(content: string, inputDir: string, baseId: number, title: string): string {
    return content.replace(
        /\[uploadedimage:(\d+)\]/g,
        (_, imageId) => {
            // 尝试不同后缀名
            let imgFilename = `${baseId}-${title}-${imageId}`;
            for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'webp']) {
                const imgPath = join(inputDir, `${imgFilename}.${ext}`);
                if (existsSync(imgPath)) {
                    return `<img src="file://${encodeURI(imgPath)}" alt="image-${imageId}" />`;
                }
            }
            return `<img src="file://${imgFilename}.png" alt="image-${imageId}" />`;
        }
    );
}

/**
 * 将文本内容转换为HTML段落
 */
function textToHtml(text: string): string {
    // 移除开头和结尾的空白
    text = text.trim();

    // 将连续的换行符转换为段落
    const paragraphs = text.split(/\n\n+/).map(para => {
        const trimmed = para.trim();
        if (!trimmed) return '';

        // 处理单行换行（转换为空格或<br>，根据需要）
        const lines = trimmed.split('\n').map(line => line.trim()).filter(line => line);

        if (lines.length === 0) return '';
        if (lines.length === 1) return `<p>${lines[0]}</p>`;

        // 多行内容用<br/>连接
        return `<p>${lines.join('<br/>\n')}</p>`;
    }).filter(p => p);

    return paragraphs.join('\n');
}

/**
 * 读取并处理所有txt文件
 */
async function loadNovelFiles(inputDir: string): Promise<NovelFile[]> {
    const novels: NovelFile[] = [];

    try {
        for await (const entry of Deno.readDir(inputDir)) {
            if (!entry.isFile || !entry.name.endsWith('.txt')) continue;

            const parsed = parseFilename(entry.name);
            if (!parsed) {
                console.warn(`跳过无法解析的文件: ${entry.name}`);
                continue;
            }

            const filepath = join(inputDir, entry.name);
            const content = await Deno.readTextFile(filepath);

            // 查找对应的封面图片
            const coverImage = await findCoverImage(inputDir, parsed.id, parsed.title);

            // 处理图片标记
            const processedContent = processImages(content, inputDir, parsed.id, parsed.title);

            // 转换为HTML
            const htmlContent = textToHtml(processedContent);

            novels.push({
                id: parsed.id,
                title: parsed.title,
                filename: entry.name,
                content: htmlContent,
                coverImage
            });
        }
    } catch (err) {
        throw new Error(`读取目录失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 按ID排序
    novels.sort((a, b) => a.id - b.id);

    return novels;
}

/**
 * 从HTML中提取所有图片路径
 */
function extractImagePaths(html: string): string[] {
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
    const paths: string[] = [];
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
        paths.push(match[1]);
    }

    return paths;
}

/**
 * 检查图片文件是否存在
 */
async function checkImages(novels: NovelFile[]): Promise<{
    existing: string[];
    missing: string[];
}> {
    const existing: string[] = [];
    const missing: string[] = [];
    const checked = new Set<string>();

    for (const novel of novels) {
        const imagePaths = extractImagePaths(novel.content);

        for (let i = 0; i < imagePaths.length; i++) {
            let imgPath = imagePaths[i];

            // 移除 file:// 前缀
            const filePath = imgPath.replace(/^file:\/\//, '');

            if (checked.has(filePath)) continue;
            checked.add(filePath);

            if (await exists(filePath)) {
                existing.push(filePath);
            } else {
                // try png webp extension
                let found = false;
                for (const ext of ['jpg', 'jpeg', 'webp']) {
                    const altPath = filePath.replace(/\.[^.]+$/, `.${ext}`);
                    if (await exists(altPath)) {
                        imgPath = altPath;
                        imagePaths[i] = imgPath;
                        existing.push(imgPath);
                        console.log(`  ✓ 自动识别： ${basename(altPath)} (使用 ${ext} 扩展名)`)
                        found = true;
                        break;
                    }
                }
                if (!found) missing.push(filePath);
            }
        }
    }

    return { existing, missing };
}

async function main() {
    const args = parseArgs(Deno.args, {
        string: ['input', 'output', 'author', 'cover'],
        boolean: ['help', 'force'],
        alias: {
            i: 'input',
            o: 'output',
            h: 'help',
            a: 'author',
            c: 'cover',
            f: 'force'
        }
    });

    if (args.help) {
        console.log(`将 Powerful Pixiv Downloader 输出的系列小说转换为 EPUB

用法:
  deno run --allow-read --allow-write pixiv2epub.ts [选项]

选项:
  -i, --input <dir>      输入目录（包含所有txt和图片文件）
  -o, --output <file>    输出的epub文件路径
  -a, --author <name>    作者名称（默认: Pixiv作者）
  -c, --cover <file>     封面图片路径（默认: 自动查找第一个小说的封面）
  -f, --force            覆盖已存在的输出文件
  -h, --help             显示帮助信息

示例:
  deno run --allow-read --allow-write pixiv2epub.ts -i ./novels -o output.epub
  deno run --allow-read --allow-write pixiv2epub.ts -i ./novels -o output.epub -a "某作者" -v
  deno run --allow-read --allow-write pixiv2epub.ts -i ./novels -c /path/to/cover.jpg

说明:
  - 程序会自动识别格式为 "ID-标题.txt" 的文件
  - 自动查找对应的封面图片 "ID-标题.jpg/png/..."
  - 图片标记 [uploadedimage:ID] 会被转换为 <img> 标签
  - 文件会按ID自动排序后按顺序添加到EPUB
  - 确保对应的图片文件也在同一目录下
`);
        Deno.exit(0);
    }

    const inputDir = args.input || args._[0];
    if (!inputDir || typeof inputDir !== 'string') {
        console.error("错误: 请指定输入目录");
        console.error("使用 --help 查看帮助信息");
        Deno.exit(1);
    }

    // 检查输入目录是否存在
    if (!await exists(inputDir)) {
        console.error(`错误: 输入目录不存在: ${inputDir}`);
        Deno.exit(1);
    }

    console.log(`正在读取目录: ${inputDir}`);

    // 加载所有小说文件
    const novels = await loadNovelFiles(inputDir);

    if (novels.length === 0) {
        console.error("错误: 没有找到任何符合格式的txt文件");
        console.error("文件名格式应为: ID-标题.txt");
        Deno.exit(1);
    }

    console.log(`\n找到 ${novels.length} 个小说文件:`);
    novels.forEach(novel => {
        const coverInfo = novel.coverImage ? ` [有封面]` : '';
        console.log(`  - [${novel.id}] ${novel.title}${coverInfo}`);
    });

    // 确定输出文件名
    let outputFile: string;
    if (args.output) {
        outputFile = args.output;
    } else {
        // 使用第一个文件的标题作为输出文件名
        const seriesTitle = novels[0].title.substring(0, 50).replace(/[<>:"/\\|?*]/g, '_');
        outputFile = join(dirname(inputDir) === '.' ? '.' : dirname(inputDir), `${seriesTitle}.epub`);
    }

    // 确保输出文件以.epub结尾
    if (!outputFile.endsWith('.epub')) {
        outputFile += '.epub';
    }

    // 检查输出文件是否已存在
    if (await exists(outputFile) && !args.force) {
        console.error(`\n错误: 输出文件已存在: ${outputFile}`);
        console.error("使用 -f 或 --force 选项覆盖");
        Deno.exit(1);
    }

    // 准备EPUB内容
    const content: EpubContentOptions[] = novels.map((novel, index) => ({
        title: novels.length > 1 ? `${index + 1}. ${novel.title}` : novel.title,
        data: novel.content,
        author: args.author || "Pixiv作者"
    }));

    // 处理封面 - 优先级：命令行参数 > 第一个小说的封面 > 无
    let coverPath: string | undefined;
    if (args.cover) {
        if (await exists(args.cover)) {
            coverPath = args.cover;
            console.log(`\n使用指定封面: ${basename(args.cover)}`);
        } else {
            console.warn(`\n警告: 指定的封面文件不存在: ${args.cover}`);
        }
    } else if (novels[0].coverImage) {
        coverPath = novels[0].coverImage;
        console.log(`\n使用自动检测的封面: ${basename(coverPath)}`);
    }

    // 准备EPUB选项
    const options: EpubOptions = {
        title: novels.length > 1
            ? `${novels[0].title}（共${novels.length}篇）`
            : novels[0].title,
        description: `来自Pixiv的系列小说`,
        author: args.author || "Pixiv作者",
        publisher: "Pixiv",
        lang: "zh-CN",
        content: content,
        cover: coverPath,
        verbose: true,
        version: 3,
        downloadAudioVideoFiles: false,
        logHandler: (level, message) => {
            console.log(` [${level.toUpperCase()}] ${message}`);
        }
    };

    console.log(`\n输出文件: ${outputFile}`);
    console.log("开始生成EPUB...\n");

    try {
        await generateEpub(options, outputFile);
        console.log("\n✓ 转换完成!");
        console.log(`输出文件: ${outputFile}`);
    } catch (err) {
        console.error("\n✗ 转换失败!");
        console.error(err instanceof Error ? err.message : String(err));
        if (err instanceof Error && err.stack) {
            console.error(err.stack);
        }
        Deno.exit(1);
    }
}

if (import.meta.main) {
    main().catch(err => {
        console.error("程序错误:", err instanceof Error ? err.message : String(err));
        Deno.exit(1);
    });
}