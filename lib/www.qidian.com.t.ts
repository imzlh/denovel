import { getDocument, setRawCookie } from "../main.ts";

throw new Error('不可用！TODO: 逆向验证');
// 起点浏览器验证
// const testPg = await getDocument('https://www.qidian.com/');
// const script = testPg.getElementsByTagName('script').filter(i => i.getAttribute('src'))[0].innerHTML;
// new Function('window', 'document', script)(globalThis, testPg);
// console.log(testPg.cookie);
setRawCookie('qidian.com', 'newstatisticUUID=1754894409_1112233240; _csrfToken=HrRCUGQJQjrpnUidoJCtxUiihirTnxsJEum2V6T5; fu=1799763757; traffic_utm_referer=; traffic_search_engine=; se_ref=; w_tsfp=ltvuV0MF2utBvS0Q7K7hnU6pFD8ldDs4h0wpEaR0f5thQLErU5mA1Y5zu8z1OHff4Mxnvd7DsZoyJTLYCJI3dwMQQcuYJY0R3wjCkoB0j4ZCAEVnQJiOWFQacu93ujBHfHhCNxS00jA8eIUd379yilkMsyN1zap3TO14fstJ019E6KDQmI5uDW3HlFWQRzaLbjcMcuqPr6g18L5a5W3c7VyoL1onArIQ1hCa0CwbWy4j40K+c7tdNRX7K5unSqA=');

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
} satisfies TraditionalConfig;