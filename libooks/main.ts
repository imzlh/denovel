import { BookDatabase } from "./db.ts";
import { NLPManager } from "./nlp.ts";
import { INITIAL_TAG_RULES } from "./rules.ts";
import { Book, TagRule, TrainingData } from "./types.d.ts";

export class BookManager {

    static async new() {
        const r = new BookManager(
            await BookDatabase.new(),
            new NLPManager(),
            INITIAL_TAG_RULES
        );
        await r.initialize();
        r._nlp.loadModel();
        return r;
    }

    constructor(
        private db: BookDatabase,
        private nlp: NLPManager,
        private tagRules: TagRule[]
    ) { }

    get _nlp(){
        return this.nlp;
    }

    // 初始化系统（训练模型）
    async initialize(): Promise<void> {
        // 生成训练数据并训练模型
        const trainingData = this.nlp.generateTrainingDataFromRules(this.tagRules);
        await this.nlp.addTrainingData(trainingData);
        await this.nlp.train();
        // await this.nlp.saveModel();
    }

    // 导入单本书籍
    async importBook(
        title: string,
        author: string,
        description: string,
        content: string,
        filePath: string
    ): Promise<Book> {
        const id = crypto.randomUUID();
        const analysisText = `${title} ${description} ${content.substring(0, 5000)}`;

        // 使用NLP模型进行分类
        const classifications = await this.nlp.classifyText(analysisText);
        const tags = classifications.map(cls => cls.label);
        const confidence = Object.fromEntries(
            classifications.map(cls => [cls.label, cls.confidence])
        );

        const book: Book = {
            id,
            title,
            author,
            description,
            content: content.substring(0, 10000),
            filePath,
            tags,
            confidence,
            processedAt: new Date(),
            metadata: {
                contentLength: content.length,
                analyzedAt: new Date().toISOString()
            }
        };

        await this.db.saveBook(book);
        return book;
    }

    // 批量导入
    async importBooks(booksData: Array<{
        title: string;
        author: string;
        description: string;
        content: string;
        filePath: string;
    }>): Promise<Book[]> {
        const importedBooks: Book[] = [];

        for (const data of booksData) {
            try {
                const book = await this.importBook(
                    data.title,
                    data.author,
                    data.description,
                    data.content,
                    data.filePath
                );
                importedBooks.push(book);
            } catch (error) {
                console.error(`导入书籍失败: ${data.title}`, error);
            }
        }

        return importedBooks;
    }

    // 搜索接口
    async searchBooks(filters: any) {
        return await this.db.searchBooks(filters);
    }

    // 获取统计信息
    async getStats() {
        return await this.db.getStats();
    }

    // 手动添加训练数据（用于持续改进模型）
    async addManualTrainingData(text: string, label: string): Promise<void> {
        const _cslg = console.log;
        let i = 0;
        console.log = () => i ++; // 屏蔽console.log输出
        await this.nlp.addTrainingData([{ text, label }]);
        await this.nlp.train(); // 重新训练模型
        await this.nlp.saveModel();
        console.log = _cslg; // 恢复console.log输出
        _cslg(i, 'Epochs used')
    }

    // 获取书籍推荐（基于相似内容） - 修正版本
    async getSimilarBooks(bookId: string, limit: number = 5): Promise<Book[]> {
        const book = await this.db.getBook(bookId);
        if (!book) return [];

        // 获取所有书籍（通过数据库方法）
        const allBooks = await this.searchBooks({ limit: 1000 }); // 获取足够多的书籍进行相似度计算

        // 过滤掉当前书籍
        const otherBooks = allBooks.filter(b => b.id !== bookId);

        // 简单的基于标签的相似度计算
        return otherBooks
            .map(otherBook => ({
                book: otherBook,
                similarity: this.calculateSimilarity(book.tags, otherBook.tags)
            }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit)
            .map(item => item.book);
    }

    // 新增：获取所有书籍的方法
    async getAllBooks(limit: number = 1000): Promise<Book[]> {
        return await this.searchBooks({ limit });
    }

    // 新增：按标签获取书籍
    async getBooksByTag(tag: string, limit: number = 50): Promise<Book[]> {
        return await this.searchBooks({ tags: [tag], limit });
    }

    private calculateSimilarity(tags1: string[], tags2: string[]): number {
        const set1 = new Set(tags1);
        const set2 = new Set(tags2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        return intersection.size / Math.max(set1.size, set2.size, 1);
    }

    // 自动从已分类的书籍中提取训练数据
    async autoTrainFromClassifiedBooks(minConfidence: number = 0.8): Promise<void> {
        const allBooks = await this.getAllBooks();
        const highConfidenceBooks = allBooks.filter(book =>
            Object.values(book.confidence).some(conf => conf >= minConfidence)
        );

        const trainingData: TrainingData[] = [];

        for (const book of highConfidenceBooks) {
            // 从高置信度的书籍中提取训练样本
            const sampleText = this.extractTrainingSamples(book);
            for (const tag of book.tags) {
                if (book.confidence[tag] >= minConfidence) {
                    trainingData.push({ text: sampleText, label: tag });
                }
            }
        }

        console.log(`从 ${highConfidenceBooks.length} 本书中提取了 ${trainingData.length} 个训练样本`);

        if (trainingData.length > 0) {
            await this.nlp.addTrainingData(trainingData);
            await this.nlp.train();
            await this.nlp.saveModel();
            console.log("自动训练完成！");
        }
    }

    private extractTrainingSamples(book: Book): string {
        // 从书籍内容中提取有代表性的片段作为训练样本
        const text = `${book.title} ${book.description} ${book.content.substring(0, 500)}`;
        return text;
    }

    // 定期自动训练
    startAutoTraining(intervalHours: number = 24): void {
        setInterval(async () => {
            try {
                console.log("开始定期自动训练...");
                await this.autoTrainFromClassifiedBooks();
                console.log("定期训练完成");
            } catch (error) {
                console.error("自动训练失败:", error);
            }
        }, intervalHours * 60 * 60 * 1000);
    }
}