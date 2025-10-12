import { getDocument, launchBrowser, processContent, sleep } from "../main.ts";

console.log('请务必使用"--parted -p"标志！本程序无法自动分离标题！');

const CTX_SELECTOR = '.d_post_content';
const MIN_CHARS = 200;
const NEXT_PAGE = 'div.l_thread_info > ul > li.l_pager > a:nth-last-child(2)';
const NEXT_PAGE_NAME = '下一页';

export default (async function* (_url: URL | string) {
    let curUrl: URL | undefined = new URL(_url);
    while(curUrl){
        const doc = await getDocument(curUrl, {
            ignore_status: true
        });
        if(doc.getElementsByTagName('title')[0].innerText.includes('百度安全验证')){
            console.log('百度安全验证，查水表了!');
            await launchBrowser(curUrl, true);
            continue;
        }
        let text = '';
        for(const el of doc.querySelectorAll(CTX_SELECTOR)){
            const txt = processContent(el, {}, new URL(curUrl));
            if(txt.length >= MIN_CHARS || txt.includes('[img')) text += txt;
        }
        const el = doc.querySelector(NEXT_PAGE);
        let next_link = undefined;
        if(el?.innerText == NEXT_PAGE_NAME){
            const href = el.getAttribute('href');
            next_link = href ? new URL(href, curUrl) : undefined;
        }

        yield {
            title: '',
            content: text,
            next_link
        }
        curUrl = next_link;
    }
} satisfies Callback);
