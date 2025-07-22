import { getDocument, processContent, sleep } from "../main.ts";

console.log('请务必使用"--parted -p"标志！本程序无法自动分离标题！');

const CTX_SELECTOR = '.d_post_content';
const MIN_CHARS = 200;
const NEXT_PAGE = '#thread_theme_7 > div.l_thread_info > ul > li.l_pager.pb_list_pager > a';
const NEXT_PAGE_NAME = '下一页';

async function getChaps(url: string){
    const doc = await getDocument(url);
    const res = { c: [] as Array<string>, next: '' }
    for(const el of doc.querySelectorAll(CTX_SELECTOR)){
        const txt = processContent(el);
        if(txt.length >= MIN_CHARS){
            res.c.push(txt);
        }
    }
    const el = Array.from(doc.querySelectorAll(NEXT_PAGE)).at(-2);
    if(el?.innerText == NEXT_PAGE_NAME){
        const href = el.getAttribute('href');
        res.next = href ? new URL(href, url).href : '';
    }
    return res;
}

export default (async function* (urlStart: URL | string) {
    let contents: string[] = [];
    let nextUrl = urlStart.toString();

    while (true) {
        // 加载新内容
        if (contents.length === 0) {
            if (!nextUrl) break; // 终止条件
            
            const result = await getChaps(nextUrl);
            contents = result.c;
            nextUrl = result.next;
            
            if (contents.length === 0) {
                throw new Error('Failed to load chapter content');
            }
        }

        // 逐条产出内容
        while (contents.length > 0) {
            const data = contents.shift()!;
            await sleep(1); // 保持原有延迟
            
            yield {
                content: data,
                title: '',       // 保持与原逻辑兼容
            };
        }
    }
} satisfies Callback);
