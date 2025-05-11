import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { removeIllegalPath } from './main.ts'
import { fetch2 } from "./main.ts";

const frontEnd = 'http://192.168.1.2:3000';
const outDir = 'musicout/';
await ensureDir(outDir);

const getPlaylist = (list: string | number) => fetch2(`${frontEnd}/playlist/detail?id=${list}`)
    .then(res => res.status != 200 ? Promise.reject(new Error('歌单不存在（status=' + res.status + '）')) : res.json()).then(data => data.playlist.tracks as Song[]);
const getLyric = (id: string | number) => fetch2(`${frontEnd}/lyric?id=${id}`)
    .then(res => res.status != 200 ? Promise.reject(new Error('歌词不存在（status=' + res.status + '）')) : res.json()).then(data => data.lrc.lyric);
const getSong = (id: string | number) => fetch2(`https://music.163.com/song/media/outer/url?id=${id}`)
const getDetail = (id: string | number) => fetch2(`${frontEnd}/song/detail?ids=${id}`)
    .then(res => res.status != 200 ? Promise.reject(new Error('歌曲不存在（status=' + res.status + '）')) : res.json()).then(data => data.songs[0] as Song);

interface Song {
    name: string;     // 歌名
    id: number;       // 歌曲ID
    ar: {
        id: number;
        name: string;   // 歌手名
    }[];
    alia: string[];
    al: {
        id: number;
        name: string;   // 专辑名
        picUrl: string; // 专辑封面
    };
    dt: number;
    h: {
        br: number;
        size: number;
        vd: number;
    };
    m: null;
    l: null;
    sq: {
        br: number;
        size: number;
        vd: number;
    };
    hr: null;
    a: null;
    cd: string;
    no: number;
    rtUrl: null;
    ftype: number;
    rtUrls: null;
    djId: number;
    copyright: number;
    s_id: number;
    mark: number;
    originCoverType: number;
    originSongSimpleData: null;
    tagPicList: null;
    resourceState: boolean;
    version: number;
    songJumpInfo: null;
    entertainmentTags: null;
    awardTags: null;
    displayTags: null;
    single: number;
    noCopyrightRcmd: null;
    alg: null;
    displayReason: null;
    rtype: number;
    rurl: null;
    mst: number;
    cp: number;
    mv: number;
    publishTime: number;
}

if(import.meta.main) while(true){
    const idstr = prompt("请输入歌单ID：");
    if(!idstr || !/\d+$/.test(idstr)){
        console.log("ID格式错误(至少末尾是数字)");
        Deno.exit(1);
    }

    if(idstr.includes('song')) try{
        const songid = idstr.match(/\d+$/)![0];
        const song = await getDetail(songid);
        try{
            var lyric = await getLyric(song.id);
        }catch{}

        const songName = song.name + '-' + song.ar.map(a => a.name).join(',');

        const songctx = await getSong(song.id);
        if(!songctx.body) throw new Error('歌曲文件下载失败： Server returned ' + songctx.status);
        const stream = await songctx.bytes();
        if(stream.length < 300 * 1024){  // 300KB
            console.log(`歌曲${song.name}(${song.id})文件大小过小，下载失败`);
            continue;
        }

        Deno.writeFile(outDir + songName + '.mp3', stream);
        if(lyric) Deno.writeTextFile(outDir + songName + '.lrc', lyric);
        console.log(`歌曲${song.name}(${song.id})下载成功`);
        console.log('\n=========================================\n');
        continue;
    }catch(e){
        console.log(`歌曲${idstr}获取失败：${(e as Error).message}`);
        continue;
    }

    const id = idstr!.match(/\d+$/)![0];
    const playlist = await getPlaylist(id);
    for(const song of playlist) try{
        try{
            var lyric = await getLyric(song.id);
        }catch{}

        const songctx = await getSong(song.id);
        const songName = removeIllegalPath(song.name + '-' + song.ar.map(a => a.name).join(','));

        if(!songctx.body) throw new Error('歌曲文件下载失败： Server returned ' + songctx.status);
        const stream = await songctx.bytes();
        if(stream.length < 300 * 1024){  // 300KB
            console.log(`歌曲${song.name}(${song.id})文件大小过小，下载失败`);
            continue;
        }

        Deno.writeFile(outDir + songName + '.mp3', stream);
        if(lyric) Deno.writeTextFile(outDir + songName + '.lrc', lyric);
        console.log(`歌曲${song.name}(${song.id})下载成功`);
    }catch(e){
        console.log(`歌曲${song.name}(${song.id})获取失败：${(e as Error).message}`);
    }

    console.log(`歌单${id}下载完成`);
    console.log('\n===================================================\n');
}