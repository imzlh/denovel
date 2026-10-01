export default {
    title: 'body > div > div > div.m-title.col-md-12',
    content: '#mlfy_main_text',
    next_link: 'body',

    filter(document, filled_data) {
        // <script type="text/javascript">var fuck={t0417_0:'/book/13781/',t0417_1:'/book/13781/2050005_2.html',t0417_index:'/book/13781/?1585424261',}</script>
        const fuck = Array.from(document.querySelectorAll('script[type="text/javascript"]'))
            .filter(s => s.textContent.includes('fuck={'))[0];
        const json = fuck.innerHTML.substring(fuck.innerHTML.indexOf('{'), fuck.innerHTML.lastIndexOf('}') +1);
        const data = new Function('return ' + json)();
        // 找 _1
        const key = Object.keys(data).find(k => k.endsWith('_1'));
        if (key) {
            filled_data.next_link = new URL(data[key], filled_data.url);
        } else {
            throw new Error('Cannot find next page url in fuck object');
        }
    },
} satisfies TraditionalConfig;