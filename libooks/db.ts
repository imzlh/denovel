import { Book, SearchFilters } from "./types.d.ts";

export class BookDatabase {
    static async new() {
        const db = new BookDatabase(await Deno.openKv(import.meta.dirname + "/ebooks.db"));
        return db;
    }

    constructor(
        private readonly kv: Deno.Kv,
    ){}

    async saveBook(book: Book): Promise<void> {
        await this.kv.set(["books", book.id], book);

        // 同时维护标签索引
        for (const tag of book.tags) {
            await this.kv.set(["index", "tags", tag, book.id], book.id);
        }

        // 维护作者索引
        await this.kv.set(["index", "authors", book.author, book.id], book.id);
    }

    async getBook(id: string): Promise<Book | null> {
        const result = await this.kv.get<Book>(["books", id]);
        return result.value;
    }

    async searchBooks(filters: SearchFilters): Promise<Book[]> {
        const results: Book[] = [];
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;

        // 使用索引进行高效搜索
        if (filters.tags?.length) {
            const bookIds = new Set<string>();

            for (const tag of filters.tags) {
                for await (const entry of this.kv.list({ prefix: ["index", "tags", tag] })) {
                    bookIds.add(entry.value as string);
                }
            }

            for (const id of bookIds) {
                const book = await this.getBook(id);
                if (book) results.push(book);
            }
        } else {
            // 全量扫描
            for await (const entry of this.kv.list<Book>({ prefix: ["books"] })) {
                results.push(entry.value);
            }
        }

        // 应用过滤器
        return results
            .filter(book => this.filterBook(book, filters))
            .slice(offset, offset + limit);
    }

    private filterBook(book: Book, filters: SearchFilters): boolean {
        if (filters.author && !book.author.includes(filters.author)) return false;
        if (filters.title && !book.title.includes(filters.title)) return false;
        if (filters.minConfidence && book.tags.some(tag => (book.confidence[tag] || 0) < filters.minConfidence!)) return false;

        if (filters.query) {
            const searchText = `${book.title} ${book.author} ${book.description} ${book.tags.join(" ")}`.toLowerCase();
            if (!searchText.includes(filters.query.toLowerCase())) return false;
        }

        return true;
    }

    async getStats() {
        const stats = {
            totalBooks: 0,
            tagCounts: {} as Record<string, number>,
            authorCounts: {} as Record<string, number>
        };

        for await (const entry of this.kv.list<Book>({ prefix: ["books"] })) {
            stats.totalBooks++;
            entry.value.tags.forEach(tag => {
                stats.tagCounts[tag] = (stats.tagCounts[tag] || 0) + 1;
            });
            stats.authorCounts[entry.value.author] = (stats.authorCounts[entry.value.author] || 0) + 1;
        }

        return stats;
    }
}