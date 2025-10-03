import { readline } from "../exe.ts";
import { fetch2, getDocument, getSiteCookie, setRawCookie, NoRetryError } from "../main.ts";
import { openFile, processContent } from "../main.ts";
import YDGConfig, { findInYDG } from './www.yeduge.com.t.ts';

console.log('UAA限制蛮多，输入简介页将自动尝试从www.yeduge.com免费下载');

async function showCaptcha(caUrl: string, refer?: string) {
    const caRes = await fetch2(caUrl, {
        headers: {
            'Referer': refer || 'https://www.uaa.com/'
        }
    });
    if (!caRes.ok || !caRes.body) {
        console.log('验证码获取失败，请重试');
        return;
    }
    await Deno.writeFile('captcha.jpg', caRes.body);
    openFile(Deno.realPathSync('captcha.jpg'))
}

// login
while(true) try{
    const testDoc = await getDocument('https://www.uaa.com/member/center');
    const unEl = testDoc.querySelector("body > div.main_box > div.user_box > div.info_box > div.account_box > div");
    if(!unEl){
        await fetch2('https://www.uaa.com/');   // get SessionID
        const rawCache = getSiteCookie('uaa.com', '__DN_USPW__');
        let uname, upass;
        if(rawCache){
            console.log('尝试自动登录...');
            const [un, up] = rawCache.split(',');
            uname = un, upass = up;
        }else{
            console.log('检测到你没有登陆或登陆失败，回车表示放弃');
            uname = await readline('用户名 > ');
            upass = await readline('密码 > ');
        }

        // 验证码
        const caUrl = 'https://uaa.com/email/captcha';
        await showCaptcha(caUrl);

        const captcha = await readline('验证码 > ');
        await fetch2('https://accounts.livechatinc.com/v2/customer/token'); // token
        Deno.removeSync('captcha.jpg');
        const res = await fetch2('https://www.uaa.com/login', {
            method: 'POST',
            body: new URLSearchParams({
                loginName: uname,
                password: upass,
                code: captcha
            })
        }).then(res => res.json());
        if(res.result == 'fail'){
            console.log('登录失败，请重试:', res.msg);
        }else{
            console.log('登录成功');
            setRawCookie('uaa.com', `__DN_USPW__=${uname},${upass}`);
        }
    }else{
        console.log('欢迎,', unEl.textContent.trim());
        break;
    }
}catch(e){
    console.log(e);
    await readline('回车继续 ?');
}

export default {
    title: 'body > div.main_box > div.chapter_box > div.title_box.theme_2 > h2',
    content: 'body > div.main_box > div.chapter_box > div.article',
    next_link: 'a.next_chapter',

    // https://www.uaa.com/novel/intro?id=1003703927742533632
    mainPageLike: /https:\/\/www\.uaa\.com\/novel\/intro\?id=\d+?$/,
    mainPageTitle: 'body > div.main_box > div.content_box > div.left_box > div.novel_box > div > h1',
    mainPageCover: 'body > div.main_box > div.content_box > div.left_box > div.novel_box > img',
    mainPageSummary: 'body > div.main_box > div.content_box > div.left_box > div.detail_box > div.brief_box > div.txt.ellipsis',
    mainPageFirstChapter: 'body > div.main_box > div.content_box > div.left_box > div.detail_box > a',
    mainPageAuthor: 'body > div.main_box > div.content_box > div.left_box > div.novel_box > div > div:nth-child(4) > a',

    request(_url, options) {
        const url = new URL(_url);
        if (url.searchParams.has('__ydg__')){
            const ydgU = new URL(url.searchParams.get('__ydg__')!);
            _url = ydgU;
        }
        const doc = getDocument(_url, options);
        return doc;
    },

    async filter(document, filled_data) {
        // 当被request拦截时，文档是ydg的，URL是初始URL
        // 这只在输入info URL后有效
        if (filled_data.url.searchParams.has('__ydg__')){
            const dataCTX = document.querySelector(YDGConfig.content)!;
            filled_data.content = processContent(dataCTX);
            filled_data.title = document.querySelector(YDGConfig.title)?.textContent.trim()!;
            if(dataCTX.getElementsByTagName('p').at(-3)?.innerText.includes('需要VIP会员')){
                // 这时再使用原来的URL
                const doc = await getDocument(filled_data.url);
                // 找到地址
                for (const el of doc.querySelectorAll(this.__list_sel)){
                    if (el.innerText.trim() == filled_data.title){
                        // 找到，使用原内容
                        // 清空
                        filled_data.content = '';
                        filled_data.next_link = new URL(el.getAttribute('href')!, filled_data.url);
                        filled_data.title = '';
                        return;
                    }
                }
            }
            const mixURL = new URL(filled_data.url);
            const nextU = document.querySelector(YDGConfig.next_link)?.getAttribute('href')!;
            mixURL.searchParams.set('__ydg__', new URL(nextU, filled_data.url.searchParams.get('__ydg__')!).href);
            filled_data.next_link = mixURL;
            return;
        }

        // 去除script
        const ctxel = document.querySelector(this.content);
        ctxel?.getElementsByTagName('div').filter(e => e.getAttribute('style')?.includes('none')).forEach(e => e.remove());
        filled_data.content = processContent(ctxel, {}, new URL(filled_data.url));

        if(filled_data.content?.includes('以下正文内容已隐藏')){
            filled_data.content = filled_data.content.split('…………………………')[0].trim();
            
            const code = document.querySelector(this.content)?.getAttribute('code');
            if(code){
                // 检测网络状况
                if(code == '478'){
                    const chUrl = 'https://www.uaa.com/captcha';
                    await showCaptcha(chUrl);
                    const accessCode = await readline('请输入访问码 > ');

                    const fe = await fetch2('https://www.uaa.com/checkLimitCode', {
                        method: 'POST',
                        body: new URLSearchParams({
                            checkCode: accessCode
                        }),
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }).then(res => res.json());
                    if(fe.result == 'fail'){
                        console.log('访问码错误，请重试');
                        return;
                    }
                }

                // 探测
                if(code == '3'){
                    console.log('你似乎用完了免费额度，请充值后再试');
                    filled_data.content = '';   // prevent retry
                }

                if(code == '4'){
                    console.log('这是付费章节哈，您随意')
                    throw new NoRetryError('付费章节？');
                }
            }

            filled_data.next_link = filled_data.url.toString();
        }
    },

    __list_sel:  'body > div.main_box > div.content_box > div.left_box > div.catalog_box > ul a',
    async mainPageFilter(url, document, filled_data) {
        const selector = this.__list_sel;
        const links = Array.from(document.querySelectorAll(selector));
        if (links.length >= 12){
            // 要开始收费了，尝试ydg
            const ydgU = await findInYDG(filled_data);
            if (ydgU) {
                const spDoc = await getDocument(ydgU);
                const startURL = spDoc.querySelector('body > main > section.novel > div.detail > div.info > div > a')?.getAttribute('href');
                if (!startURL) return;
                const rolledURL = new URL(url);
                rolledURL.searchParams.set('__ydg__', new URL(startURL, ydgU).href);
                filled_data.firstPage = rolledURL;
            }
        }
    },
} satisfies TraditionalConfig & Record<string, any>;

export async function networkHandler(u: URL) {
    if(u.hostname.includes('uameta.ai')){
        return await fetch2(u, arguments[1] ? {
            ...arguments[1],
            referrer: 'https://www.uaa.com/'
        } : {
            referrer: 'https://www.uaa.com/'
        });
    }else{
        // @ts-ignore fetch2
        return await fetch2.apply(null, arguments);
    }
}