import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { getDocument, removeIllegalPath, fetch2 } from "./main.ts";
import pageCache from './static/17c.html' with { type: "text" };
import { ensureFile } from "jsr:@std/fs@^1.0.17";

const ENTRY_LINK = "https://17c.com",
    APP_ENTRY_LINK = "https://www.17capp2.com:6688/100.html",
    SEARCH_PATH = "/search/0.html?keyword={search}&page={page}",
    DECODE_MAPPER: Record<string | number, string> = {
        'e': 'P',
        'w': 'D',
        'T': 'y',
        '+': 'J',
        'l': '!',
        't': 'L',
        'E': 'E',
        '@': '2',
        'd': 'a',
        'b': '%',
        'q': 'l',
        'X': 'v',
        '~': 'R',
        0x5: 'r',
        '&': 'X',
        'C': 'j',
        ']': 'F',
        'a': ')',
        '^': 'm',
        ',': '~',
        '}': '1',
        'x': 'C',
        'c': '(',
        'G': '@',
        'h': 'h',
        '.': '*',
        'L': 's',
        '=': ',',
        'p': 'g',
        'I': 'Q',
        0x1: '7',
        '_': 'u',
        'K': '6',
        'F': 't',
        0x2: 'n',
        0x8: '=',
        'k': 'G',
        'Z': ']',
        ')': 'b',
        'P': '}',
        'B': 'U',
        'S': 'k',
        0x6: 'i',
        'g': ':',
        'N': 'N',
        'i': 'S',
        '%': '+',
        '-': 'Y',
        '?': '|',
        0x4: 'z',
        '*': '-',
        0x3: '^',
        '[': '{',
        '(': 'c',
        'u': 'B',
        'y': 'M',
        'U': 'Z',
        'H': '[',
        'z': 'K',
        0x9: 'H',
        0x7: 'f',
        'R': 'x',
        'v': '&',
        '!': ';',
        'M': '_',
        'Q': '9',
        'Y': 'e',
        'o': '4',
        'r': 'A',
        'm': '.',
        'O': 'o',
        'V': 'W',
        'J': 'p',
        'f': 'd',
        ':': 'q',
        '{': '8',
        'W': 'I',
        'j': '?',
        'n': '5',
        's': '3',
        '|': 'T',
        'A': 'V',
        'D': 'w',
        ';': 'O'
    };
await ensureFile('history.json');
const history = {
    get value(){
        const res = JSON.parse(Deno.readTextFileSync('history.json') || '[]') as string[];
        return new Proxy(res, {
            set(target, p, value, receiver){
                target[parseInt(p as string)] = value;
                Deno.writeTextFileSync('history.json', JSON.stringify(target));
                return true;
            }
        });
    },

    set value(val: string[]){
        Deno.writeTextFileSync('history.json', JSON.stringify(val));
        console.log('history updated');
    }
}

function handleRedirect(nagCode: string){
    const
        location = {
            set href(val: string){
                _rs(val);
            },
            replace(val: string){
                _rs(val);
            }
        },
        // deno-lint-ignore no-unused-vars
        window = { location };

    let _rs: (val: string) => void;
    const prom = new Promise<string>(rs => _rs = rs);

    eval(nagCode);

    return prom;
}

// const [raw_host, addr_base] = await (async function() {
//     if(typeof Deno.args[0] == 'string') return [Deno.args[0], new URL(Deno.args[0])];

//     const addr0 = await handleRedirect((await getDocument(ENTRY_LINK, undefined, undefined, true)).getElementsByTagName('script')[0].innerHTML),
//         addr1 = (await getDocument(addr0, undefined, undefined, true)).querySelector('a[href]')!.getAttribute('href')!,
//         addr2 = (await getDocument(addr1, undefined, undefined, true)).querySelector('body > div:nth-child(2) > div > b:nth-child(2)')!.innerHTML!,
//         ctx = (await getDocument(addr2, undefined, undefined, true)).querySelector('script')?.innerHTML!,
//         addr = new URL(await handleRedirect(ctx));

//     // 尝试源IP
//     try{
//         await fetch(addr);
//     }catch{
//         addr.hostname = (await Deno.resolveDns(addr.hostname, 'A'))[0];
//     }

//     return [addr.hostname, addr];
// })();

const [raw_host, addr_base] = await (async function(){
    const doc = await getDocument(APP_ENTRY_LINK);
    const addr = doc.querySelector('iframe[src]')!.getAttribute('src')!;
    const aurl = new URL(addr, APP_ENTRY_LINK);
    return [aurl.hostname, aurl];
})();

async function getAllLinks(page: string | URL, totalRef?: { value: number }) {
    const doc = await getDocument(page, undefined, { host: raw_host });
    const pageCtx = doc.querySelectorAll('div.content-box div.ran-box div a[href]');
    console.log('Got', pageCtx.length, 'links');
    if(totalRef){
        const total = doc.querySelector('body > div.content-box > div > div > div.ran-box > div.pagination-box > ul > li:last-child > div');
        // 1/32
        const totalStr = total?.innerText.split('/')[1].trim();
        totalRef.value = totalStr ? parseInt(totalStr) : 1;
    }
    return Array.from(pageCtx)
        .filter(each => each.getAttribute('target') != "_blank" && each.getAttribute('href')?.includes('videoplay'))
        .map(ctx => new URL(ctx.getAttribute('href')!, page));
}

async function search(keywords: string, page = '0', totalRef?: { value: number }) {
    const url = new URL(SEARCH_PATH
        .replace('{search}', encodeURIComponent(keywords))
        .replace('{page}', page)    
    , addr_base);
    return await getAllLinks(url, totalRef);
}

function decodeImage(input: Uint8Array): Uint8Array {
    const dec_base = 0x88;
    const output = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
        output[i] = input[i] ^ dec_base;
    }
    return output;
}


/**
 * return [m3u8, title, thumbnail]
 */
async function getM3U8(play: string | URL){
    // console.log('Getting m3u8 of', String(play));
    const document = await getDocument(play, undefined, { Host: raw_host });
    const doc = document.getElementsByTagName('script')
        .filter(scr => scr.innerHTML.includes('m3u8') && scr.innerHTML.includes('getFileIds()'))[0]
        .innerText!,
        [, sl] = doc.match(/sl\s*\:\s*\"(.+)\"/)!,
        [, encryptUrl] = doc.match(/encryptUrl\s*\:\s*\"(.+)\"\s*/)!;

    const imgres = new URL(encryptUrl, play).href;
    
    return [
        decodeURIComponent(sl.split('').map(char => DECODE_MAPPER[char] ?? char).join('')).trim()!,
        document.querySelector('body > div.content-box > div:nth-child(1) > div.ran-box > div.video-title')?.innerText.trim(),
        imgres
    ] as [string, string, string];
}

function download(m3u8: string, out: string) {
    return new Deno.Command('ffmpeg', {
        args: [
            '-n',
            '-i', m3u8,
            '-c:a', 'copy',
            '-c:v', 'copy',
            removeIllegalPath(out)
        ],
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'null'
    });
}

async function downloadAsync(m3u8: string, out: string, os: WebSocket) {
    const ffmpeg = new Deno.Command('ffmpeg', {
        args: [
            '-n',
            '-i', m3u8,
            '-c:a', 'copy',
            '-c:v', 'copy',
            out
        ],
        stderr: 'piped',
        stdout: 'piped',
        stdin: 'null'
    }).spawn();

    await Promise.all([
        (async function() {
            const er = ffmpeg.stderr.getReader();
            let closed = false;
            er.closed.then(() => closed = true);
            while(!closed){
                const chunk = await er.read();
                if(chunk.value){
                    os.send(chunk.value);
                }
            }
        })(),
        (async function() {
            const or = ffmpeg.stdout.getReader();
            let closed = false;
            or.closed.then(() => closed = true);
            while(!closed){
                const chunk = await or.read();
                if(chunk.value){
                    os.send(chunk.value);
                }
            }
        })()
    ]);
    return ffmpeg.status;
}

const COMMANDS: Record<string, (this: any, ...args: string[]) => any | Promise<any>> = {
    search: search as any,
    main(){
        return getAllLinks(addr_base);
    },
    async download(orig = 'all', outpath = 'out/'){
        await ensureDir(outpath);
        let ref = this as string[];
        if(!Array.isArray(ref)) throw new Error('先获取链接');

        if(orig != 'all'){
            const match = orig.match(/^(\d+)(:(\d+))?$/);
            if(!match) throw new Error('范围格式不正确');

            ref = ref.slice(parseInt(match[1]), match[2] ? parseInt(match[2]) : undefined);
        }

        for(const item of ref)try{
            if(history.value.includes(item)){
                if(prompt(`\n\n${item} 已经下载过了，是否重新下载？(y/n) > `)){
                    continue;
                }
            }

            const [m3, title] = await getM3U8(item);
            download(m3, outpath + '/' + removeIllegalPath(title) + '.mp4');
            console.log('\n\n下载视频', title ,'成功！！！\n\n');
            history.value.push(m3);
        }catch(e){
            console.error('下载视频', item ,'失败！！！\n\n', e);
        }
    },
    set(){
        return Array.from(arguments);
    },
    echo(){
        console.log('MAIN:', addr_base);
        console.log((this instanceof Array) ? this.map(a => a.href) : this);
    }
}

async function consoleMain(){
    let resCache;

    while(true){
        console.log('\n');
        const command = prompt(' >> ');
        if(!command?.trim()) continue;

        const args = command.split(/\s+/),
            action = args.shift()!;

        if(action in COMMANDS) try{
            resCache = await COMMANDS[action].apply(resCache, args);
        }catch(e){
            console.error(e);
        }
    }
}

interface VideoInfo {
    id: string;
    title: string;
    m3u8: string;
    thumbnail: string;
}

async function serverMain(){
    // if(!await exists('17cache.json')) await Deno.writeTextFile('17cache.json', '{}');
    const contentDB = await Deno.openKv("./17cache.db");
    // const contentCache: Record<string, VideoInfo> = JSON.parse(Deno.readTextFileSync('17cache.json') || '{}');

    await ensureDir('webo');

    async function getInfo(video: string | URL) {
        const id = typeof video == 'string' ? video : new URL(video).searchParams.get('vid')!;
        const _cache = (await contentDB.get([id])).value;
        if(_cache) return processInfo(_cache as VideoInfo);
        console.log('Cache not hit', id);
        const [m3, title, thumb] = await getM3U8(video);
        // https://www.uhsuvpj.com:2096/videoplay/0.html?category_id=1&category_child_id=14&vid=218829
        const res = { id, title, m3u8: m3, thumbnail: thumb };
        contentDB.set([id], res);
        return processInfo(res);
    } 

    async function processInfo(info: VideoInfo) {
        return {
            ...info,
            thumbnail: "/api/thumb?src=" + encodeURIComponent(info.thumbnail)
        }
    }

    const server = Deno.serve({
        'hostname': '[::]',
        'port': 8088
    }, async function(req, addr){
        const url = new URL(req.url, 'http://localhost:8088/');
        console.log(req.method, req.url);

        let ret: any;
        switch(url.pathname){
            /**
             * 获取缩略图
             * /api/thumb
             */
            case '/api/thumb':{
                const src = url.searchParams.get('src');
                if(!src) throw new Error('缺少参数');

                const realdata = await (await fetch2(decodeURIComponent(src))).bytes();
                const data = decodeImage(realdata);
                return new Response(data, {
                    headers: {
                        'Content-Type': 'image/jpeg',
                        'Cache-Control': 'public, max-age=31536000'
                    }
                });
            }

            /**
             * 2. 搜索视频

                接口: GET /api/search?q=关键词
                返回格式: 与视频列表相同

                json{
                "videos": [
                    {
                    "id": "video_001",
                    "title": "示例视频标题",
                    "m3u8": "https://example.com/video.m3u8",
                    "thumbnail": "https://example.com/thumb.jpg"
                    }
                ],
                "total": 1000,
                "totalPages": 50,
                "currentPage": 1
                }
             */
            case '/api/search':{
                const q = url.searchParams.get('q'), p = url.searchParams.get('p') || '1';
                if(!q) throw new Error('缺少参数');
                const tref = { value: 1 };
                const sr = await search(q, p, tref);
                const res = [] as VideoInfo[];
                for(const video of sr){
                    res.push(await getInfo(video));
                }
                ret = {
                    videos: res,
                    total: res.length,
                    totalPages: tref.value,
                    currentPage: parseInt(p)
                }
            } break;

            /**
             * 1. 获取视频列表（带分页）

                接口: GET /api/videos?p={page}
                返回格式:

                json{
                "videos": [
                    {
                    "id": "video_001",
                    "title": "示例视频标题",
                    "m3u8": "https://example.com/video.m3u8",
                    "thumbnail": "https://example.com/thumb.jpg"
                    }
                ],
                "total": 1000,
                "totalPages": 50,
                "currentPage": 1
                }
             */
            case '/api/videos':{
                const p = url.searchParams.get('p') || '0';
                const videos = await getAllLinks(addr_base);
                const res = {
                    videos: [] as VideoInfo[],
                    total: videos.length,
                    totalPages: 1,
                    currentPage: 1
                };
                for(const video of videos){
                    res.videos.push(await getInfo(video));
                }
                ret = res;
            } break;

            default:
                // ws://localhost:8080/download/{video_id}
                if(url.pathname.match(/^\/download\/(\d+)$/)){
                    const id = parseInt(url.pathname.match(/^\/download\/(\d+)$/)![1]);
                    const item = await getInfo(id.toString()),
                        url2 = item.m3u8;

                    console.log('Downloading', item.title);
                    const { response, socket } = Deno.upgradeWebSocket(req);
                    socket.onopen = function(){
                        if(!url2){
                            socket.send(`\x1b[31m视频 ${id} 不存在\x1b[0m\n`);
                            return socket.close();
                        }

                        // check if file exists
                        if(history.value.includes(url2)){
                            socket.send(`\x1b[31m视频 ${id} 已经下载过了\x1b[0m\n`);
                            return socket.close();
                        }

                        downloadAsync(url2, 'webo/' + removeIllegalPath(item.title) + '.mp4', socket)
                            .then(_ => { 
                                socket.close();
                                history.value.push(url2);
                                console.log(item.title, '下载完毕');
                            });
                    };
                    return response;
                }else{
                    return new Response(pageCache, {
                        headers: {
                            'Content-Type': 'text/html'
                        }
                    });
                }
        }

        return new Response(JSON.stringify(ret), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    });

    globalThis.onbeforeunload = () => {
        contentDB.close();
        server.shutdown();
    }
}

export default async function main(){
    if(Deno.args.includes('--server')){
        serverMain();
    }else{
        consoleMain();
    }
}
if(import.meta.main) main();