declare interface MainInfo {
    // 自动从信息页获取数据
    mainPageLike: RegExp;
    mainPageFirstChapter: string;
    mainPageTitle: string;
    mainPageCover: string;
    mainPageSummary?: string;
    mainPageAuthor?: string;
    jpStyle?: boolean;

    mainPageFilter?: (url: URL, document: import("jsr:@b-fuze/deno-dom").Document, filled_data: MainInfoResult) => PromiseOrNot<void>;
}

declare interface MainInfoResult {
    firstPage: URL;
    cover?: string;
    book_name?: string;
    summary?: string;
    author?: string;
    
    jpStyle?: boolean;
}

declare interface ComicMainInfo{
    title: string;
    cover?: string;
    firstPage: string | URL;
    tags?: string[];
    summary?: string;
    author?: string;
}

declare interface TraditionalConfig extends Partial<MainInfo> {
    title: string;
    content: string;
    next_link: string,
    infoFilter?: (url: URL, info: MainInfoResult) => PromiseOrNot<void>;
    filter?: (document: import("jsr:@b-fuze/deno-dom").HTMLDocument, filled_data: Data & { url: URL }) => PromiseOrNot<void>;
    request?: typeof import('./main.ts').getDocument;
}

type PromiseOrNot<T> = Promise<T> | T;

declare interface Data{
    title: string,
    content: string,
    next_link: string
}

declare type Callback = (url_start: URL | string) => AsyncGenerator<{
    title: string,
    content: string
}, void, void>;