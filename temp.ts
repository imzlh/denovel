import { DOMParser, Element, HTMLDocument } from "jsr:@b-fuze/deno-dom";

// 包装配置
async function* tWrapper(url: URL, config: TraditionalConfig) {
    let next_url = url;
    while (next_url) {
        let retry = 1;
        let document: HTMLDocument;

        while ((retry ++) <= 3) {
            document = await getDocu
    }
}

async function downloadNovel(
    start_url = '',
    isTraditional: boolean = true,
    report_status: (status: Status, message: string, error?: Error) => void = (status, msg, e) =>
        console.log(`[ ${Status[status]} ] ${msg}`, e?.message),
    book_name: string = args.name!,
    cover?: string,
    sig_abort?: AbortSignal
) {

}