import { getDocument, sleep } from "../main.ts";

console.log('请务必使用"--parted -p"标志！本程序无法自动分离标题！');

const CTX_SELECTOR = '.d_post_content';
const MIN_CHARS = 200;
const NEXT_PAGE = '#thread_theme_7 > div.l_thread_info > ul > li.l_pager.pager_theme_5.pb_list_pager > a';
const NEXT_PAGE_NAME = '下一页';
const INTERNAL_NEXT = 'http://a/__internal_next__';

async function getChaps(url: string){
    const doc = await getDocument(url);
    const res = { c: [] as Array<string>, next: '' }
    for(const el of doc.querySelectorAll(CTX_SELECTOR)){
        const txt = el.innerText.trim();
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

export default (function () {
    let contents: Array<string> = [];
    let nextUrl = '';
    let init = false;

    return async function (url) {
        url = typeof url === 'object' ? url.toString() : url;
        if(!init) nextUrl = url, init = true;
        if(0 == contents.length){
            if(!nextUrl) throw new Error('reached end of chapters!');
            const { c, next } = await getChaps(nextUrl);
            contents = c;
            nextUrl = next;
        }

        const data = contents.shift();
        if(!data){
            throw new Error('No content found!');
        }
        await sleep(1);
        return {
            content: data,
            next_link: INTERNAL_NEXT,
            title: ''
        };
    }
} satisfies Callback);