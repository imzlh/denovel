import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { fetch2, getDocument, removeHTMLTags } from "../main.ts";

const URL_base = "https://api.cenguigui.cn/api/tomato/api",
    URL_get = "http://rehaofan.jingluo.love";

const INTERNAL_NEXT = 'https://book-next-internal.local/__internal_next_link__';

console.log('请知晓，为了防止被封，本爬虫会在每次请求之后随机等待几秒');

const detail = (bookid: string) =>
    fetch2(`${URL_base}/detail.php?book_id=${bookid}`).then(r => r.json())
        .then(__ => {
            if(__.code != 0) throw new Error(`Failed to fetch book detail: ${__.msg}`);
            const data = __.data,
                thumb = data.thumb_url as string,
                desc = (data.book_abstract_v2 || data.book_abstract) as string,
                lastUpdate = parseInt(data.last_chapter_update_time);
            return { thumb, desc, lastUpdate };
        });

interface IChapter{
    itemId: string,
    title: string,
    firstPassTime: string,
    volume_name: string,
    need_pay: number
}
    
const chapters = (bookid: string) =>
    fetch2(`${URL_base}/all_items.php?book_id=${bookid}`).then(r => r.json())
        .then(__ => {
            if(__.code != 0) throw new Error(`Failed to fetch book chapters: ${__.msg}`);
            const data = __.data.chapterListWithVolume as Array<Array<IChapter>>,
                volume = __.data.volumeNameList as Array<string>;
            
            return Object.fromEntries(volume.map((c, i) => [c, data[i]]));
        });

const content = async (chapId: string) => 
    fetch2(`${URL_base}/content.php?item_id=${chapId}`).then(r => r.json())
        .then(__ => {
            if(__.code != 0) throw new Error(`Failed to fetch chapter content: ${__.msg}`);

            const data = __.data.content as string;
            return data;
        });

const content2 = (chapId: string) => 
    fetch2(`${URL_get}/content?item_id=${chapId}`).then(r => r.json())
        .then(__ => {
            if(__.code != 0) throw new Error(`Failed to fetch chapter content: ${__.msg}`);
            const data = __.data.content as string;
            return removeHTMLTags(data);
        });

export default (function () {
    const urlPreg = /^https?\:\/\/.*fanqienovel\.com\/page\/(\d+)\/?/i;
    let chapter: IChapter[];
    let i = 0;

    return async function (url) {
        url = typeof url === 'object' ? url.toString() : url;
        if(url == INTERNAL_NEXT){
            if(i >= chapter.length) return null;

            // 强制sleep防止被封
            await delay(5000 * Math.random() + 3000);

            let ctx;
            try{
                ctx = await content2(chapter[i].itemId);
                if(!ctx) throw new Error('Failed to fetch chapter content');
            }catch(e){
                ctx = await content(chapter[i].itemId);
                if(!ctx) throw new Error('Failed to fetch chapter content');
            }

            return {
                title: chapter[i++].title,
                content: ctx,
                next_link: INTERNAL_NEXT
            };
        }else if(urlPreg.test(url)){
            const bookid = url.match(urlPreg)![1];
            chapter = Object.values(await chapters(bookid)).flat();
            const res = {
                title: chapter[i].title,
                content: await content(chapter[i].itemId),
                next_link: INTERNAL_NEXT
            };
            i++;    // to avoid i++ when error occurs
            return res;
        }else{
            throw new Error("Invalid url");
        }
    }
} satisfies Callback);