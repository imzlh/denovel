import { join } from "node:path";
import { fetch2, setRawCookie } from './main.ts';
import { readline } from './exe.ts'
import { existsSync } from "node:fs";
import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { ensure } from "./_dep.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

interface FileInfo {
    fid: string;
    file_name: string;
    pdir_fid: string;
    category: number;
    file_type: number;
    size: number;
    format_type: string;
    status: number;
    tags: string;
    l_created_at: number;
    l_updated_at: number;
    source: string;
    file_source: string;
    name_space: number;
    source_display: string;
    more_than_one_layer: boolean;
    fps: number;
    like: number;
    operated_at: number;
    risk_type: number;
    tag_list: string[];
    obj_category: string;
    file_struct: {
        fir_source: string;
        sec_source: string;
        thi_source: string;
        platform_source: string;
    };
    save_as_source: boolean;
    dir: boolean;
    file: boolean;
    created_at: number;
    updated_at: number;

    download_url: string;
}


const API = {
    list: 'https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&uc_param_str=&pdir_fid={{fid}}&_page=1&_size=1000&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,updated_at:desc',
    // POST，{"fids":["8be71cfaee614676b1a847f9371ea285"]}
    download: 'https://drive-pc.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc&uc_param_str=',
    name: 'https://pan.quark.cn/account/info?fr=pc&platform=pc'
}

async function downloadFiles(files: FileInfo[], outputDir: string){
    const fids = JSON.stringify({fids: files.map(f => f.fid)});

    const res = await fetch2(API.download, {
        method: 'POST',
        body: fids,
        headers: {
            'Content-Type': 'application/json'  
        }
    }).then(res => res.json());
    if(0 != res.code) {
        console.error(`download failed: ${res.message}`);
        return;
    }

    const coPoll = [] as Promise<void>[];
    for(const file of res.data as FileInfo[]){
        if(!file.file) continue;
        if(coPoll.length >= 8){
            await Promise.all(coPoll);
            coPoll.length = 0;
        }

        if(existsSync(join(outputDir, file.file_name))){
            console.log(`SKIP ${file.file_name}`);
            continue;
        }

        const { download_url, file_name } = file;
        const res = await fetch2(download_url);
        if(!res.ok || !res.body) {
            console.error(`download failed: ${file_name}`);
            continue;
        }
        // async write file
        console.log(`DOWN ${file_name}`);
        coPoll.push(Deno.writeFile(join(outputDir, file_name), res.body!)
            .then(() => console.log(`SAVED ${file_name}`))
            .catch(e => console.error(`FAILED ${file_name}`, e)));
    }
}

async function listFiles(dirID: string) {
    const res = await fetch2(API.list.replace('{{fid}}', dirID))
        .then(res => res.json());
    if(0 != res.code) {
        console.error(`list failed: ${res.message}`);
        return [];
    }
    return res.data.list as FileInfo[];
}

async function listAndDownloadRecursively(dirID: string, outputDir: string) {
    const files = await listFiles(dirID);
    console.log(`LIST ${dirID} ${files.length} files`);
    await ensureDir(outputDir);
    await downloadFiles(files, outputDir);

    await delay(1000 + Math.random() * 1000);
    for(const file of files){
        if(file.dir){
            await listAndDownloadRecursively(file.fid, join(outputDir, file.file_name));
        }
    }
}

async function checkLogin() {
    const name = await fetch2(API.name).then(res => res.json());
    if(!name.data.nickname){
        console.error('未登录，请先登录');
        return false;
    }else{
        console.log(`已登录，欢迎 ${name.data.nickname}`);
        return true;
    }
}

async function main() {
    while(!await checkLogin()){
        console.log('请输入cookie以登录');
        const cookie = prompt("请输入cookie >");
        if(!cookie) return;
        setRawCookie('quark.cn', cookie);
        console.log('尝试拉取登录状态...')
    }

    const dirID = await readline("输入文件夹ID，默认根目录 >") ?? '0';
    const outputDir = Deno.realPathSync(await readline("输入输出目录，默认当前目录 >"))
       ?? join(Deno.cwd(), 'qkout');
    await listAndDownloadRecursively(dirID, outputDir);
}

if (import.meta.main) main();