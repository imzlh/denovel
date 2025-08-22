import { FileScanner } from "./fromfs.ts";
import { BookManager } from "../main.ts";

export class InteractiveTrainer {
    static async new() {
        return new this(new FileScanner(), await BookManager.new());
    }

    constructor(
        private scanner: FileScanner,
        private manager: BookManager,
    ) { }

    // 交互式训练模式
    async startInteractiveTraining(booksDir: string): Promise<void> {
        console.log("开始扫描书籍文件...");
        const books = await Array.fromAsync(this.scanner.scanDirectory(booksDir));
        console.log(`找到 ${books.length} 本书籍`);

        // 初始训练
        await this.manager.initialize();

        let trainedCount = 0;

        for (const book of books) {
            console.log(`\n=== 处理第 ${trainedCount + 1}/${books.length} 本书 ===`);
            console.log(`文件名: ${book.name}`);
            console.log(`大小: ${(book.size / 1024).toFixed(1)} KB`);

            // 从文件名猜测标签
            const guessedTags = this.scanner.guessTagsFromFilename(book.name);
            if (guessedTags.length > 0) {
                console.log(`猜测标签: ${guessedTags.join(', ')}`);
            }

            // 显示内容预览
            const preview = book.content.substring(0, 10000).replace(/\n/g, ' ');
            console.log(`内容预览: ${preview}...`);

            // 让用户确认或输入标签
            const userTags = await this.promptForTags(guessedTags);

            if (userTags.length > 0) {
                // 使用书籍内容作为训练数据
                for (const tag of userTags) {
                    await this.manager.addManualTrainingData(book.content.substring(0, 1000), tag);
                    trainedCount++;
                }
                console.log(`✓ 已添加训练数据 for ${userTags.join(', ')}`);
            } else {
                console.log('⏭️  跳过本书');
            }

            // 每训练10本就保存一次
            if (trainedCount % 10 === 0) {
                console.log('💾 自动保存模型...');
                await this.manager._nlp.saveModel();
            }
        }

        console.log('\n🎉 训练完成！开始最终训练...');
        await this.manager._nlp.train();
        await this.manager._nlp.saveModel();
        console.log(`✅ 总共训练了 ${trainedCount} 个样本`);
    }

    // 命令行交互获取用户输入
    private async promptForTags(suggestedTags: string[]): Promise<string[]> {
        console.log('\n请选择标签（输入数字，多个用逗号分隔，回车跳过）:');

        const allTags = [
            '轻小说', '诡异', '科幻', '武侠', '都市', '历史', '仙侠',
            '恋爱', '穿越', '体育', '电竞', '都市', '职场', '军事', '动漫',
            '其他'
        ];

        let text = '';
        allTags.forEach((tag, index) => {
            const isSuggested = suggestedTags.includes(tag);
            text += (`\t${index + 1}. ${tag} ${isSuggested ? '(推荐)' : ''}`);
            if (index % 5 === 4) {
                console.log(text);
                text = '';
            }
        });
        console.log('\t0. 手动输入标签\tEnter. 跳过本书');

        const input = prompt('你的选择: ')?.trim();

        if (!input) return [];

        if (input === '0') {
            const manualInput = prompt('请输入标签（多个用逗号分隔）: ')?.trim();
            return manualInput ? manualInput.split(',').map(t => t.trim()) : [];
        }

        const selectedIndices = input.split(',').map(num => parseInt(num.trim()) - 1);
        return selectedIndices
            .filter(index => index >= 0 && index < allTags.length)
            .map(index => allTags[index]);
    }

    // 批量训练模式（快速模式）
    async batchTraining(booksDir: string, useFilenameAsLabel: boolean = true): Promise<void> {
        console.log("开始批量训练模式...");

        for await (const book of this.scanner.scanDirectory(booksDir)) {
            let tags: string[];

            if (useFilenameAsLabel) {
                // 使用文件名作为标签来源
                tags = this.scanner.guessTagsFromFilename(book.name);
            } else {
                // 使用内容分析（简单版）
                tags = await this.analyzeContentForTags(book.content);
            }

            if (tags.length > 0) {
                for (const tag of tags) {
                    await this.manager.addManualTrainingData(book.content.substring(0, 1000), tag);
                }
                console.log(`✓ ${book.name} -> ${tags.join(', ')}`);
            }
        }

        console.log('开始训练模型...');
        await this.manager._nlp.train();
        await this.manager._nlp.saveModel();
        console.log('✅ 批量训练完成！');
    }

    // 简单的内容分析
    private async analyzeContentForTags(content: string): Promise<string[]> {
        const text = content.toLowerCase();
        const tags: string[] = [];

        if (text.includes('异世界') || text.includes('转生')) tags.push('轻小说');
        if (text.includes('诡异') || text.includes('恐怖')) tags.push('诡异');
        if (text.includes('太空') || text.includes('星际')) tags.push('科幻');
        if (text.includes('武功') || text.includes('江湖')) tags.push('武侠');

        return tags;
    }
}

async function main() {
    const trainer = await InteractiveTrainer.new();
    const booksDirectory = "E:\\docs\\Documents\\txt"; // 您的电子书目录

    console.log("请选择训练模式:");
    console.log("1. 交互式训练（推荐）");
    console.log("2. 批量快速训练");
    console.log("3. 仅扫描并显示统计信息");

    const choice = prompt("请输入选择 (1-3): ");

    switch (choice) {
        case "1":
            await trainer.startInteractiveTraining(booksDirectory);
            break;
        case "2":
            await trainer.batchTraining(booksDirectory, true);
            break;
        case "3":
            await scanOnly(booksDirectory);
            break;
        default:
            console.log("无效选择");
    }
}

async function scanOnly(dirPath: string) {
    const scanner = new FileScanner();
    const books = await Array.fromAsync(scanner.scanDirectory(dirPath));

    console.log(`找到 ${books.length} 本书籍`);
    console.log("文件列表:");
    books.forEach((book, index) => {
        const guessedTags = scanner.guessTagsFromFilename(book.name);
        console.log(`${index + 1}. ${book.name} (${(book.size / 1024).toFixed(1)}KB) -> ${guessedTags.join(', ') || '未知'}`);
    });
}

main().catch(console.error);