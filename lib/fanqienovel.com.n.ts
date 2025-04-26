// /**
//  * fanqieAPI
//  */
// const API = {
//     detail: (bid: string) => `https://api5-normal-sinfonlinea.fqnovel.com/reading/bookapi/detail/v?without_video=true&book_id=${bid}&iid=2904223656184955&device_id=2904223657000043&ac=wifi&channel=43536071a&aid=1967&app_name=novelapp&version_code=66932&version_name=6.6.9.32&device_platform=android&os=android&ssmix=a&device_type=Pixel+5&device_brand=google&language=zh&os_api=33&os_version=13&manifest_version_code=66932&resolution=1920*1080&dpi=240&update_version_code=66932&_rticket=1745107984402&&host_abi=armeabi-v7a&dragon_device_type=phone&pv_player=66932&compliance_status=0&need_personal_recommend=1&player_so_load=1&is_android_pad_screen=0&rom_version=TQ3A.230901.001&cdid=dceae012-9bd3-4509-9e3e-d8afb51c8551`,
//     content: (bid: string, iid: string) => `https://api5-normal-sinfonlinea.fqnovel.com/reading/reader/full/v?item_id=${iid}&key_register_ts=0&book_id=${bid}&iid=2904223656184955&device_id=2904223657000043&ac=wifi&channel=43536071a&aid=1967&app_name=novelapp&version_code=66932&version_name=6.6.9.32&device_platform=android&os=android&ssmix=a&device_type=Pixel+5&device_brand=google&language=zh&os_api=33&os_version=13&manifest_version_code=66932&resolution=1920*1080&dpi=240&update_version_code=66932&_rticket=1745108485514&&host_abi=armeabi-v7a&dragon_device_type=phone&pv_player=66932&compliance_status=0&need_personal_recommend=1&player_so_load=1&is_android_pad_screen=0&rom_version=TQ3A.230901.001&cdid=dceae012-9bd3-4509-9e3e-d8afb51c8551`
// }

// const INTERNAL_NEXT = 'https://book-next-internal.local/__internal_next_link__';

// console.log('请知晓，为了防止被封，本爬虫会在每次请求之后随机等待几秒');

// const detail = (bookid: string) =>
//     fetch2(`${URL_base}/detail.php?book_id=${bookid}`).then(r => r.json())
//         .then(__ => {
//             if(__.code != 0) throw new Error(`Failed to fetch book detail: ${__.msg}`);
//             const data = __.data,
//                 thumb = data.thumb_url as string,
//                 desc = (data.book_abstract_v2 || data.book_abstract) as string,
//                 lastUpdate = parseInt(data.last_chapter_update_time);
//             return { thumb, desc, lastUpdate };
//         });

// interface IChapter{
//     itemId: string,
//     title: string,
//     firstPassTime: string,
//     volume_name: string,
//     need_pay: number
// }
    
// const chapters = (bookid: string) =>
//     fetch2(`${URL_get}/all_items?book_id=${bookid}`).then(r => r.json())
//         .then(__ => {
//             if(__.code != 0) throw new Error(`Failed to fetch book chapters: ${__.msg}`);
//             const data = __.data.chapterListWithVolume as Array<Array<IChapter>>,
//                 volume = __.data.volumeNameList as Array<string>;
            
//             return Object.fromEntries(volume.map((c, i) => [c, data[i]]));
//         });

// const content2 = (chapId: string) => 
//     fetch2(`${URL_get}/content?item_id=${chapId}`).then(r => r.json())
//         .then(__ => {
//             if(__.code != 0) throw new Error(`Failed to fetch chapter content: ${__.msg}`);
//             const data = __.data.content as string;
//             return removeHTMLTags(data);
//         });

// const genTicket = () => Math.floor(Math.random() * 13).toString(10);
// const socter = 'AAEAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// const bookMeta = async (bid: string) => {
//     const ticket = genTicket();
//     const res = await fetch2(API.detail(bid), {

// const content = async (bid: string, iid: string) => {
//     const ticket = genTicket();
//     fetch(API.content(bid, iid), {
//         headers: {
//             'Content-Type': 'application/json; charset=utf-8,application/x-protobuf',
//             'x-xs-from-web': '0',
//             'x-ss-req-ticked': ticket,
//             'x-reading-request': `${ticket}-${ticket.substring(0, 10)}`,
//             'x-vc-bdturing-sdk-version': '3.7.2.cn',
//             'sdk-version': '2'
//         }
//     })
// }

// export default (function () {
//     const urlPreg = /^https?\:\/\/.*fanqienovel\.com\/page\/(\d+)\/?/i;
//     let chapter: IChapter[];
//     let i = 0;

//     return async function (url) {
//         url = typeof url === 'object' ? url.toString() : url;
//         if(url == INTERNAL_NEXT){
//             if(i >= chapter.length) return null;

//             // 强制sleep防止被封
//             await delay(2000 * Math.random() + 1000);

//             let ctx;
//             ctx = await content2(chapter[i].itemId);
//             if(!ctx) throw new Error('Failed to fetch chapter content');

//             return {
//                 title: chapter[i++].title,
//                 content: ctx,
//                 next_link: INTERNAL_NEXT
//             };
//         }else if(urlPreg.test(url)){
//             const bookid = url.match(urlPreg)![1];
//             chapter = Object.values(await chapters(bookid)).flat();
//             const res = {
//                 title: chapter[i].title,
//                 content: await content(chapter[i].itemId),
//                 next_link: INTERNAL_NEXT
//             };
//             i++;    // to avoid i++ when error occurs
//             return res;
//         }else{
//             throw new Error("Invalid url");
//         }
//     }
// } satisfies Callback);

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
            await delay(2000 * Math.random() + 1000);

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