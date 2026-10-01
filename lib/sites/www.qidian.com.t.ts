import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { NoRetryError } from "../core/mod.ts";

export default {
    title: '#reader-content > div > div > div.relative > div > h1',
    content: 'main.content',
    next_link: '#reader-content > div > div > div.mx-64px.pb-64px.mt-auto > div > a:nth-child(2)',

    // https://www.qidian.com/book/1042991797/
    mainPageLike: /https\:\/\/.+?\.qidian\.com\/book\/\d+\/?$/,
    mainPageTitle: '#bookName',
    mainPageCover: '#bookImg > img',
    mainPageSummary: '#book-intro-detail',
    mainPageFirstChapter: '#readBtn',

    async request() {
        while(true){
            const feRes = await fetch.apply(null, arguments as any);
            if(feRes.status == 202 && (await feRes.text()).includes('probe.js')){
                throw new NoRetryError('Qidian requires browser verification; configure a valid qidian.com cookie with credential set-cookie');
            }else{
                const text = await feRes.text();
                if(text.length < 500){
                    console.log('网页内容太少，尝试重试');
                    continue;
                }
                return new DOMParser().parseFromString(text, 'text/html');
            }
        }
    },
    async filter(_, filled_data) {
        if(!filled_data.content?.length){
            // try reload?
        }
    },
} satisfies TraditionalConfig;
