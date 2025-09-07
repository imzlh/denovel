import { fetch2 } from "../main.ts";

export default {
    title: 'body > ul.menu_top_list.book_view_top > li:nth-child(2)',
    content: 'body > div.yuedu.Content_Frame > div:nth-child(1)',
    next_link: 'body > div.yuedu.Content_Frame > div.yuedu_menu > a:nth-child(3)',

    mainPageAuthor: '#page > div > ul > li:nth-child(1) > span.book_info3',
    mainPageTitle: '#page > div > ul > li:nth-child(1) > span.book_newtitle',
    mainPageFirstChapter: '#page > div > div > a:nth-child(1)',
    mainPageSummary: '#page > div:nth-child(2) > ul > li.book_bk_qs1',
    mainPageCover: '#page > div > ul > li:nth-child(2) > img',
    // https://m.sfacg.com/b/747094/
    mainPageLike: /https?\:\/\/m\.sfacg\.com\/b\/\d+\/?/,

    mainPageFilter(url, document, filled_data) {
        filled_data.author = filled_data.author?.split('/').at(0)?.trim();
    },
} satisfies TraditionalConfig;

// @ts-ignore u should never be RequestInfo here
export const networkHandler: typeof fetch = (u, i) => fetch2(u, {
    ...i,
    referrer: undefined // remove referrer to avoid 500
});