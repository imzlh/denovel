export default {
    title: 'body > main > div > div.flex.justify-between.items-center.mb-4',
    content: '#chapter-content',
    next_link: '#next',

    mainPageCover: 'body > main > div > section.bg-white.p-4.rounded-lg.shadow.mb-4.flex.items-start > img',
    mainPageTitle: 'body > main > div > section.bg-white.p-4.rounded-lg.shadow.mb-4.flex.items-start > div > h1',
    mainPageFirstChapter: 'body > main > div > section:nth-child(5) > div > a:nth-child(1)',
    mainPageSummary: 'body > main > div > section:nth-child(5) > div > a:nth-child(1)',

    // https://www.feiniaoks.com/book/80675.html
    mainPageLike: /\/\/www\.feiniaoks\.com\/book\/\d+\.html/
} satisfies TraditionalConfig