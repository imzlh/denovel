import { getDocument, fetch2, sleep } from "../main.ts";

console.log('此脚本需要使用第一章网址才能正常运行')

async function getImage(url: string) {
    const document = await getDocument(url);
    const script = document.getElementsByTagName('script').find(s => s.innerHTML.includes('DM5_CID'));
    if (!script) throw new Error('网页内容错误：没有找到数据');
    const { data, pagecnt, title } = new Function('url', `
        const window = { location: new URL(url) };
        const reseturl = () => void(0)

        ${script.innerHTML};

        return { 
            data: { cid: DM5_CID, key: '', language: 1, gtk: 6, _cid: DM5_CID, _mid: DM5_MID, _dt: DM5_VIEWSIGN_DT, _sign: DM5_VIEWSIGN }, 
            pagecnt: DM5_IMAGE_COUNT, 
            title:DM5_CTITLE
        };
    `)(url);

    const url2 = new URL('/chapterfun.ashx', url);
    Object.entries(data as Record<string, string>)
        .forEach(([k, v]) => url2.searchParams.append(k, v));

    let res = [] as string[];
    for(let page = 1; page <= pagecnt; page++){
        url2.searchParams.set('page', page.toString());
        const response = await fetch2(url2, {
            headers: {
                'Referer': url,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`Failed to fetch ${url2}(status: ${response.status}) ${text}`);
        
        (function(){
            res.push(...(  eval(text)  ));
        })();
        await sleep(.5 + Math.random());
    }

    console.log(`获取${title}成功，共${pagecnt}页`);
    const next = document.querySelector('div.container > div > a:last-child');
    return [ res, next?.getAttribute('href'), title ] as [ string[], string | null, string ];
}

export default async function* main(page1: string) {
    const [imgs, next, title] = await getImage(page1);
    if (!imgs.length) throw new Error('没有找到图片');
    for(const image of imgs){
        // add referrer to avoid 403 error
        const url = new URL(image, page1);
        url.searchParams.set('referrer', page1);
        yield url.href;
    }
    return [
        title, next ? new URL(next, page1).href : null
    ];
}

export async function networkHandler(url: string | URL, options?: RequestInit){
    let res;
    try{
        const url2 = typeof url === 'string' ? new URL(url) : url;
        res = await fetch2(url2, {
            ...options,
            headers: {
                ...(options?.headers || {}),
                "Referer": url2.searchParams.get("referrer") || url2.href,
                "Origin": "https://tel.dm5.com",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
            }
        });
        if(!res.ok) throw 0;
    }catch{};
    await sleep(Math.random());
    return res;
}