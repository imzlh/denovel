import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { getDocument } from "./main.ts";

const ENTRY_LINK = "https://17c.com",
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
let history: string[] = [];
try{
    history = JSON.parse(Deno.readTextFileSync('history.json'));
}catch{}

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

const [raw_host, addr_base] = await (async function() {
    if(typeof Deno.args[0] == 'string') return [Deno.args[0], new URL(Deno.args[0])];

    const addr0 = await handleRedirect((await getDocument(ENTRY_LINK, undefined, undefined, true)).getElementsByTagName('script')[0].innerHTML),
        addr1 = (await getDocument(addr0, undefined, undefined, true)).querySelector('a[href]')!.getAttribute('href')!,
        addr2 = (await getDocument(addr1, undefined, undefined, true)).querySelector('#main > div:nth-child(2) > p:nth-child(3) > font')!.innerHTML!,
        ctx = (await getDocument(addr2, undefined, undefined, true)).querySelector('script')?.innerHTML!,
        addr = new URL(await handleRedirect(ctx));

    // 尝试源IP
    try{
        await fetch(addr);
    }catch{
        addr.hostname = (await Deno.resolveDns(addr.hostname, 'A'))[0];
    }

    return [addr.hostname, addr];
})();

async function getAllLinks(page: string | URL) {
    const pageCtx = (await getDocument(page, undefined, { host: raw_host })).querySelectorAll('a[href] > .rank-title');
    console.log('Got', pageCtx.length, 'links');
    return Array.from(pageCtx)
        .filter(each => each.getAttribute('target') != "_blank")
        .map(ctx => new URL(ctx.parentElement!.getAttribute('href')!, page));
}

async function search(keywords: string, page = '0') {
    const url = new URL(SEARCH_PATH
        .replace('{search}', encodeURIComponent(keywords))
        .replace('{page}', page)    
    , addr_base);
    return await getAllLinks(url);
}

async function getM3U8(play: string | URL){
    const doc = (await getDocument(play, undefined, { Host: raw_host })).getElementsByTagName('script')
        .filter(scr => scr.innerHTML.includes('m3u8') && scr.innerHTML.includes('getFileIds()'))[0]
        .innerText!,
        [, sl] = doc.match(/sl\s*\:\s*\"(.+)\"/)!;
    
    return decodeURIComponent(sl.split('').map(char => DECODE_MAPPER[char] ?? char).join(''));
}

async function download(m3u8: string, out: string) {
    return new Deno.Command('ffmpeg', {
        args: [
            '-n',
            '-i', m3u8,
            '-c:a', 'copy',
            '-c:v', 'copy',
            out
        ],
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'null'
    }).output();
}

const COMMANDS: Record<string, (this: any, ...args: string[]) => any | Promise<any>> = {
    search,
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
            if(history.includes(item)){
                if(prompt(`\n\n${item} 已经下载过了，是否重新下载？(y/n) > `)){
                    continue;
                }
            }

            const m3 = (await getM3U8(item)).trim();
            await download(m3, outpath + '/' + crypto.randomUUID() + '.mp4');
            console.log('\n\n下载视频', item ,'成功！！！\n\n');
            history.push(m3);
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

if(import.meta.main){
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

Deno.addSignalListener("SIGTERM", function(){
    // 保存
    Deno.writeTextFileSync('history.json', JSON.stringify(history));
    console.log('History saved');
    Deno.exit(0);
})