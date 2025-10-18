import { processContent, getDocument } from "../main.ts";

export default {
    title: '#chapter > h1',
    content: '#chapter > div.content',
    next_link: '#chapter > div:nth-child(5) > a:nth-child(3)',

    mainPageTitle: '#read > div.main > div.detail > p.name',
    mainPageFirstChapter: '#info > div.main > ul > li:nth-child(1) > a',
    mainPageSummary: '#info > div.main > div:nth-child(4) > div.intro',
    mainPageCover: '#read > div.main > div.detail > img',
    // https://m.dingdian001.com/xiaoshuo_10599.html
    mainPageLike: /\.dingdian001\.com\/xiaoshuo_(\d+)\.html/i,
    async mainPageFilter(url, document, filled_data) {
        const chapPage = await getDocument(filled_data.firstPage);
        const firstEl = chapPage.querySelector('#read > div.main > ul.read > li:nth-child(1) > a');
        if(firstEl){
            filled_data.firstPage = new URL(firstEl.getAttribute('href')!, filled_data.firstPage);
        }
    },

    filter(document, filled_data) {
        // remove all ads
        const el = document.querySelector(this.content);
        el?.querySelectorAll('a').forEach(el => el.remove());
        if(el?.lastElementChild?.innerText.includes('dingdian001.com'))
            el.lastElementChild.remove();
        filled_data.content = processContent(el);
    },
} satisfies TraditionalConfig;