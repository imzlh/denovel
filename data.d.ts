interface MainInfo {
    // 自动从信息页获取数据
    mainPageLike: RegExp;
    mainPageFirstChapter: string;
    mainPageTitle: string;
    mainPageCover: string;
    mainPageSummary?: string;
}

interface TraditionalConfig extends Partial<MainInfo> {
    title: string;
    content: string;
    next_link: string,
    filter?: (document: import("jsr:@b-fuze/deno-dom").HTMLDocument, filled_data: Data & { url: URL }) => void;

    jpStyle?: boolean;
}

type PromiseOrNot<T> = Promise<T> | T;

interface Data{
    title: string,
    content: string,
    next_link: string | URL
}

type Callback = () => PromiseOrNot<(url: string | URL) => PromiseOrNot<Data | null>>