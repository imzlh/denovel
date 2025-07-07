import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { removeIllegalPath } from './main.ts'
import { fetch2 } from "./main.ts";

// const frontEnd = 'http://localhost:3000';
const frontEnd = 'https://fn.music.163.com/g/quickapp/xtc';
const outDir = 'musicout/';
await ensureDir(outDir);

const getPlaylist = (list: string | number) => fetch2(`${frontEnd}/playlist/detail?id=${list}`, {
        method: 'POST',
        body: JSON.stringify({
            id: list.toString(),
            limit: 1000,
        }),
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(res => res.status != 200 ? Promise.reject(new Error('歌单不存在（status=' + res.status + '）')) : res.json())
    .then(data => data.data.playlist.trackIds.map((i: { id: number }) => i.id) as number[]);
const getLyric = (id: string | number) => fetch2(`"https://music.163.com/api/song/lyric?id=${id}&lv=-1&tv=-1`)
    .then(res => res.status != 200 ? Promise.reject(new Error('歌词不存在（status=' + res.status + '）')) : res.json())
    .then(data => data.lrc.lyric);
const getSongData = (id: string | number) => fetch2(`https://music.163.com/song/media/outer/url?id=${id}`)
// const getSongsInfo = (ids: (number | string)[]) => fetch2(`${frontEnd}/getSongListByIds`, {
//     method: "POST",
//     body: JSON.stringify({
//         c: ids.map(i => ({ id: i, v: 0 }))
//     }),
//     headers: {
//         'Content-Type': 'application/json',
//         'Accept': 'application/json, text/plain, */*',
//     }
// }).then(res => res.status != 200 ? Promise.reject(new Error('歌曲文件不存在（status=' + res.status + '）')) : res.json())
//     .then(data => {
//         console.log(data);
//         return data.data as Song[];
//     });
const getSongsInfo = (id: (string | number)[]) => fetch2(`http://localhost:3000/song/detail?ids=${id.join(',')}`)
    .then(res => res.status != 200 ? Promise.reject(new Error('歌曲不存在（status=' + res.status + '）')) : res.json())
    .then(data => data.songs as Song[]);

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

if (import.meta.main) while (true) {
    const idstr = prompt("请输入歌单ID：");
    if (!idstr || !/\d+$/.test(idstr)) {
        console.log("ID格式错误(至少末尾是数字)");
        Deno.exit(1);
    }

    if (idstr.includes('song')) try {
        const songid = idstr.match(/\d+$/)![0];
        const song = (await getSongsInfo([songid]))[0];
        try {
            var lyric = await getLyric(song.id);
        } catch { }

        const songName = song.name + '-' + song.ar.map(a => a.name).join(',');

        const songctx = await getSongData(song.id);
        if (!songctx.body) throw new Error('歌曲文件下载失败： Server returned ' + songctx.status);
        const stream = await songctx.bytes();
        if (stream.length < 300 * 1024) {  // 300KB
            console.log(`歌曲${song.name}(${song.id})文件大小过小，下载失败`);
            continue;
        }

        Deno.writeFile(outDir + songName + '.mp3', stream);
        if (lyric) Deno.writeTextFile(outDir + songName + '.lrc', lyric);
        console.log(`歌曲${song.name}(${song.id})下载成功`);
        console.log('\n=========================================\n');
        continue;
    } catch (e) {
        console.log(`歌曲${idstr}获取失败：${(e as Error).message}`);
        continue;
    }

    const id = idstr!.match(/\d+$/)![0];
    const playlist = await getPlaylist(id);
    console.log(playlist);
    for (let i = 0; i < playlist.length; i += 10) {
        if(i > playlist.length + i) break;
        const details = await getSongsInfo(playlist.slice(i, i + 10));
        for (let j = 0; j < 10; j++) try{
            const song = details[j];
            try {
                var lyric = await getLyric(song.id);
            } catch { }

            const songctx = await getSongData(song.id);
            const songName = removeIllegalPath(song.name + '-' + song.ar.map(a => a.name).join(','));

            if (!songctx.body) throw new Error('歌曲文件下载失败： Server returned ' + songctx.status);
            const stream = await songctx.bytes();
            if (stream.length < 300 * 1024) {  // 300KB
                console.log(`歌曲${song.name}(${song.id})文件大小过小，下载失败`);
                continue;
            }

            Deno.writeFile(outDir + songName + '.mpeg', stream);
            if (lyric) Deno.writeTextFile(outDir + songName + '.lrc', lyric);

            const cover = await fetch2(song.al.picUrl);
            if (cover.status != 200) throw new Error('专辑封面下载失败： Server returned ' + cover.status);
            const coverStream = await cover.bytes();
            Deno.writeFile(outDir + songName + '.jpg', coverStream);

            // merge using ffmpeg
            const d = new Deno.Command('ffmpeg', {
                args: [
                    '-y',
                    '-i', outDir + songName + '.mpeg',
                    '-i', outDir + songName + '.jpg',
                    '-map', '0:0', '-map', '1:0',
                    '-c', 'copy', '-id3v2_version', '3',
                    '-metadata', 'title=' + song.name,
                    '-metadata', 'artist=' + song.ar.map(a => a.name).join(','),
                    '-metadata', 'album=' + song.al.name,
                    '-metadata', 'album_artist=' + song.ar.map(a => a.name).join(','),
                    '-metadata', 'track=' + song.no,
                    '-metadata', 'year=' + new Date(song.publishTime).getFullYear(),
                    '-metadata', 'genre=' + 'Electronic',
                    '-metadata', 'comment=' + lyric,
                    outDir + songName + '.mp3'
                ],
                stdout: 'piped',
                stderr: 'piped'
            }).outputSync();
            console.log(new TextDecoder().decode(d.stdout));
            console.log(new TextDecoder().decode(d.stderr));
            Deno.remove(outDir + songName + '.mpeg');
            Deno.remove(outDir + songName + '.jpg');

            console.log(`歌曲${song.name}(${song.id})下载成功`);
        }catch (e) {
            console.log(`歌曲${details[j]?.name}(${details[j]?.id})获取失败：${(e as Error).message}`);
        }
    }

    console.log(`歌单${id}下载完成`);
    console.log('\n===================================================\n');
}