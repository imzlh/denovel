import { processContent, getDocument } from "../main.ts";

export default {
    title: '#neirong > h1',
    content: '#txt',
    next_link: '#fanye > ul > li:nth-child(4) > a',

    mainPageTitle: 'body > div.menu > div.right > div:nth-child(1) > h1',
    mainPageFirstChapter: 'body > div.menu > div.right > div:nth-child(1) > div > div.gongneng > span:nth-child(1) > a',
    mainPageAuthor: 'body > div.menu > div.right > div:nth-child(1) > div > div.xinxi > span:nth-child(1) > a',
    mainPageSummary: 'body > div.menu > div.right > div:nth-child(1) > div > div.xinxi > div',
    mainPageCover: 'body > div.menu > div.right > div:nth-child(1) > div > div.zhutu > img',
    // https://www.biquge543.com/newbook/9803/
    mainPageLike: /\.biquge543\.com\/newbook\/\d+\/?$/i,

    filter(document, filled_data) {
        // remove all ads
        const el = document.querySelector(this.content);
        el?.querySelectorAll('p').forEach(el => el.remove());
        filled_data.content = processContent(el);
    },
} satisfies TraditionalConfig;