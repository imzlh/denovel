export default {
    title: '#container > div > div > div.reader-main > h1',
    content: '#content',
    next_link: '#container > div > div > div.reader-main > div:nth-child(1) > a:nth-child(5)',
    filter(doc, data){
        const link = data.next_link;
        // var nexturl='L2Jvb2svNDE4MDE1MS8zMjIxMTcxODhfNC5odG1sIA==';
        if(String(link).startsWith('javascript:')){
            const nextUrl = doc.getElementsByTagName('script')
                .filter(s => s.innerHTML.includes('location.href'))[0].innerHTML
                .match(/var\s+nexturl\s*=\s*'([^']+)'/)![1];
            // decode base64 url
            data.next_link = new URL(atob(nextUrl), data.url).href;
        }
    }
} satisfies TraditionalConfig;