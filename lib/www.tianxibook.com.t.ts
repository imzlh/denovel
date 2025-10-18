export default {
    title: '#wrapper > article > h1',
    content: '#booktxt',
    next_link: '#wrapper > article > div.bottem1 > a:nth-child(3)',

    mainPageTitle: '#info > h1',
    mainPageSummary: '#intro',
    mainPageFirstChapter: '#maininfo > div.readbtn > a:nth-child(1)',
    mainPageCover: '#fmimg > img',
    // https://www.tianxibook.com/books/36570684/
    mainPageLike: /\/books?\/\d+\/?$/i
} satisfies TraditionalConfig;