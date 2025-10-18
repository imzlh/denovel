import { processContent } from "../main.ts";

export default {
    title: '#chapter > h1',
    content: '#chapter > div.content',
    next_link: '#chapter > div.pager.z1 > a:nth-child(3)',

    mainPageTitle: '#read > div.main > div.detail > p.name',
    mainPageFirstChapter: '#read > div.main > ul.read > li:nth-child(1) > a',
    mainPageCover: '#read > div.main > div.detail > img',
    // https://m.baolaixsw.org/1692/
    mainPageLike: /\.baolaixsw\.org\/\d+\/?$/i,

    filter(document, filled_data) {
        // remove all ads
        const el = document.querySelector(this.content);
        el?.querySelectorAll('a').forEach(el => el.remove());
        filled_data.content = processContent(el);
    },
} satisfies TraditionalConfig;