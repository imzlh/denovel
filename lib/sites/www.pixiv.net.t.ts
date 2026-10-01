import { getDocument, sleep } from "../core/mod.ts";

let count = 0;

export default {
    title: 'body > main > section.chapter > h1',
    content: 'body > main > section.chapter > div.content',
    next_link: 'body > main > section:nth-child(2) > div > a:nth-child(3)',

    // https://www.pixiv.net/novel/series/13809349
    mainPageLike: /www\.pixiv\.net\/novel\/series\/\d+\/?$/,
    mainPageTitle: 'title',
    mainPageCover: '#__next img',
    // pixiv没有小说描述
    mainPageFirstChapter: '#__next a[data-gtm-value]',

    async request() {
        await sleep(2); // pixiv有非常严格的时间限制
        if((count += Math.floor(Math.random() * 16)) > 100){
            count = 0;
            console.log('[ INFO ] 延迟5s，避免pixiv封号...');
            await sleep(5);
        }
        return getDocument.apply(null, arguments as any);
    },
    async mainPageFilter(url, document, filled_data) {
        filled_data.book_name = document.title;
    },
} satisfies TraditionalConfig;
