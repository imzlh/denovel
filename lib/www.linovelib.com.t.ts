import { getDocument } from "../main.ts";

export default {
    "title": "#mlfy_main_text > h1",
    next_link: '#readbg > div.mlfy_page > a:nth-child(5)',
    content: '#TextContent',

    mainPageCover: 'body > div.wrap > div.book-html-box.clearfix > div:nth-child(1) > div.book-detail.clearfix > div.book-img.fl > img',
    mainPageAuthor: 'body > div.wrap > div.book-html-box.clearfix > div:nth-child(1) > div.book-detail.clearfix > div.book-info > div.book-label > a:nth-child(2)',
    mainPageFirstChapter: 'body > div.wrap > div.book-html-box.clearfix > div:nth-child(1) > div.book-detail.clearfix > div.book-info > div.btn-group > a.btn.read-btn',
    mainPageSummary: 'body > div.wrap > div.book-html-box.clearfix > div:nth-child(1) > div.book-detail.clearfix > div.book-info > div.book-dec.Jbook-dec > p',
    // https://www.linovelib.com/novel/3005.html
    mainPageLike: /\.linovelib\.com\/novel\/(\d+)\.html/,
    mainPageTitle: 'body > div.wrap > div.book-html-box.clearfix > div:nth-child(1) > div.book-detail.clearfix > div.book-info > h1',

    async infoFilter(url, info) {
        const docIndex = await getDocument(info.firstPage);
        const link = docIndex.querySelector('#volume-list > div > ul > li:nth-child(1) > a')?.getAttribute('href');
        if (link) {
            info.firstPage = new URL(link, info.firstPage);
        }
    },
} satisfies TraditionalConfig;