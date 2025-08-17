import { getDocument } from "../main.ts";
import { readline } from '../exe.ts'

while(true){
    const doc = await getDocument('https://masiro.me/admin');
    if(doc.documentURI.startsWith('https://masiro.me/admin/auth/login')){
        console.log('真白萌的爬取需要登陆！');
        const uname = await readline('请输入用户名 > ');
        const upass = await readline('请输入密码 > ');
        const csrf = doc.querySelector('#loginForm > p.login.button > input[type=hidden]:nth-child(1)')?.getAttribute('value');
        const fe = await fetch('https://masiro.me/admin/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-csrf-token': csrf ?? '',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: `username=${uname}&password=${upass}&activationcode=&remember=1&_token=${csrf}`
        }).then(res => res.json());
        if(fe.code != 0){
            console.log('登陆失败！', fe.msg);
        }else{
            continue;
        }
    }else{
        const unameEl = doc.querySelector('body > div > header > nav > div > ul > li.dropdown.user.user-menu > ul > li.user-header > p');
        console.log(`欢迎您，${unameEl?.textContent}`);
        break;
    }
}

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
            const page = await getDocument(`https://m.sfacg.com/b/${id}/`, undefined, {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36'
            }, true);
            const desc = page.querySelector('#page > div:nth-child(2) > ul > li.book_bk_qs1');
            if(desc) info.summary = desc.innerText.trim();
        }catch(e){
            console.error('无法获取完整简介：', e);
        }
    }
} satisfies TraditionalConfig;