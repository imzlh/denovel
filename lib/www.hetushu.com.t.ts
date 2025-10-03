import { processContent } from "../main.ts";

export default {
    next_link: '#next',
    content: '#content',
    title: '#content > h2:last-child',

    filter(document, filled_data) {
        const el = document.querySelector(this.content);
        const titles = el?.querySelectorAll('h1, h2');
        if(!titles || !el) return; 
        const title = Array.from(titles).reduce((a, c) => a + c.innerHTML.trim(), '');
        const content = processContent(el, {}, filled_data.url);
        filled_data.title = title;
        filled_data.content = content;
    },

    // https://www.hetushu.com/book/9546/(index.html)
    mainPageLike: /^https:\/\/www\.hetushu\.com\/book\/\d+\/(index\.html)?$/,
    mainPageCover: '#left > div.book_info.finish > img',
    mainPageTitle: '#left > div.book_info.finish > h2',
    mainPageSummary: '#left > div.book_info.finish > div.intro',
    mainPageAuthor: '#left > div.book_info.finish > div:nth-child(3)',

    mainPageFirstChapter: '#left > div.book_info.finish > div.nav > a',

    mainPageFilter(url, document, filled_data) {
        filled_data.author = filled_data.author?.split('：').at(-1)?.trim();
    },
} satisfies TraditionalConfig;