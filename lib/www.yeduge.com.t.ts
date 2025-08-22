import { getDocument } from "../main.ts";

export default {
    title: 'body > main > section.chapter > h1',
    content: 'body > main > section.chapter > div.content',
    next_link: 'body > main > section:nth-child(2) > div > a:nth-child(3)',

    // https://www.yeduge.com/book/92001/
    mainPageLike: /yeduge\.com\/book\/\d+\/?$/,
    mainPageTitle: 'body > main > section.novel > div.detail > div.info > h1',
    mainPageCover: 'body > main > section.novel > div.detail > div.cover > img',
    mainPageSummary: 'body > main > section.novel > div.desc',
    mainPageFirstChapter: 'body > main > section.novel > div.detail > div.info > div > a:nth-child(1)',
    mainPageAuthor: 'body > main > section.novel > div.detail > div.info > p:nth-child(2)'
} satisfies TraditionalConfig;