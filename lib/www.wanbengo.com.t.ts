export default {
    "title": "body > div > div.content > div.main > div.reader > div.readerTitle > h2",
    next_link: 'body > div > div.content > div.main > div.reader > div.readPage > a:nth-child(3)',
    content: 'body > div > div.content > div.main > div.reader > div.readerCon',

    filter(document, filled_data) {
        const ctxs = filled_data.content.split(/[\r\n]+/);
        if(ctxs[0].includes('.com')){
            ctxs.shift();
            filled_data.content = ctxs.join('\n');
        }

        if(filled_data.title?.match(/第[一二三四五六七八九十百千万零]章/)){
            filled_data.title = filled_data.title.split('章', 2)[1].trim();
        }
    },

    // https://www.wanbengo.com/14887/
    mainPageLike: /\/\/www\.w[a-z]+?\.com\/\d+\/$/,
    mainPageCover: 'body > div.contentDiv > div > div.detail > div.detailTop > div.detailTopLeft > img',
    mainPageTitle: 'body > div.contentDiv > div > div.detail > div.detailTop > div.detailTopMid > div.detailTitle',
    mainPageSummary: 'body > div.contentDiv > div > div.detail > div.detailTop > div.detailTopMid > table > tbody > tr:nth-child(3) > td:nth-child(2)',
    mainPageAuthor: 'body > div.contentDiv > div > div.detail > div.detailTop > div.detailTopMid > div.writer > a',

    mainPageFirstChapter: 'body > div.contentDiv > div > div.detail > div.detailBottom > div.detailBottomLeft > div.chapter > ul > li:nth-child(1) > a'
} satisfies TraditionalConfig;