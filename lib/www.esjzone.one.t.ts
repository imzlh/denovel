import { setRawCookie, getDocument, fetch2, forceSaveConfig } from "../main.ts";

const cookie = prompt('输入esjzone.one的cookie > ') || '_ga=GA1.1.1213900809.1743921237; msg_alert=10; ws_last_visit_code=96f7fa806ebxyWfzb5j8oTabSI4xQvRYiXgA0DFjrD-VtgeqtTyu5XzNc6jw; ws_last_visit_post=4ff1d0bc677eIeV4hYMTHXpl-ZS1bo0j58ZVqVl0PvrSjf3BLMUWCuYEP7bCH3h8xPNcwX94luarpCbr2O; _ga_6N355XR0Y6=GS2.1.s1749536450$o3$g0$t1749536450$j60$l0$h0';
if(cookie) setRawCookie('esjzone.one', cookie);

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

        const username = prompt('请输入用户名 > ') || '2131601562@qq.com';
        const password = prompt('请输入密码 > ') || 'sbsb1234';
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
} satisfies TraditionalConfig;