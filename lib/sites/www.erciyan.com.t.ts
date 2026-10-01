export default {
    "title": "#container > div > div > div.reader-main > h1",
    next_link: '#next_url',
    content: '#content',

    mainPageCover: 'body > div.container > div.row.row-detail > div > div > div.imgbox > img',
    mainPageAuthor: 'body > div.container > div.row.row-detail > div > div > div.info > div.top > div > p:nth-child(1) > a',
    mainPageFirstChapter: 'body > div.container > div.row.row-detail > div > div > div.info > div.top > div > p.opt > a.xs-show.btn-read',
    mainPageSummary: 'body > div.container > div.row.row-detail > div > div > div.m-desc.xs-show',
    // https://www.erciyan.com/xiaoshuo/94729460/
    mainPageLike: /\.erciyan\.com\/(?:xiaoshuo|book)\/\d+\/?$/,
    mainPageTitle: 'body > div.container > div.row.row-detail > div > div > div.info > div.top > h1'
} satisfies TraditionalConfig;