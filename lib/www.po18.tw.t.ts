import { get } from "node:http";
import { readline } from "../exe.ts";
import { fetch2, getDocument, getSiteCookie, openFile, processContent, setRawCookie } from "../main.ts";

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

// 登录
while(true){
    const doc = await getDocument('https://www.po18.tw/panel/stock_manage/read_records');
    const myname = doc.querySelector('#page > div.navbar > ul.right-nav > li.member')?.innerText;
    if(!myname) {
        console.log('看样子你还没有登录。请输入？');
        setRawCookie('po18.tw', 'po18Limit=1;url=https%3A%2F%2Fwww.po18.tw');
        const loginForm = await getDocument('https://members.po18.tw/apps/login.php');
        const hidden = loginForm.querySelectorAll('#page > div.login > div.login_wrapbox > form input[name][type=hidden]');
        const rawCache = getSiteCookie('po18.tw', '__DN_USPW__');
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
        const caUrl = 'https://members.po18.tw/apps/images.php';
        await showCaptcha(caUrl, 'https://members.po18.tw/apps/login.php');

        const captcha = await readline('验证码 > ');
        Deno.removeSync('captcha.jpg');
        console.log('正在登录...');
        const res = await fetch2('https://members.po18.tw/apps/login.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://members.po18.tw',
            },
            referrer: 'https://members.po18.tw/apps/login.php',
            body: new URLSearchParams({
                ... Object.fromEntries(Array.from(hidden).map(i => [i.getAttribute('name')!, i.getAttribute('value')!])),
                account: uname,
                pwd: upass,
                captcha
            }),
            redirect: 'manual'
        });
        if(res.status != 302){
            console.log('登录失败，请重试(status=' + res.status + ')', await res.text());
        }else{
            console.log('登录成功');
            setRawCookie('po18.tw', `__DN_USPW__=${uname},${upass}`);
        }
    }else{
        console.log('你已经登录，欢迎回来', myname);
        break;
    }
}

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