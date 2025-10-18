export default {
    title: '#container > div > div > div.reader-main > h1',
    content: '#content',
    next_link: '#next_url',

    mainPageSummary: 'body > div.container > div.row.row-detail > div > div > div.m-desc.xs-show',
    mainPageFirstChapter: 'body > div.container > div.row.row-detail > div > div > div.info > div.top > div > p.opt > a.xs-show.btn-read',
    mainPageTitle: 'body > div.container > div.row.row-detail > div > div > div.info > div.top > h1',
    mainPageCover: 'body > div.container > div.row.row-detail > div > div > div.imgbox > img',
    // https://www.qushucheng.com/book_95134953/
    mainPageLike: /https:\/\/www\.qushucheng\.com\/book_(\d+)/
} satisfies TraditionalConfig;