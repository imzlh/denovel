import { normalize } from 'https://deno.land/std/path/normalize.ts'
import { parseArgs } from "https://deno.land/std/cli/parse_args.ts";

export async function* tree(dir:string,preg:RegExp,deep = true):AsyncGenerator<string>{
    try{
        for await (const fd of Deno.readDir(dir)) {
            if(fd.name.startsWith('$') || fd.name.startsWith('.'))
                continue;
            const path = normalize(dir + '/' + fd.name);
            if(fd.isDirectory){
                if(deep) yield* tree(path,preg);
            }else if(fd.isFile && preg.test(fd.name))
                yield path;
        }
    }catch{
        console.warn('扫描',dir,'出错');
    }
}

export async function xtree(dir:string,preg:RegExp,deep = true,callback:(i:number,path:string) => void | Promise<void>):Promise<void>{
    let i = 1;
    try{
        for await (const fd of Deno.readDir(dir)) {
            if(fd.name.startsWith('$') || fd.name.startsWith('.'))
                continue;
            const path = normalize(dir + '/' + fd.name);
            if(fd.isDirectory){
                if(deep) xtree(path,preg,deep,callback);
            }else if(fd.isFile && preg.test(fd.name))
                try{
                    await callback(i ++,path);
                }catch(e){
                    console.warn('调整错误',(e as Error).message);
                }
        }
    }catch{
        console.warn('扫描',dir,'出错');
    }
}

export function replaceFmt(from:string,to:string){
    const pos = from.lastIndexOf('.');
    return from.substring(0,pos + 1) + to;
}

export function replaceName(from:string,to:string){
    const pos1 = from.replaceAll('\\','/').lastIndexOf('/'),
        pos2 = from.lastIndexOf('.');
    return from.substring(0,pos1 + 1) + to + from.substring(pos2);
}

export async function readline(){
    const str = [],
        wrap = new TextEncoder().encode('\r\n');
    while(true){
        const buffer = new Uint8Array(1);
        if(await Deno.stdin.read(buffer) != 1)
            continue;
        if(buffer[0] == wrap[0] || buffer[0] == wrap[1])
            return new TextDecoder().decode(new Uint8Array(str));
        else str.push(buffer[0]);
    }
}

export async function ensure(message:string){
    const msg = new TextEncoder().encode(message + '(y/n) >>>');
    Deno.stdout.write(msg);
    return (await readline()).trim().toLowerCase() == 'y';
}

export function parseCueSheet(cueContent: string) {
    const lines = cueContent.split('\n');
    const tracks: { file: string; trackNumber: number; indexes: string[] }[] = [];

    let currentTrack: { file: string; trackNumber: number; indexes: string[] } | null = null;

    for (const line of lines) {
        const tokens = line.trim().split(/\s+/);

        if (tokens[0] === 'FILE') {
            // 提取文件名
            const fileName = tokens[1];
            // 创建新的音轨对象
            currentTrack = { file: fileName, trackNumber: 0, indexes: [] };
            tracks.push(currentTrack);
        } else if (tokens[0] === 'TRACK') {
            // 提取音轨号
            const trackNumber = parseInt(tokens[1]);
            if (currentTrack)
                currentTrack.trackNumber = trackNumber;
        } else if (tokens[0] === 'INDEX') {
            // 提取索引时间
            const indexTime = tokens[2];
            if (currentTrack) {
                currentTrack.indexes.push(indexTime);
            }
        }
    }
    return tracks;
}

export const arg = parseArgs(Deno.args);

export function help(help:string){
    if(!arg.help) return;
    console.log(help);
    Deno.exit(0);
}