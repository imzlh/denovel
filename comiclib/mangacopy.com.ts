import { Document } from "jsr:@b-fuze/deno-dom";
import { getDocument, fetch2, sleep, setRawCookie } from "../main.ts";
import CryptoJS from 'npm:crypto-js';

const API_CHAPTER = 'https://www.mangacopy.com/comicdetail/{{name}}/chapters?format=json';
setRawCookie('mangacopy.com', 'webp=1');    // 启用webp

async function getEverything(page: URL | string) {
    const document = await getDocument(page);
    const nextLink = document.querySelector('body > div.footer > div.comicContent-next > a')?.getAttribute('href');
    const encrypted = document.querySelector('.imageData[contentKey]');
    const result = decryptChapterData(await getCCXY(new URL(page), document), encrypted?.getAttribute('contentKey')!);
    return [ 
        result.map((el: any) => el.url as string), 
        document.querySelector('body > h4')?.innerHTML.split('/')[1],
        nextLink ? new URL(nextLink, page) : undefined
    ];
}

export default async function* main(page1: string) {
    const page = await getEverything(page1);
    yield* page[0];
    await sleep(1);
    return page.slice(1);
}

async function getCCXY(url: URL, document?: Document) {
    if(!document) document = await getDocument(url);
    const script = document.getElementsByTagName('script').filter(el => el.innerHTML.includes('var cc'))[0];
    return script.innerHTML.match(/var\s*cc[xy]\s*=\s*['"](.*?)['"]/)![1];
}

function decryptChapterData(ccxy: string, encryptedStr: string) {
    // 分离IV和密文
    const ivStr = encryptedStr.substring(0, 16);
    const cipherText = encryptedStr.substring(16);

    // 准备加密参数
    const key = CryptoJS.enc.Utf8.parse(ccxy);
    const iv = CryptoJS.enc.Utf8.parse(ivStr);

    // Hex解码 -> Base64转换 -> AES解密
    const cipherParams = CryptoJS.enc.Hex.parse(cipherText);
    const base64Cipher = CryptoJS.enc.Base64.stringify(cipherParams);
    const decrypted = CryptoJS.AES.decrypt(
        base64Cipher,
        key,
        {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }
    );

    // 转换解密结果
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}

const processChapterList = (result: any) =>{ 
    const types: { id: number, name: string } = result.build.type;
    const groups = {} as Record<number, { name: string, id: string, type: number }[]>;
    for(const item of result.groups.default.chapters){
        if(!groups[item.type]) groups[item.type] = [];
        groups[item.type].push(item);
    }

    // 如果有话，优先使用话而不是卷
    let items;
    if(groups[1]) items = groups[1].concat(groups[0] ?? []);
    else items = groups[0].concat(groups[1] ?? []);

    return items
        .map(el => 
            `https://www.mangacopy.com/comic/${result.build.path_word}/chapter/${el.id}`
        ) as string[];
}

const getChapterList = (url: URL) => fetch2(API_CHAPTER.replace('{{name}}', url.pathname.split('/').filter(Boolean).at(-1)!), {
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    referrer: 'https://www.mangacopy.com/',
})
    .then(async res => res.ok ? res.json() : Promise.reject(new Error('Failed to get chapter list: ' + (await res.json()).detail)))
    .then(async ({ results }) => decryptChapterData(await getCCXY(url), results))
    .then(processChapterList);

export async function networkHandler(url: string | URL, options?: RequestInit){
    let res;
    try{
        res = await fetch2(url, {
            ...options,
            headers: {
                ...(options?.headers || {}),
                "Referer": "https://baozimh.org/",
                "Origin": "https://baozimh.org",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
            }
        });
        if(!res.ok) throw 0;
    }catch{};
    return res;
}

export const getInfo = (url:  URL) => getDocument(url).then(async doc => ({
    firstPage: (await getChapterList(new URL(url)))[0],
    title: doc.querySelector('body > main > div.container.comicParticulars-title > div > div.col-9.comicParticulars-title-right > ul > li:nth-child(1) > h6')?.innerHTML,
    cover: doc.querySelector('body > main > div.container.comicParticulars-title > div > div.col-auto.comicParticulars-title-left > div > img')?.getAttribute('data-src'),
    tags: Array.from(
        doc.querySelectorAll('body > main > div.container.comicParticulars-title > div > div.col-9.comicParticulars-title-right > ul > li:nth-child(7) > span.comicParticulars-left-theme-all.comicParticulars-tag > a')
    ).map(e => e.innerHTML),
    summary: doc.querySelector('body > main > div.container.comicParticulars-synopsis > div:nth-child(2) > p.intro')?.innerHTML,
    author: doc.querySelector('body > main > div.container.comicParticulars-title > div > div.col-9.comicParticulars-title-right > ul > li:nth-child(3) > span.comicParticulars-right-txt > a')?.innerHTML
} as ComicMainInfo))