export default {
    title: '#content_read > div > div.bookname > h1',
    content: '#content',
    next_link: '#content_read > div > div.bottem2 > a:nth-child(3)',

    mainPageTitle: '#info > h1',
    mainPageSummary: '#intro',
    mainPageFirstChapter: '#maininfo > div.readbtn > a:nth-child(1)',
    mainPageCover: '#fmimg > img',
    // https://www.beqege.cc/80/
    mainPageLike: /\.beqege\.cc\/(\d+)\/?$/i
} satisfies TraditionalConfig;