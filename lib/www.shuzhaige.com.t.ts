import { processContent } from "../main.ts";

export default {
    title: 'body > div > div > div.m-title.col-md-12 > h1',
    content: '#content',
    next_link: '#content > div.m-zpage > ul > li.col-md-4.col-xs-12.col-sm-12 > a',

    mainPageTitle: 'body > div > div.row > div.col-xs-12.col-sm-12.col-md-9.col-lg-9 > div.m-book_info > div.m-infos > h1',
    mainPageSummary: 'body > div > div.row > div.col-xs-12.col-sm-12.col-md-9.col-lg-9 > div.m-book_info > p',
    mainPageFirstChapter: 'body > div > div.row > div.col-xs-12.col-sm-12.col-md-9.col-lg-9 > div.m-book_info > div.m-read > a.m-startedbtn',
    mainPageCover: 'body > div > div.row > div.col-xs-12.col-sm-12.col-md-9.col-lg-9 > div.m-book_info > div.cover-block > div > a > img',
    // https://www.shuzhaige.com/longzu4aodingzhiyuan/
    mainPageLike: /\.shuzhaige\.com\/(\w+)\/?$/i,

    filter(document, filled_data) {
        // remove all ads
        const el = document.querySelector(this.content);
        el?.querySelectorAll('.m-zpage').forEach(el => el.remove());
        if(el?.lastElementChild?.innerText.includes('shuzhaige.com'))
            el.lastElementChild.remove();
        filled_data.content = processContent(el);
    },
} satisfies TraditionalConfig;