import { getDocument, fetch2, sleep } from "../main.ts";

throw new Error("没有完全完成，直到我觉得有用之前不会发布");

interface Chapter {
    chapter_id: number;
    chapter_newid: string;
    chapter_name: string;
    price: number;
    chapter_image_addr: string;
    create_time: string;
    topic_copyright: string;
    chapter_domain: string;
    rule: string;
    start_num: number;
    end_num: number;
    charge_status: string;
    is_vip: number;
    publish_time: string;
    create_date: number;
    chapter_img_list: string[];
    is_limit_days: number;
    title: string;
    slug: string;
    nextslug: string;
    images: {
        line: number;
        images: {
            url: string;
        }[];
    };
}

interface ResponseOfWebPage {
    status: number;
    message: string;
    data: {
        chapter: Chapter;
        prev_chapter: Chapter | null;
        next_chapter: Chapter | null;
    };
}

async function getEverything(url: string){

    const document = await getDocument(url, undefined, undefined, false, true);
    const t = document.getElementById("chapterContent");
    if (t) {
        const n = t.dataset.ms
            , o = t.dataset.cs
            , m = t.dataset.ct
            , c = "https://api-get-v3.mgsearcher.com";
        if (n && o && c) {
            const d = `${c}/api/chapter/getinfo?m=${n}&c=${o}`;
            const i = document.getElementById("backManga");
            const res = await fetch(d, {
                headers: {
                    "Referer": "https://baozimh.org/",
                    "Origin": "https://baozimh.org",
                    "Accept": "application/json, text/plain, */*",
                    "Sec-fetch-mode": "cors",
                    "Sec-fetch-site": "cross-site",
                }
            }).then(e => {
                if (!e.ok)
                    throw new Error("Network response was not ok");
                return e.json()
            });
            if(!res.data.info) throw new Error("Failed to get chapter info");
            return res.data.info as Chapter;
        }else{
            throw new Error("Failed to get chapter info");
        }
    }else{
        throw new Error("Page content not found");
    }
}

function* geterateLinks(chapter: Chapter) {
    const { images } = chapter;
    const prefix = images.line === 3 ? "https://t40-2-4.g-mh.online" : "https://f40-1-4.g-mh.online";
    
    for(const img of images.images){
        yield `${prefix}${img.url}`;
    }
}

function nextUrl(chapter: Chapter){
    const nextUrl = `https://baozimh.org/manga/${chapter.slug}/${chapter.nextslug}`;
    return nextUrl;
}

export default async function* main(page1: string) {
    const page = await getEverything(page1);
    yield* geterateLinks(page);
    await sleep(1);
    return [
        page.title,
        nextUrl(page)
    ];
}

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