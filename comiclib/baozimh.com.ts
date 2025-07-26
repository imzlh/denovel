import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { getDocument, sleep, similarTitle, fetch2 } from "../main.ts";

// amp-img id="chapter-img-0-4"
const selector = 'amp-img[id^=chapter-img-] > noscript > img';
const titleS = '#layout > div > div.header > div > div > span';
const nextS = '#layout > div > div.next_chapter > a';

async function getImages(page: string){
    const document = await getDocument(page);
    const images = Array.from(document.querySelectorAll(selector));
    return [
        images.map(img => img.getAttribute('src')),
        document.querySelector(titleS)?.textContent || '',
        document.querySelector(nextS)?.getAttribute('href') || ''
    ] as [string[], string, string];
}

let previousTitle = '';
async function getImages2(page: string) {
    let title = '';
    const imgs = [];
    previousTitle = '';
    let next = page;
    do{
        previousTitle = title;
        const [images, title2, nextUrl] = await getImages(next);
        title = title2;
        imgs.push(...images);
        next = nextUrl;
    } while(page && similarTitle(title, previousTitle));
    return [
        imgs,
        title,
        next
    ];
}

export default async function* main(page1: string) {
    if(new URL(page1).hostname.includes('.baozimh')){
        // get 
        const dl = await getDocument(page1);
        // update: 25/6/15
        const chap1 = dl.querySelector('#chapter-items > div > a');
        const page = chap1?.getAttribute('href');
        if(!page) throw new Error('似乎网址不正确？');
        page1 = new URL(page, page1).href;
    }
    const page = await getImages2(page1);
    if(!page[0]) throw new Error('没有找到图片');
    yield* page[0];
    await sleep(1);
    return [
        page[1],
        page[2]
    ];
}

export async function networkHandler(url: string | URL, options?: RequestInit){
    let res;
    try{
        res = await fetch2(url, {
            ...options,
            headers: {
                ...(options?.headers || {}),
                Referer: 'https://www.twmanga.com/',
                Origin: 'https://www.twmanga.com'
            }
        });
        if(!res.ok) throw 0;
    }catch{};
    return res;
}

export const getInfo = async (page: string) => {
    // https://www.baozimh.com/comic/wocaibushimofashaonu-sfqingxiaoshuo
    assert(/\.baozimh[^/]+\/comic\/\w+/.test(page), '此链接非漫画首页');
    const response = await getDocument(page),
        title = response.querySelector('#layout > div.comics-detail > div.de-info-wr > div.l-content > div > div > div > h1')?.innerText,
        cover = response.querySelector('#layout amp-img')?.getAttribute('src');
    return {
        title,
        cover,
        firstPage: page
    };
}