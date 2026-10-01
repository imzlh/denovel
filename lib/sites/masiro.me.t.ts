import { getDocument } from "../core/mod.ts";

export default {
    title: '#article > div.article-hd > h1',
    content: '#ChapterBody',
    next_link: '#article > div.fn-btn > a:nth-child(2)',

    // https://book.sfacg.com/Novel/531521/
    mainPageLike: /https:\/\/book\.sfacg\.com\/Novel\/\d+\/?$/,
    mainPageTitle: 'body > div.container > div:nth-child(5) > div > div.main-part.fl.previous-chapter > div.crumbs.clearfix > a:last-child',
    mainPageCover: 'body > div.container > div.d-normal-banner > div > div > div.summary-pic > img',
    mainPageSummary: 'body > div.container > div.d-normal-banner > div > div > div.summary-content > p',
    mainPageFirstChapter: '#BasicOperation > a:nth-child(1)',

    async request(url, ...d){
        // 拦截https://book.sfacg.com/Novel/531521/MainIndex/类
        if(String(url).includes('/MainIndex')){
            const page = await getDocument(url);
            const el1 = page.querySelector('body > div.container > div.wrap.s-list > div.story-catalog a');
            const realurl = el1?.getAttribute('href');
            if(!realurl) throw new Error('获取第一章链接失败');
            url = new URL(realurl, url);
        }

        return await getDocument(url, ...d);
    }
} satisfies TraditionalConfig;
