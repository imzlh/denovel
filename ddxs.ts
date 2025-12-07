import { readFile } from 'jsr:@mirror/xlsx';
import { fetch2, setRawCookie } from "./main.ts";
import assert from "node:assert";
import { readline } from "./exe.ts";
import ProgressBar from "https://deno.land/x/progressbar@v0.2.0/progressbar.ts";
import { percentageWidget } from "https://deno.land/x/progressbar@v0.2.0/widgets.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "node:path";
import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";

function* loadXLSX(file: string) {
    const xlsx = readFile(file);
    const sheet = xlsx.Sheets[xlsx.SheetNames[0]];

    // 提取 UC下载地址
    for (const addr in sheet) {
        const cell = sheet[addr];
        if (cell.l) {
            const link = cell.l.Target.replace('drive.uc.cn', 'fast.uc.cn');
            console.log('GOT', link);
            yield link;
        }
    }
}

async function login() {
    while (true) {
        console.log('获取登录状态')
        const state = await (await fetch2('https://fast.uc.cn/api/info?fr=pc&pr=UCBrowser', {
            method: 'POST',
            body: JSON.stringify({
                st: ""
            }),
            headers: {
                'Content-Type': 'application/json',
                'x-biz-retry': '0'
            }
        })).json();
        if (state.success && state.data.nickname) {
            console.log('欢迎,', state.data.nickname);
            break;
        } else {
            console.log('你还没有登录或过期');
            const cookie = prompt('请输入cookie:');
            assert(cookie, 'cookie不能为空');
            setRawCookie('uc.cn', cookie);
        }
    }
    await fetch2('https://pc-api.uc.cn/1/clouddrive/member?entry=ft&fr=pc&pr=UCBrowser&fetch_subscribe=true&_ch=home');
}

interface IDownloadInfo {
    fids: string[];
    fids_token: string[];
    pwd_id: string;
    stoken: string;
}

async function* getLinks(info: IDownloadInfo) {
    const res = await fetch2('https://pc-api.uc.cn/1/clouddrive/file/download?entry=ft&fr=pc&pr=UCBrowser', {
        body: JSON.stringify(info),
        headers: {
            'Content-Type': 'application/json',
            'x-biz-retry': '0'
        },
        method: 'POST'
    }).then(res => res.json());
    if (res.status == 200) {
        for (const file of res.data) {
            const { download_url, file_name } = file;
            yield { url: new URL(download_url, 'https://fast.uc.cn'), name: file_name };
        }
    } else {
        throw new Error('获取下载链接失败:' + res.message);
    }
}

function extractID(url: URL) {
    // https://fast.uc.cn/s/1c00a5f126f74#/list/share
    const id = url.pathname.match(/\/s\/([a-zA-Z0-9]+)\/?$/i);
    if (!id) throw new Error('Invalid URL');
    return id[1];
}

async function getToken(id: string) {
    const res = await fetch2('https://pc-api.uc.cn/1/clouddrive/share/sharepage/token?entry=ft&fr=pc&pr=UCBrowser', {
        method: 'POST',
        body: JSON.stringify({
            "pwd_id": id,
            "passcode": "",
            "share_for_transfer": true
        }),
        headers: {
            'Content-Type': 'application/json',
            'x-biz-retry': '0'
        }
    }).then(res => res.json());
    assert(res.status == 200, '获取分享页面token失败');
    return res.data.stoken;
}

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
    extra: string;
    source: string;
    file_source: string;
    name_space: number;
    l_shot_at: number;
    source_display: string;
    series_dir: boolean;
    album_dir: boolean;
    more_than_one_layer: boolean;
    upload_camera_root_dir: boolean;
    fps: number;
    like: number;
    operated_at: number;
    risk_type: number;
    tag_list: string[];
    backup_sign: number;
    obj_category: string;
    file_name_hl_start: number;
    file_name_hl_end: number;
    file_struct: {
        platform_source: string;
    };
    duration: number;
    last_play_info: {
        time: number;
    };
    event_extra: {
        recent_created_at: number;
    };
    scrape_status: number;
    update_view_at: number;
    last_update_at: number;
    share_fid_token: string;
    ban: boolean;
    raw_name_space: number;
    cur_version_or_default: number;
    save_as_source: boolean;
    offline_source: boolean;
    backup_source: boolean;
    ensure_valid_save_as_layer: number;
    owner_drive_type_or_default: number;
    dir: boolean;
    file: boolean;
    created_at: number;
    updated_at: number;
}

async function listDir(id: string, stoken: string) {
    const url = new URL('https://pc-api.uc.cn/1/clouddrive/transfer_share/detail');
    for (const [k, v] of Object.entries({
        entry: 'ft',
        pwd_id: id,
        pdir_fid: '0',
        fetch_file_list: '1',
        passcode: '',
        _page: '1',
        _size: '50',
        _fetch_total: '1',
        _fetch_task: '1',
        _fetch_share: '1',
        _sort: 'file_type:asc,file_name:asc',
        stoken: stoken,
        fr: 'pc',
        pr: 'UCBrowser'
    })) {
        url.searchParams.append(k, v);
    }

    const res = await fetch2(url, {
        headers: {
            'x-biz-retry': '0'
        }
    }).then(res => res.json());
    assert(res.status == 200, '获取分享页面失败');
    const info = res.data.list as FileInfo[];
    return info;
}

function sizeToHuman(size: number): string {
    const units = ['B', 'K', 'M', 'G'];
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }
    return `${size.toFixed(2)}${units[unit]}`;
}

async function download(url: URL, dist: string) {
    const fe = await fetch2(url);
    assert(fe.body, '下载失败: 空响应');
    const size = parseInt(fe.headers.get('Content-Length') ?? '0');
    assert(size, '下载失败: 无Content-Length');

    const fh = await Deno.open(dist, { create: true, write: true });

    const startTime = Date.now();
    const prog = new ProgressBar({
        total: size,
        widgets: [
            percentageWidget,
            (i, t) => `${sizeToHuman(i)}/${sizeToHuman(t)}`,
            // 速度
            (i, _t) => `${sizeToHuman((i / (Date.now() - startTime)) * 1000)}/s`,
        ]
    });

    let cur = 0;
    const stream = new TransformStream<Uint8Array<ArrayBufferLike>>({
        transform(chunk, ctrl) {
            cur += chunk.byteLength;
            prog.update(chunk.byteLength);
            ctrl.enqueue(chunk);
        }
    });

    fe.body!.pipeTo(stream.writable);
    await stream.readable.pipeTo(fh.writable);

    fh.close();
    await prog.finish();
}

const outDir = Deno.args[1] || 'ucdown';
await ensureDir(outDir);
if (import.meta.main) {
    await login();
    for (const link of loadXLSX(Deno.args[0] ?? 'e:\\docs\\Downloads\\点点 小说.xlsx')) try{
        const id = extractID(new URL(link));
        const stoken = await getToken(id);
        console.log('LIST', id, 'token=' + stoken);
        const info = (await listDir(id, stoken)).filter(i => i.file);
        for await (const link of getLinks({
            fids: info.map(i => i.fid),
            fids_token: info.map(i => i.share_fid_token),
            pwd_id: id,
            stoken: stoken
        })) {
            console.log('DOWNLOAD', link.name);
            const fe = await fetch2(link.url);
            if(!fe.ok) {
                console.log(await fe.text());
                throw new Error(`下载失败: ${fe.status} ${fe.statusText}`);
            }
            await download(link.url, join(outDir, link.name));
        }
        await delay(642 + Math.random() * 1000);
    } catch (e) {
        console.error(e);
    }
}