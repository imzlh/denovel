import { readline } from "../exe.ts";
import { getDocument, fetch2, forceSaveConfig } from "../main.ts";

// Get Login State
while(true){
    const lp = await getDocument('https://www.esjzone.one/my/profile.html');
    const uel = lp.querySelector('body > div.offcanvas-wrapper > section > div > div.col-lg-4 > aside > form > div.user-data');
    if(uel) {
        console.log('已登录：', uel.innerText.trim());
        break;
    }else try{
        // 模拟用户浏览器登陆
        console.log('未登录，正在尝试登录...');
        await fetch2('https://www.esjzone.one/my/login');

        const username = await readline('请输入用户名 > ') || '2131601562@qq.com';
        const password = await readline('请输入密码 > ') || 'sbsb1234';
        if(!username ||!password) throw new Error('用户名或密码不能为空！');

        // 获取登录token
        const tok = await (await fetch2('https://www.esjzone.one/my/login', {
            method: 'POST',
            body: 'plxf=getAuthToken',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })).text();
        // <JinJing>token_here</JinJing>
        const tmatch = tok.match(/^\s*<JinJing>(.+)<\/JinJing>\s*$/i);
        if(!tmatch) throw new Error('获取登录token失败！');

        const res = await fetch2('https://www.esjzone.one/inc/mem_login.php', {
            method: 'POST',
            body: `email=${username}&pwd=${password}&remember_me=on`,
            headers: {
                'Authorization': tmatch[1],
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const json = await res.json();
        if(json.status == 200){
            forceSaveConfig();
            continue;
        }else{
            console.log('登录失败！', json.msg);
            console.warn(json);
        }
    }catch(e){
        console.warn('未登录，很多小说将无法获取！', e);
        break;
    }
}

export default {
    title: 'body > div.offcanvas-wrapper > section > div > div.col-xl-9.col-lg-8.p-r-30 > h2',
    content: 'body > div.offcanvas-wrapper > section > div > div.col-xl-9.col-lg-8.p-r-30 > div.forum-content.mt-3',
    next_link: 'body > div.offcanvas-wrapper > section > div > div.col-xl-9.col-lg-8.p-r-30 > div:nth-child(3) > div.column.text-right > a',

    // https://www.esjzone.one/detail/1744367676.html
    mainPageLike: /\/detail\/\d+\.html/i,
    mainPageCover: 'body > div.offcanvas-wrapper > section > div > div.col-xl-9.col-lg-8.p-r-30 > div:nth-child(1) > div.col-md-3 > div.product-gallery.text-center.mb-3 > a > img',
    mainPageTitle: 'body > div.offcanvas-wrapper > section > div > div.col-xl-9.col-lg-8.p-r-30 > div:nth-child(1) > div.col-md-9.book-detail > h2',
    mainPageFirstChapter: '#chapterList a',
    mainPageSummary: '#details > div > div > div.description',
    mainPageAuthor: 'body > div.offcanvas-wrapper > section > div > div.col-xl-9.col-lg-8.p-r-30 > div:nth-child(1) > div.col-md-9.book-detail > ul > li:nth-child(2) > a',

    jpStyle: true
} satisfies TraditionalConfig;