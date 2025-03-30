import { fetch2, getDocument } from "../main.ts";

const base = 'https://manhua.sfacg.com/ajax/Common.ashx';
const header = {
    dnt: '1',
    'x-requested-with': 'XMLHttpRequest'
}

export default async function* main(page1: string) {
    let page = page1;
    const response = await getDocument(page, undefined, header),
        title = response.querySelector('body > div.Reduction_top > div > div.Reduction_left')?.innerText
            .split('>').at(-1)?.trim() || '未知';
    for (const script of response.querySelectorAll('script')) {
        const text = script.textContent;
        if (text.includes('chapId') && text.includes('nextChap')) {
            const chapId = parseInt(text.match(/chapId\s*=\s*(\d+)/)?.[1] || '0'),
                c = parseInt(text.match(/c\s*=\s*(\d+)/)?.[1] || '0'),
                nv = text.match(/nv\s*=\s*"(\w+)"/)?.[1] || '',
                fn = text.match(/fn\s*=\s*"(\w+)"/)?.[1] || '',
                nextChap = text.match(/nextChap\s*=\s*(\d+)/)?.[1] || '';
            if (!chapId || !c || !nv || !fn) continue;
            // URL
            // ?op=getPics&cid=2937&chapId=81461&serial=ZP&path=0011_905&_=1740293233987
            const url = `${base}?op=getPics&cid=${c}&chapId=${chapId}&serial=${fn}&path=${nv}&_=${Date.now()}`,
                fe = await (await fetch2(url, { headers: header })).json();

            if (fe.status == 200) {
                yield* fe.data as string[];
            }
            return [
                title || '未知',
                new URL(nextChap, page1.endsWith('/') ? page1.slice(0, -1) : page1).href
            ];
        }
    }
    throw new Error('Failed to find chapters');
}