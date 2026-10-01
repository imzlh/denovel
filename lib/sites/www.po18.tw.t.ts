import { getDocument, processContent } from "../core/mod.ts";

export default {
    title: '#readmask > div > h1',
    content: '#readmask > div',
    next_link: 'body > div > div.read-nav > a.next1',

    async filter(document, filled_data) {
        const newURL = filled_data.url.toString().replace('/articles/', '/articlescontent/');
        const content = await getDocument(newURL, {
            additionalHeaders: {
                'X-Requested-With': 'XMLHttpRequest'
            },
            referer: filled_data.url.toString()
        });
        filled_data.title = content.querySelector('h1')?.innerText!;
        content.querySelectorAll('h1').forEach(h1 => h1.remove());
        content.querySelectorAll('blockquote[cite]').forEach(bq => bq.remove());
        filled_data.content = processContent(content.body, {}, filled_data.url);

        // javascript:
        if (filled_data.next_link?.toString().startsWith('javascript:')){
            // 跳过付费继续白嫖
            const chapterMain = document.querySelector('body > div > div.read-nav > a:nth-child(2)')?.getAttribute('href');
            if (chapterMain) {
                const ciUrl = new URL(chapterMain + '/articles', filled_data.url);

                // 找到当前章节
                const doc = await getDocument(ciUrl);
                const curName = filled_data.title.trim();
                let found = false;
                for (const div of doc.querySelectorAll('#w0 > div')){
                    if (found){
                        // 找第一个非javascript:的链接
                        const a = div.querySelector('.l_btn a');
                        if (a && !a.getAttribute('href')?.startsWith('javascript:')){
                            filled_data.next_link = new URL(a.getAttribute('href')!, ciUrl);
                            break;
                        }
                    }
                    
                    const name = div.querySelector('.l_chaptname a')?.innerText.trim();
                    if (name && name == curName){
                        found = true;
                    }
                }
            }
        }
    },

    // https://www.po18.tw/books/868219
    mainPageLike: /^https:\/\/www\.po18\.tw\/books\/\d+$/,
    mainPageTitle: 'body > div.CONTAINER > div.content > div.c_left > div.book_detail > div.book_info > h1',
    mainPageCover: 'body > div.CONTAINER > div.content > div.c_left > div.book_detail > div.book_cover.R-rated > img',
    mainPageFirstChapter: 'body > div.CONTAINER > div.content > div.c_left > div.toolbar > a:nth-child(1)',
    mainPageAuthor: 'body > div.CONTAINER > div.content > div.c_left > div.book_detail > div.book_info > dl > dd.author > h2 > a',
    mainPageSummary: 'body > div.CONTAINER > div.content > div.c_left > div.book_intro'
} satisfies TraditionalConfig;
