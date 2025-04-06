import { setRawCookie } from "../main.ts";

const cookie = prompt('输入esjzone.one的cookie > ');
if(cookie) setRawCookie('esjzone.one', cookie);

export default {
    title: 'body > div.offcanvas-wrapper > section > div > div.col-xl-9.col-lg-8.p-r-30 > h2',
    content: 'body > div.offcanvas-wrapper > section > div > div.col-xl-9.col-lg-8.p-r-30 > div.forum-content.mt-3',
    next_link: 'body > div.offcanvas-wrapper > section > div > div.col-xl-9.col-lg-8.p-r-30 > div:nth-child(3) > div.column.text-right > a',
} satisfies TraditionalConfig;