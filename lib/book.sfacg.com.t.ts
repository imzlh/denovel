// console.log('请将链接转换为mobile链接');
// const url = prompt('请输入链接 >> ');
// // https://book.sfacg.com/Novel/731099/967026/8866216/
// const pageURL = url?.match(/^https:\/\/book\.sfacg\.com\/Novel\/\d+\/\d+\/(\d+)\/?/);
// if(!pageURL) throw new Error('链接格式不正确');
// console.log('请重新输入为: https://m.sfacg.com/c/' + pageURL[1] + '/');
// Deno.exit(0);

import { getDocument } from "../main.ts";

export default {
    title: '#article > div.article-hd > h1',
    content: '#ChapterBody',
    next_link: '#article > div.fn-btn > a:nth-child(2)',

    // https://book.sfacg.com/Novel/531521/
    mainPageLike: /https:\/\/book\.sfacg\.com\/Novel\/\d+\/?$/,
    mainPageTitle: 'body > div.container > div:nth-child(5) > div > div.main-part.fl.previous-chapter > div.crumbs.clearfix > a:last-child',
    mainPageCover: 'body > div.container > div.d-normal-banner > div > div > div.summary-pic > img',
    mainPageSummary: 'body > div.container > div.d-normal-banner > div > div > div.summary-content > p',
    mainPageFirstChapter: '#BasicOperation > a:nth-child(1)',

    async request(url, ...d){
        // 拦截https://book.sfacg.com/Novel/531521/MainIndex/类
        if(String(url).includes('/MainIndex')){
            const page = await getDocument(url);
            const el1 = page.querySelector('body > div.container > div.wrap.s-list > div.story-catalog a');
            const realurl = el1?.getAttribute('href');
            if(!realurl) throw new Error('获取第一章链接失败');
            url = new URL(realurl, url);
        }

        return await getDocument(url, ...d);
    },
    async infoFilter(url, info){
        const id = url.pathname.match(/\/Novel\/(\d+)/)?.[1];
        if(id) try{
            const page = await getDocument(`https://m.sfacg.com/b/${id}/`, {
                additionalHeaders: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36'
                },
                networkOverride: (u, o) => fetch(u, {
                    ...(o || {}),
                    referrer: undefined
                })
            });
            const desc = page.querySelector('#page > div:nth-child(2) > ul > li.book_bk_qs1');
            if(desc) info.summary = desc.innerText.trim();
        }catch(e){
            console.error('无法获取完整简介：', e);
        }
    }
} satisfies TraditionalConfig;