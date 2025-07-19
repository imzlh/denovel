declare interface MainInfo {
    // 自动从信息页获取数据
    mainPageLike: RegExp;
    mainPageFirstChapter: string;
    mainPageTitle: string;
    mainPageCover: string;
    mainPageSummary?: string;
    jpStyle?: boolean;
}

declare interface TraditionalConfig extends Partial<MainInfo> {
    title: string;
    content: string;
    next_link: string,
    filter?: (document: import("jsr:@b-fuze/deno-dom").HTMLDocument, filled_data: Data & { url: URL }) => void;
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