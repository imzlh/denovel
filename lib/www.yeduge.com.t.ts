import { getDocument } from "../main.ts";

export default {
    title: 'body > main > section.chapter > h1',
    content: 'body > main > section.chapter > div.content',
    next_link: 'body > main > section:nth-child(2) > div > a:nth-child(3)',

    // https://www.yeduge.com/book/92001/
    mainPageLike: /yeduge\.com\/(?:free)?book\/\d+\/?$/,
    mainPageTitle: 'body > main > section.novel > div.detail > div.info > h1',
    mainPageCover: 'body > main > section.novel > div.detail > div.cover > img',
    mainPageSummary: 'body > main > section.novel > div.desc',
    mainPageFirstChapter: 'body > main > section.novel > div.detail > div.info > div > a:nth-child(1)',
    mainPageAuthor: 'body > main > section.novel > div.detail > div.info > p:nth-child(2)'
} satisfies TraditionalConfig;

export async function findInYDG(bookInfo: MainInfoResult) {
    if(!bookInfo.book_name || !bookInfo.author) return;
    const sU = new URL('https://www.yeduge.com/search/?q=' + encodeURIComponent(bookInfo.book_name)),
        sR = (await getDocument(sU)).getElementsByTagName('section');
    for (const s of sR){
        const author = s.querySelector('span.author')?.innerText,
            title = s.querySelector('a[href].title');
        if(title && author && title.innerText.trim() == bookInfo.book_name.trim() && author.trim() == bookInfo.author){
            // found
            console.log('在 ydg 中找到相同小说，尝试替换源...');
            return new URL(title.getAttribute('href')!, sU);
        }
    }
}