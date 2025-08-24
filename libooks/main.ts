// book-manager.ts
import { NlpManager } from 'npm:node-nlp';
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { Guesser } from "./tagconfig.ts";
import { basename } from "https://deno.land/std@0.224.0/path/basename.ts";
import { dirname } from "node:path";
import { existsSync } from "../main.ts";

// 图书接口定义
interface Book {
    id: string;
    title: string;
    author?: string;
    content: string;
    category?: string;
    tags?: string[];
    importDate: Date;
    filePath: string;
    fileSize: number;
    lastAccessed?: Date;
    accessCount?: number;
}

// 搜索结果接口
interface SearchResult {
    books: Book[];
    query: string;
    confidence?: number;
    totalResults: number;
}

// 图书管理系统类
class BookManagementSystem {
    private kv: Deno.Kv;
    private nlpManager: any;
    private modelKey = ["nlp", "model"];
    private isTraining = false;

    constructor(private kvPath: string = import.meta.dirname + "/ebooks.db") {
        this.kv = null!;
        this.initNlp();
    }

    // 初始化系统
    async init() {
        this.kv = await Deno.openKv(this.kvPath);
        await this.loadModel();
        console.log("📚 图书管理系统已初始化");
    }

    // 初始化NLP管理器
    private initNlp() {
        this.nlpManager = new NlpManager({
            languages: ['zh'],
            forceNER: true,
            nlu: { useNoneFeature: true }
        });
    }

    // 解析TXT文件内容
    private parseTxtBook(content: string, filePath: string): Partial<Book> {
        const lines = content.split('\n');
        let title = basename(filePath, '.txt');
        let author = '';

        // 查找标题和作者
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // 匹配标题
            if (!title) {
                const titleMatch = line.match(/^《(.+?)》/) ||
                    line.match(/^【(.+?)】/) ||
                    line.match(/^书名[：:]\s*(.+)/) ||
                    line.match(/^Title[：:]\s*(.+)/i);
                if (titleMatch) {
                    title = titleMatch[1].trim();
                    continue;
                }
            }

            // 匹配作者
            if (!author) {
                const authorMatch = line.match(/作者[：:]\s*(.+)/) ||
                    line.match(/^Author[：:]\s*(.+)/i) ||
                    line.match(/^by\s+(.+)/i) ||
                    line.match(/^(.+?)著$/);
                if (authorMatch) {
                    author = authorMatch[1].trim();
                }
            }

            if (title && author) break;
        }

        // 如果没找到标题，使用文件名
        if (!title) {
            const fileName = filePath.split('/').pop() || '';
            title = fileName.replace('.txt', '').replace(/_/g, ' ');
        }

        return {
            title,
            author,
            content,
            filePath
        };
    }

    // 猜测图书类型的函数（用户可自定义）
    private guessBookCategory(book: Book): string {
        const title = book.title.toLowerCase();
        return Guesser.guessTagsFromFilename(title).at(0)! ?? '其他';
    }

    // 批量入库
    async batchImport(folderPath: string): Promise<number> {
        console.log(`📂 开始批量导入: ${folderPath}`);
        let imported = 0;
        const batch: { key: Deno.KvKey; value: Book }[] = [];

        try {
            for await (const entry of Deno.readDir(folderPath)) {
                if (entry.isFile && entry.name.endsWith('.txt')) {
                    const filePath = join(folderPath, entry.name);
                    try {
                        const book = await this.parseBookFile(filePath);
                        batch.push({ key: ["books", book.id], value: book });
                        imported++;
                        console.log(`  ✓ ${entry.name} -> ${book.category}`);
                    } catch (e) {
                        console.error(`  ✗ ${entry.name}: ${e}`);
                    }
                }
            }

            // 批量写入数据库
            if (batch.length > 0) {
                const atomic = this.kv.atomic();
                for (const { key, value } of batch) {
                    atomic.set(key, value);
                }
                await atomic.commit();

                // 更新索引
                await this.updateIndices(batch.map(b => b.value));

                // 自动训练
                await this.train();
            }

            console.log(`✅ 批量导入完成: 成功导入 ${imported} 本书`);
            return imported;
        } catch (error) {
            console.error(`❌ 批量导入失败: ${error}`);
            throw error;
        }
    }

    // 解析单个图书文件
    private async parseBookFile(filePath: string): Promise<Book> {
        const content = await Deno.readTextFile(filePath);
        const stats = await Deno.stat(filePath);
        const bookInfo = this.parseTxtBook(content, filePath);

        const id = crypto.randomUUID();
        const book: Book = {
            id,
            title: bookInfo.title || 'Unknown',
            author: bookInfo.author,
            content: (bookInfo.content || content).substring(0, 1000),
            filePath,
            fileSize: stats.size,
            importDate: new Date(),
            category: undefined,
            tags: [],
            accessCount: 0
        };

        book.category = this.guessBookCategory(book);
        return book;
    }

    // 更新索引
    private async updateIndices(books: Book[]) {
        const atomic = this.kv.atomic();

        for (const book of books) {
            // 标题索引
            atomic.set(["index", "title", book.title.toLowerCase(), book.id], book.id);

            // 作者索引
            if (book.author) {
                atomic.set(["index", "author", book.author.toLowerCase(), book.id], book.id);
            }

            // 分类索引
            if (book.category) {
                atomic.set(["index", "category", book.category, book.id], book.id);
            }
        }

        await atomic.commit();
    }

    // 导入单本书
    async importBook(filePath: string): Promise<Book> {
        const book = await this.parseBookFile(filePath);

        // 保存到KV
        await this.kv.set(["books", book.id], book);

        // 更新索引
        await this.updateIndices([book]);

        console.log(`✅ 导入成功: ${book.title}`);
        return book;
    }

    // 训练NLP模型
    async train(): Promise<void> {
        if (this.isTraining) {
            console.log('⏳ 正在训练中，请稍候...');
            return;
        }

        this.isTraining = true;
        console.log('🧠 开始训练NLP模型...');

        try {
            // this.nlpManager.clear();

            // 获取所有图书
            const books = await this.getAllBooks();

            for (const book of books) {
                // 标题训练
                this.nlpManager.addDocument('zh', book.title, `book_${book.id}`);
                this.nlpManager.addDocument('zh', `找${book.title}`, `book_${book.id}`);

                // 作者训练
                if (book.author) {
                    this.nlpManager.addDocument('zh', `${book.author}的书`, `author_${book.author}`);
                    this.nlpManager.addDocument('zh', `${book.author}写的`, `author_${book.author}`);
                    this.nlpManager.addDocument('zh', `找${book.author}`, `author_${book.author}`);
                }

                // 类别训练
                if (book.category) {
                    this.nlpManager.addDocument('zh', `${book.category}小说`, `category_${book.category}`);
                    this.nlpManager.addDocument('zh', `${book.category}类`, `category_${book.category}`);
                    this.nlpManager.addDocument('zh', `看${book.category}`, `category_${book.category}`);
                }

                // 提取关键词训练
                const keywords = this.extractKeywords(book.content.substring(0, 1000));
                keywords.slice(0, 5).forEach(keyword => {
                    this.nlpManager.addDocument('zh', keyword, `book_${book.id}`);
                });

                // 添加响应
                this.nlpManager.addAnswer('zh', `book_${book.id}`, `${book.title}`);
            }

            await this.nlpManager.train();
            await this.saveModel();

            console.log(`✅ NLP模型训练完成！共训练 ${books.length} 本书`);
        } catch (error) {
            console.error('❌ 训练失败:', error);
            throw error;
        } finally {
            this.isTraining = false;
        }
    }

    // 提取关键词
    private extractKeywords(text: string): string[] {
        const keywords: Set<string> = new Set();

        // 提取2-4字的中文词组
        const chineseWords = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];

        // 简单的词频统计
        const wordFreq = new Map<string, number>();
        chineseWords.forEach(word => {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        });

        // 选择高频词
        const sorted = Array.from(wordFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20);

        sorted.forEach(([word]) => keywords.add(word));

        return Array.from(keywords);
    }

    // 获取所有图书
    async getAllBooks(): Promise<Book[]> {
        const books: Book[] = [];
        const iter = this.kv.list<Book>({ prefix: ["books"] });

        for await (const entry of iter) {
            books.push(entry.value);
        }

        return books;
    }

    // 搜索图书
    async search(query: string): Promise<SearchResult> {
        const results: Book[] = [];
        let confidence = 0;

        // NLP搜索
        const response = await this.nlpManager.process('zh', query);

        if (response.intent && response.intent !== 'None') {
            confidence = response.score || 0;

            if (response.intent.startsWith('book_')) {
                const bookId = response.intent.replace('book_', '');
                const book = await this.getBook(bookId);
                if (book) {
                    results.push(book);
                    await this.updateAccessCount(bookId);
                }
            } else if (response.intent.startsWith('author_')) {
                const author = response.intent.replace('author_', '');
                const books = await this.getBooksByAuthor(author);
                results.push(...books);
            } else if (response.intent.startsWith('category_')) {
                const category = response.intent.replace('category_', '');
                const books = await this.getBooksByCategory(category);
                results.push(...books);
            }
        }

        // 如果NLP没找到，进行模糊搜索
        if (results.length === 0) {
            const books = await this.fuzzySearch(query);
            results.push(...books);
            confidence = 0.5;
        }

        return {
            books: results,
            query,
            confidence,
            totalResults: results.length
        };
    }

    // 模糊搜索
    private async fuzzySearch(query: string): Promise<Book[]> {
        const results: Book[] = [];
        const lowerQuery = query.toLowerCase();
        const books = await this.getAllBooks();

        for (const book of books) {
            const score = this.calculateMatchScore(book, lowerQuery);
            if (score > 0) {
                results.push(book);
            }
        }

        // 按匹配度排序
        results.sort((a, b) => {
            const scoreA = this.calculateMatchScore(a, lowerQuery);
            const scoreB = this.calculateMatchScore(b, lowerQuery);
            return scoreB - scoreA;
        });

        return results.slice(0, 20);
    }

    // 计算匹配分数
    private calculateMatchScore(book: Book, query: string): number {
        let score = 0;

        if (book.title.toLowerCase().includes(query)) score += 10;
        if (book.author?.toLowerCase().includes(query)) score += 8;
        if (book.category?.toLowerCase().includes(query)) score += 5;
        if (book.content.substring(0, 1000).toLowerCase().includes(query)) score += 2;

        return score;
    }

    // 获取单本书
    async getBook(id: string): Promise<Book | null> {
        const result = await this.kv.get<Book>(["books", id]);
        return result.value;
    }

    // 按作者获取图书
    async getBooksByAuthor(author: string): Promise<Book[]> {
        const books: Book[] = [];
        const iter = this.kv.list<string>({
            prefix: ["index", "author", author.toLowerCase()]
        });

        for await (const entry of iter) {
            const book = await this.getBook(entry.value);
            if (book) books.push(book);
        }

        return books;
    }

    // 按分类获取图书
    async getBooksByCategory(category: string): Promise<Book[]> {
        const books: Book[] = [];
        const iter = this.kv.list<string>({
            prefix: ["index", "category", category]
        });

        for await (const entry of iter) {
            const book = await this.getBook(entry.value);
            if (book) books.push(book);
        }

        return books;
    }

    // 更新访问计数
    private async updateAccessCount(bookId: string) {
        const book = await this.getBook(bookId);
        if (book) {
            book.lastAccessed = new Date();
            book.accessCount = (book.accessCount || 0) + 1;
            await this.kv.set(["books", bookId], book);
        }
    }

    // 更新图书信息
    async updateBook(id: string, updates: Partial<Book>): Promise<Book | null> {
        const book = await this.getBook(id);
        if (!book) return null;

        const updated = { ...book, ...updates };
        await this.kv.set(["books", id], updated);

        // 更新索引
        await this.updateIndices([updated]);

        return updated;
    }

    // 删除图书
    async deleteBook(id: string): Promise<boolean> {
        const book = await this.getBook(id);
        if (!book) return false;

        const atomic = this.kv.atomic();

        // 删除主记录
        atomic.delete(["books", id]);

        // 删除索引
        atomic.delete(["index", "title", book.title.toLowerCase(), id]);
        if (book.author) {
            atomic.delete(["index", "author", book.author.toLowerCase(), id]);
        }
        if (book.category) {
            atomic.delete(["index", "category", book.category, id]);
        }

        await atomic.commit();
        return true;
    }

    // 获取统计信息
    async getStatistics() {
        const books = await this.getAllBooks();
        const stats = {
            totalBooks: books.length,
            totalSize: 0,
            categories: new Map<string, number>(),
            authors: new Map<string, number>(),
            avgFileSize: 0,
            mostAccessed: [] as Book[]
        };

        for (const book of books) {
            stats.totalSize += book.fileSize;

            if (book.category) {
                stats.categories.set(
                    book.category,
                    (stats.categories.get(book.category) || 0) + 1
                );
            }

            if (book.author) {
                stats.authors.set(
                    book.author,
                    (stats.authors.get(book.author) || 0) + 1
                );
            }
        }

        stats.avgFileSize = stats.totalBooks > 0 ?
            stats.totalSize / stats.totalBooks : 0;

        // 获取访问最多的书
        stats.mostAccessed = books
            .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
            .slice(0, 10);

        return stats;
    }

    // 保存NLP模型
    private async saveModel() {
        const modelData = this.nlpManager.export();
        Deno.writeTextFileSync(join(dirname(this.kvPath), "nlp.json"), JSON.stringify(modelData));
    }

    // 加载NLP模型
    private async loadModel() {
        const fpath = join(dirname(this.kvPath), "nlp.json");
        if(!existsSync(fpath)) return;
        const result = await JSON.parse(Deno.readTextFileSync(fpath));
        if (result.value) {
            this.nlpManager.import(result.value);
            console.log('📦 已加载NLP模型');
        }
    }

    // 关闭数据库连接
    close() {
        this.kv.close();
    }
}

// HTTP API 处理函数
export async function handleSearch(url: URL, request: Request): Promise<Response> {
    const library = new BookManagementSystem();
    await library.init();

    try {
        const pathname = url.pathname;
        const method = request.method;

        // CORS headers
        const headers = new Headers({
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        });

        // Handle OPTIONS
        if (method === "OPTIONS") {
            return new Response(null, { status: 204, headers });
        }

        // API Routes

        // GET /api/search?q=query
        if (pathname === "/api/search" && method === "GET") {
            const query = url.searchParams.get("q");
            if (!query) {
                return new Response(
                    JSON.stringify({ error: "Missing query parameter" }),
                    { status: 400, headers }
                );
            }

            const results = await library.search(query);
            return new Response(JSON.stringify(results), { headers });
        }

        // GET /api/books
        if (pathname === "/api/books" && method === "GET") {
            const books = await library.getAllBooks();
            return new Response(JSON.stringify({ books, total: books.length }), { headers });
        }

        // GET /api/books/:id
        if (pathname.startsWith("/api/books/") && method === "GET") {
            const id = pathname.split("/").pop();
            if (!id) {
                return new Response(
                    JSON.stringify({ error: "Invalid book ID" }),
                    { status: 400, headers }
                );
            }

            const book = await library.getBook(id);
            if (!book) {
                return new Response(
                    JSON.stringify({ error: "Book not found" }),
                    { status: 404, headers }
                );
            }

            return new Response(JSON.stringify(book), { headers });
        }

        // POST /api/books/import
        if (pathname === "/api/books/import" && method === "POST") {
            const body = await request.json();
            const { path } = body;

            if (!path) {
                return new Response(
                    JSON.stringify({ error: "Missing path parameter" }),
                    { status: 400, headers }
                );
            }

            const imported = await library.batchImport(path);
            return new Response(
                JSON.stringify({ success: true, imported }),
                { headers }
            );
        }

        // POST /api/train
        if (pathname === "/api/train" && method === "POST") {
            await library.train();
            return new Response(
                JSON.stringify({ success: true, message: "Training completed" }),
                { headers }
            );
        }

        // PUT /api/books/:id
        if (pathname.startsWith("/api/books/") && method === "PUT") {
            const id = pathname.split("/").pop();
            if (!id) {
                return new Response(
                    JSON.stringify({ error: "Invalid book ID" }),
                    { status: 400, headers }
                );
            }

            const updates = await request.json();
            const book = await library.updateBook(id, updates);

            if (!book) {
                return new Response(
                    JSON.stringify({ error: "Book not found" }),
                    { status: 404, headers }
                );
            }

            return new Response(JSON.stringify(book), { headers });
        }

        // DELETE /api/books/:id
        if (pathname.startsWith("/api/books/") && method === "DELETE") {
            const id = pathname.split("/").pop();
            if (!id) {
                return new Response(
                    JSON.stringify({ error: "Invalid book ID" }),
                    { status: 400, headers }
                );
            }

            const deleted = await library.deleteBook(id);
            if (!deleted) {
                return new Response(
                    JSON.stringify({ error: "Book not found" }),
                    { status: 404, headers }
                );
            }

            return new Response(
                JSON.stringify({ success: true }),
                { headers }
            );
        }

        // GET /api/stats
        if (pathname === "/api/stats" && method === "GET") {
            const stats = await library.getStatistics();
            return new Response(
                JSON.stringify({
                    ...stats,
                    categories: Array.from(stats.categories.entries()),
                    authors: Array.from(stats.authors.entries())
                }),
                { headers }
            );
        }

        // 404 for unknown routes
        return new Response(
            JSON.stringify({ error: "Not found" }),
            { status: 404, headers }
        );

    } finally {
        library.close();
    }
}

// 主函数 - 交互式命令行界面
async function main() {
    const library = new BookManagementSystem();
    await library.init();

    console.log("\n📚 欢迎使用图书管理系统");
    console.log("=".repeat(50));

    const showMenu = () => {
        console.log("\n请选择操作:");
        console.log("1. 🔍 搜索图书");
        console.log("2. 📂 批量导入");
        console.log("3. 📝 添加单本");
        console.log("4. 🧠 训练模型");
        console.log("5. 📊 查看统计");
        console.log("6. 📋 列出所有图书");
        console.log("7. ✏️  更新图书信息");
        console.log("8. 🗑️  删除图书");
        console.log("9. 🌐 启动API服务器");
        console.log("0. 退出");
        console.log("-".repeat(50));
    };

    while (true) {
        showMenu();
        const choice = prompt("请输入选项 (0-9):");

        switch (choice) {
            case "1": {
                // 搜索
                const query = prompt("请输入搜索关键词:");
                if (query) {
                    console.log("\n搜索中...");
                    const results = await library.search(query);

                    if (results.books.length === 0) {
                        console.log("❌ 没有找到相关图书");
                    } else {
                        console.log(`\n✅ 找到 ${results.totalResults} 本相关图书:`);
                        console.log(`置信度: ${(results.confidence! * 100).toFixed(1)}%\n`);

                        results.books.slice(0, 10).forEach((book, i) => {
                            console.log(`${i + 1}. 《${book.title}》`);
                            if (book.author) console.log(`   作者: ${book.author}`);
                            if (book.category) console.log(`   分类: ${book.category}`);
                            console.log(`   大小: ${(book.fileSize / 1024 / 1024).toFixed(2)} MB`);
                            if (book.accessCount) console.log(`   访问: ${book.accessCount} 次`);
                            console.log();
                        });
                    }
                }
                break;
            }

            case "2": {
                // 批量导入
                const path = prompt("请输入图书文件夹路径:");
                if (path) {
                    try {
                        const count = await library.batchImport(path);
                        console.log(`\n✅ 成功导入 ${count} 本图书`);
                    } catch (e) {
                        console.error(`\n❌ 导入失败: ${e}`);
                    }
                }
                break;
            }

            case "3": {
                // 添加单本
                const filePath = prompt("请输入图书文件路径:");
                if (filePath) {
                    try {
                        const book = await library.importBook(filePath);
                        console.log(`\n✅ 成功添加: 《${book.title}》`);
                    } catch (e) {
                        console.error(`\n❌ 添加失败: ${e}`);
                    }
                }
                break;
            }

            case "4": {
                // 训练模型
                console.log("\n开始训练...");
                await library.train();
                break;
            }

            case "5": {
                // 查看统计
                const stats = await library.getStatistics();
                console.log("\n📊 图书馆统计信息:");
                console.log(`总藏书: ${stats.totalBooks} 本`);
                console.log(`总大小: ${(stats.totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
                console.log(`平均大小: ${(stats.avgFileSize / 1024 / 1024).toFixed(2)} MB`);

                if (stats.categories.size > 0) {
                    console.log("\n分类统计:");
                    stats.categories.forEach((count, category) => {
                        console.log(`  ${category}: ${count} 本`);
                    });
                }

                if (stats.authors.size > 0) {
                    console.log("\n作者统计 (前10):");
                    Array.from(stats.authors.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10)
                        .forEach(([author, count]) => {
                            console.log(`  ${author}: ${count} 本`);
                        });
                }

                if (stats.mostAccessed.length > 0) {
                    console.log("\n最受欢迎 (前5):");
                    stats.mostAccessed.slice(0, 5).forEach((book, i) => {
                        console.log(`  ${i + 1}. 《${book.title}》 - ${book.accessCount} 次访问`);
                    });
                }
                break;
            }

            case "6": {
                // 列出所有图书
                const books = await library.getAllBooks();
                console.log(`\n📚 共有 ${books.length} 本图书:\n`);

                const pageSize = 20;
                let start = 0;
                let input: string | null;

                while (start < books.length) {
                    const page = books.slice(start, start + pageSize);
                    console.log(`\n=== 第 ${Math.ceil(start / pageSize) + 1} 页 ===`);
                    page.forEach((book, i) => {
                        console.log(`${start + i + 1}. 《${book.title}》`);
                        if (book.author) console.log(`   作者: ${book.author}`);
                        if (book.category) console.log(`   分类: ${book.category}`);
                    });

                    // 分页控制
                    if (start + pageSize < books.length) {
                        input = prompt("输入 n 查看下一页，其他键返回菜单:");
                        if (input?.toLowerCase() !== 'n') break;
                    }
                    start += pageSize;
                }
                break;
            }

            case "7": {
                // ✏️ 更新图书信息
                const id = prompt("请输入要更新的图书ID:");
                if (id) {
                    try {
                        const updates = await (async () => {
                            console.log("\n请输入新信息（直接回车保留原值）:");
                            return {
                                title: prompt("新书名:") || undefined,
                                author: prompt("新作者:") || undefined,
                                category: prompt("新分类:") || undefined
                            };
                        })();

                        const updated = await library.updateBook(id, updates);
                        if (updated) {
                            console.log(`✅ 成功更新：《${updated.title}》`);
                        } else {
                            console.log("❌ 图书更新失败");
                        }
                    } catch (e) {
                        console.error(`更新失败: ${e}`);
                    }
                }
                break;
            }

            case "8": {
                // 🗑️ 删除图书
                const id = prompt("请输入要删除的图书ID:");
                if (id) {
                    const confirm = prompt("确认删除？(y/n)")?.toLowerCase();
                    if (confirm === 'y') {
                        const success = await library.deleteBook(id);
                        console.log(success ? "✅ 删除成功" : "❌ 删除失败");
                    }
                }
                break;
            }

            case "9": {
                // 🌐 启动API服务器
                const port = 8080;
                console.log(`\n🚀 启动API服务器：http://localhost:${port}`);
                Deno.serve({ port }, async (req: Request) => {
                    const url = new URL(req.url);
                    return handleSearch(url, req);
                });
                break;
            }

            case "0": {
                // 退出
                const confirm = prompt("确认退出？(y/n)")?.toLowerCase();
                if (confirm === 'y') {
                    library.close();
                    console.log("\n👋 感谢使用，再见！");
                    Deno.exit(0);
                }
                break;
            }

            default: {
                console.log("⚠️ 无效选项，请重新输入");
                break;
            }
        } // switch结束
    } // while循环结束
}

if(import.meta.main) main()