import { processContent } from "../main.ts";

export default {
    "title": "body > div.main > div > div.read > div.title > h1",
    next_link: '#next',
    content: 'body > div.main > div > div.read > div.content',

    mainPageCover: 'div.main > div.book > div.image > img',
    mainPageAuthor: 'div.main > div.book > div.detail > div.name > span',
    mainPageFirstChapter: 'div.main > div.book > div.detail > div.op > button.read',
    mainPageSummary: 'div.main > div.bookinfo > div.desc.panel > div.description',
    // https://www.1qxs.com/xs/24395.html
    mainPageLike: /\/[a-z]+\/\d+(\.html)?\/?$/,
    mainPageTitle: 'div.main > div.book > div.detail > div.name > h1',
    mainPageFilter(page, document, filled_data) {
        const clonedURL = new URL(page);
        clonedURL.pathname = clonedURL.pathname.replace('.html', '/1.html');
        filled_data.firstPage = clonedURL;
        console.log('Redirecting to', clonedURL.href);

        // cover
        const cov = document.querySelector(this.mainPageCover!);
        if (cov) {
            filled_data.cover = new URL(cov.getAttribute('data-original')!, page).href;
        }
    },
    filter(document, filled_data) {
        const elContent = document.querySelector(this.content!);
        if (elContent) {
            if(elContent.lastElementChild?.innerText.includes('本章未完'))
                elContent.lastElementChild.remove();
            filled_data.content = processContent(elContent);
        }
    },
} satisfies TraditionalConfig;