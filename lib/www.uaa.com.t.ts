import { fill } from "npm:pdf-lib@^1.17.1";
import { readline } from "../exe.ts";
import { fetch2, getDocument, getSiteCookie, setRawCookie, NoRetryError } from "../main.ts";

async function showCaptcha(caUrl: string) {
    const caRes = await fetch2(caUrl);
    if (!caRes.ok || !caRes.body) {
        console.log('验证码获取失败，请重试');
        return;
    }
    await Deno.writeFile('captcha.jpg', caRes.body);
    if (Deno.build.os === 'windows') {
        new Deno.Command('explorer.exe', {
            args: ['captcha.jpg']
        }).outputSync();
    } else {
        console.log('请查看captcha.jpg并输入验证码');
    }
}

// login
while(true) try{
    const testDoc = await getDocument('https://www.uaa.com/member/center');
    const unEl = testDoc.querySelector("body > div.main_box > div.user_box > div.info_box > div.account_box > div");
    if(!unEl){
        await fetch2('https://www.uaa.com/');   // get SessionID
        const rawCache = getSiteCookie('www.uaa.com', '__DN_USPW__');
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

    async filter(document, filled_data) {
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
                }

                if(code == '4'){
                    console.log('这是付费章节哈，您随意')
                    throw new NoRetryError('付费章节？');
                }
            }

            filled_data.next_link = filled_data.url.toString();
        }
    },
} satisfies TraditionalConfig;