#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net

interface ChapterInfo {
    itemId: string;
    title: string;
    realChapterOrder: string;
}

interface BookInfo {
    bookId: string;
    bookName: string;
    author: string;
    description: string;
    coverUrl?: string;
    categorySchema?: string;
    totalChapters: number;
    wordNumber: string;
}

interface ChapterContent {
    chapterName: string;
    rawContent: string;
    txtContent: string;
    wordCount: number;
    isFree: boolean;
}

interface BatchChaptersResponse {
    code: number;
    message: string;
    data: {
        bookId: string;
        bookInfo: Partial<BookInfo>;
        chapters: Record<string, ChapterContent>;
        successCount?: number;
        totalRequested?: number;
    };
}

async function fetchBookInfo(bookId: string, baseUrl = "http://127.0.0.1:9999"): Promise<any> {
    const url = `${baseUrl}/api/fqnovel/book/${bookId}`;
    console.log(`获取书籍信息: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`获取书籍信息失败: ${response.statusText}`);
    }
    return await response.json();
}

async function fetchDetailJson(bookId: string): Promise<any> {
    const url = `https://fanqienovel.com/api/reader/directory/detail?bookId=${bookId}`;
    console.log(`获取目录: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`获取目录失败: ${response.statusText}`);
    }
    return await response.json();
}

async function fetchBatchChapters(
    bookId: string,
    chapterIds: string[],
    baseUrl = "http://127.0.0.1:9999"
): Promise<BatchChaptersResponse> {
    const url = `${baseUrl}/api/fqnovel/chapters/batch`;

    console.log(`获取 ${chapterIds.length} 章内容...`);

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            bookId,
            chapterIds,
        }),
    });

    if (!response.ok) {
        throw new Error(`获取章节失败: ${response.statusText}`);
    }

    return await response.json();
}

function extractCategories(categorySchema: string): string[] {
    try {
        const categories = JSON.parse(categorySchema);
        return categories.map((cat: any) => cat.name);
    } catch {
        return [];
    }
}

async function mergeToTxt(
    bookId: string,
    outputPath?: string,
    baseUrl = "http://127.0.0.1:9999"
) {
    console.log(`\n开始处理书籍 ID: ${bookId}\n`);

    // 1. 获取书籍信息和目录
    console.log("【步骤 1/3】获取书籍信息和目录");

    // 从本地 API 获取完整书籍信息
    const bookInfoData = await fetchBookInfo(bookId, baseUrl);
    const bookData = bookInfoData.data;

    // 从番茄 API 获取章节目录
    const detailData = await fetchDetailJson(bookId);
    const chapterList: ChapterInfo[] = detailData.data.chapterListWithVolume[0] || [];
    const totalChapters = chapterList.length;

    console.log(`  ✓ 书名: ${bookData.bookName}`);
    console.log(`  ✓ 作者: ${bookData.author}`);
    console.log(`  ✓ 共 ${totalChapters} 章\n`);

    // 2. 批量获取章节内容（每次最多30章）
    console.log("【步骤 2/3】获取章节内容");
    const allChapters: Record<string, ChapterContent> = {};
    let bookInfo: Partial<BookInfo> | null = null;

    const batchSize = 30;
    const batches = Math.ceil(totalChapters / batchSize);

    for (let i = 0; i < batches; i++) {
        const startIdx = i * batchSize;
        const endIdx = Math.min((i + 1) * batchSize, totalChapters);
        const batchChapterIds = chapterList.slice(startIdx, endIdx).map(ch => ch.itemId);

        const batchData = await fetchBatchChapters(bookId, batchChapterIds, baseUrl);

        if (batchData.code !== 0) {
            console.warn(`  ⚠ 批次 ${i + 1}/${batches} 获取失败: ${batchData.message}`);
            continue;
        }

        // 保存书籍信息（只需一次）
        if (!bookInfo && batchData.data.bookInfo) {
            bookInfo = batchData.data.bookInfo;
        }

        // 保存章节内容（按itemId）
        for (const [itemId, content] of Object.entries(batchData.data.chapters)) {
            allChapters[itemId] = content;
        }

        const successCount = Object.keys(batchData.data.chapters).length;
        console.log(`  ✓ 批次 ${i + 1}/${batches} 完成 (${successCount}/${batchChapterIds.length} 章)`);

        // 避免请求过快
        if (i < batches - 1) {
            await new Promise(resolve => setTimeout(resolve, 4000 + Math.random() * 2000));
        }
    }

    console.log(`  ✓ 共获取 ${Object.keys(allChapters).length} 章内容\n`);

    // 3. 合并成TXT
    console.log("【步骤 3/3】生成TXT文件");

    // 使用本地 API 返回的完整书籍信息
    const fullBookInfo: BookInfo = {
        bookId: bookData.bookId || bookId,
        bookName: bookData.bookName || "未知书名",
        author: bookData.author || "未知作者",
        description: bookData.description || bookData.bookAbstractV2 || "",
        coverUrl: bookData.coverUrl || bookData.expandThumbUrl || bookData.detailPageThumbUrl,
        categorySchema: bookData.categorySchema,
        totalChapters: bookData.totalChapters || totalChapters,
        wordNumber: bookData.wordNumber || "",
    };

    let txtContent = "";

    // 添加书籍信息头部
    txtContent += `${fullBookInfo.bookName}\n`;
    txtContent += `作者: ${fullBookInfo.author}\n`;

    if (fullBookInfo.wordNumber) {
        txtContent += `字数: ${fullBookInfo.wordNumber}\n`;
    }

    txtContent += `章节数: ${fullBookInfo.totalChapters}\n`;

    if (fullBookInfo.categorySchema) {
        const categories = extractCategories(fullBookInfo.categorySchema);
        if (categories.length > 0) {
            txtContent += `分类: ${categories.join(", ")}\n`;
        }
    }

    // 添加更多书籍元数据
    if (bookData.tags) {
        txtContent += `标签: ${bookData.tags}\n`;
    }

    if (bookData.readCntText) {
        txtContent += `阅读量: ${bookData.readCntText}\n`;
    }

    if (bookData.source) {
        txtContent += `来源: ${bookData.source}\n`;
    }

    if (fullBookInfo.coverUrl) {
        txtContent += `封面: ${fullBookInfo.coverUrl}\n`;
    }

    if (fullBookInfo.description) {
        txtContent += `\n简介:\n${fullBookInfo.description}\n`;
    }

    txtContent += `\n${"=".repeat(60)}\n\n`;

    // 按章节顺序添加内容
    let successCount = 0;
    let missingCount = 0;

    for (const chapterInfo of chapterList) {
        const chapter = allChapters[chapterInfo.itemId];

        if (chapter && chapter.txtContent) {
            txtContent += `${chapter.chapterName || chapterInfo.title}\n\n`;
            txtContent += `${chapter.txtContent}\n\n`;
            txtContent += `${"=".repeat(60)}\n\n`;
            successCount++;
        } else {
            txtContent += `${chapterInfo.title}\n\n`;
            txtContent += `[章节内容缺失]\n\n`;
            txtContent += `${"=".repeat(60)}\n\n`;
            missingCount++;
            console.warn(`  ⚠ 章节内容缺失: ${chapterInfo.title} (ID: ${chapterInfo.itemId})`);
        }
    }

    // 保存文件
    const fileName = outputPath || `${fullBookInfo.bookName}.txt`;
    const sanitizedFileName = fileName.replace(/[<>:"/\\|?*]/g, "_");

    await Deno.writeTextFile(sanitizedFileName, txtContent);

    console.log(`\n✓ 合并完成!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  文件名: ${sanitizedFileName}`);
    console.log(`  总章节: ${totalChapters}`);
    console.log(`  成功: ${successCount} 章`);
    if (missingCount > 0) {
        console.log(`  缺失: ${missingCount} 章`);
    }
    console.log(`  文件大小: ${(txtContent.length / 1024).toFixed(2)} KB`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

// 主程序
if (import.meta.main) {
    const args = Deno.args;

    if (args.length === 0) {
        console.log("番茄小说下载合并工具");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("\n用法:");
        console.log("  deno run --allow-read --allow-write --allow-net merge.ts <bookId> [输出文件名] [API地址]");
        console.log("\n参数:");
        console.log("  bookId      - 书籍ID (必须)");
        console.log("  输出文件名  - 自定义输出文件名 (可选，默认为'书名.txt')");
        console.log("  API地址     - 本地API服务地址 (可选，默认为'http://127.0.0.1:9999')");
        console.log("\n示例:");
        console.log("  deno run --allow-read --allow-write --allow-net merge.ts 7582250869396081689");
        console.log("  deno run --allow-read --allow-write --allow-net merge.ts 7582250869396081689 output.txt");
        console.log("  deno run --allow-read --allow-write --allow-net merge.ts 7582250869396081689 output.txt http://localhost:8888");
        console.log("");
    }

    const bookId = args[0] ?? prompt("请输入书籍ID:");
    const outputPath = args[1];
    const baseUrl = args[2] || "http://127.0.0.1:9999";

    if (!bookId) {
        console.error("\n✗ 错误: 缺少书籍ID");
        Deno.exit(1);
    }

    try {
        await mergeToTxt(bookId, outputPath, baseUrl);
    } catch (error) {
        console.error(`\n✗ 错误: ${error}`);
        Deno.exit(1);
    }
}