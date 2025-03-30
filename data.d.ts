interface TraditionalConfig {
    title: string;
    content: string;
    next_link: string,
    filter?: (document: import("jsr:@b-fuze/deno-dom").HTMLDocument, filled_data: Data & { url: URL }) => void;
}

type PromiseOrNot<T> = Promise<T> | T;

interface Data{
    title: string,
    content: string,
    next_link: string | URL
}

type Callback = () => PromiseOrNot<(url: string | URL) => PromiseOrNot<Data | null>>