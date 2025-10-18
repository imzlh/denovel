import { defaultGetInfo } from "../main.ts";

export * from './www.ciweimao.com.n.ts';
export { default } from './www.ciweimao.com.n.ts';

export const getInfo = (enter: URL) => defaultGetInfo(enter, {
    mainPageTitle: 'body > div.container.book-detail > div.detail-wrap > div.book-info.clearfix > div.info > h1',
    mainPageFirstChapter: 'body > div.container.book-detail > div.detail-wrap > div.operate-btn > a.read-now',
    mainPageSummary: 'body > div.container.book-detail > div.detail-wrap > div.book-desc > div > p',
    mainPageCover: 'body > div.container.book-detail > div.detail-wrap > div.book-info.clearfix > div.cover > img',
    mainPageAuthor: 'body > div.container.book-detail > div.detail-wrap > div.book-info.clearfix > div.info > p.author',
    // https://www.ciweimao.com/book/100223421
    mainPageLike: /https?:\/\/(?:www|wap)\.ciweimao\.com\/book\/(\d+)/,

    mainPageFilter(url, document, filled_data) {
        // 重定向firstPage
        const bookid = url.pathname.match(/(\d+)\/?$/)?.[0];
        if (bookid) {
            filled_data.firstPage = new URL(`https://www.ciweimao.com/chapter-list/${bookid}/book_detail`);
        }
    }
});