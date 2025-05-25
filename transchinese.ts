import { basename, dirname } from "jsr:@std/path@^1.0";
import { getDocument, removeIllegalPath } from "./main.ts";
import { fetch2 } from "./main.ts";
import { toEpub } from "./2epub.ts";
import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";

let _url = prompt(" >> ");
// if(!_url) Deno.exit();
if(!_url) _url = 'https://unovel.transchinese.org/epub%E5%B0%8F%E8%AF%B4%E4%B8%8B%E8%BD%BD%EF%BC%88%E6%9B%B4%E6%96%B0%EF%BC%89/';

const items: Record<string, URL> = {};

await ensureDir('./transout');
Deno.chdir('./transout');

// const parseHTML = (url: URL | string) => getDocument(url).then(async doc => {
//     const path = (id: number) => `body > div.md-container > main > div > div.md-content > article > p:nth-child(${5 + num})`;
//     for(let num = 0; num < 3; num++){
//         const path2 = path(num);
//         const p = doc.querySelector(path2);
//         if(!p) break;

//         if(p.getElementsByTagName('img').length){
//             // images
//             for(const item of p.getElementsByTagName('img')){
//                 const url2 = item.getAttribute('src')!;
//                 // download image
//                 const url_ = new URL(url2, url);
//                 const name = url_.pathname;
//                 items[name] = url_;
//             }
//         }

//         for(const item of p.getElementsByTagName('li')){
//             const url2 = item.querySelector('a')!.getAttribute('href')!;
//             await parseHTML(new URL(url2, url));
//         }
        
//     }

    
    
    
// })

const getNovelByUrl = async (url: URL | string) => {
    const doc = await getDocument(url);
    const path = 'body > div.md-container > main > div > div.md-content > article > p:nth-child(2) > a';
    const title = doc.querySelector(path)!.textContent!;
    let bytes: Uint8Array;

    for(let i = 0; i < 3; i++) try{
        const content = await fetch2(new URL(doc.querySelector(path)!.getAttribute('href')!, url));
        console.log('Got', title);
        bytes = await content.bytes();
        break;
    }catch(e){
        if(i < 2)
            console.log('Retrying', i+1, '...', (e as Error).message);
        else
            throw e;
    }
    // @ts-ignore ?
    return [removeIllegalPath(title), bytes] as [string, Uint8Array];
}

async function* getIndex (url: URL | string){
    const doc = await getDocument(url);
    for(const item of doc.querySelectorAll(
        'body > div.md-container > main > div > div.md-content > article > table > tbody > tr > td:nth-child(1) > a'
    )){
        //  > tr:nth-child(1) > td:nth-child(1) > a
        const title = item.textContent!;
        let _url = item.getAttribute('href')!;
        _url.endsWith('/') || (_url += '/');
        const url2 = new URL(_url, url);
        yield [title, url2];
    }
}

// main
for await(const [title, url] of getIndex(_url)) try{
    const [title2, content] = await getNovelByUrl(url);
    ensureDir(dirname(title2));
    if(title2.endsWith('.txt'))
        toEpub(new TextDecoder().decode(content), title2, title2.replace('.txt', '.epub'))
            .catch((function(this: [string, Uint8Array], e: Error){
                console.error(e);
                Deno.writeFile(this[0], this[1]);
            }).bind([title2, content]));
    else
        Deno.writeFile(title2, content);
}catch(e){
    console.error(e);
}