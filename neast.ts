import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { removeIllegalPath } from './main.ts'
import { fetch2 } from "./main.ts";
import { readline } from "./exe.ts";

const API_BASE = 'http://192.168.1.2:3000';
const outDir = 'musicout/';
await ensureDir(outDir);

// 颜色输出
const colors = {
    reset: '\x1b[0m', bright: '\x1b[1m', green: '\x1b[32m',
    red: '\x1b[31m', yellow: '\x1b[33m', blue: '\x1b[34m',
    cyan: '\x1b[36m', magenta: '\x1b[35m',
};

const log = {
    success: (msg: string) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
    error: (msg: string) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
    warning: (msg: string) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
    info: (msg: string) => console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`),
    title: (msg: string) => console.log(`${colors.bright}${colors.blue}${msg}${colors.reset}`),
};

// 接口定义
interface Song {
    name: string; id: number;
    ar: { id: number; name: string; }[];
    al: { id: number; name: string; picUrl: string; };
    dt: number; no: number; publishTime: number;
}

interface Artist {
    id: number; name: string; picUrl: string;
    albumSize: number; musicSize: number;
}

interface Album {
    id: number; name: string; picUrl: string;
    publishTime: number; size: number;
}

interface DownloadStats {
    total: number; success: number; failed: number;
}

// API 调用
const api = {
    getPlaylist: (id: string | number) =>
        fetch2(`${API_BASE}/playlist/detail?id=${id}`)
            .then(res => res.json())
            .then(data => ({
                name: data.playlist.name,
                creator: data.playlist.creator.nickname,
                description: data.playlist.description,
                trackIds: data.playlist.trackIds.map((i: any) => i.id),
                tags: data.playlist.tags
            })),

    getLyric: (id: string | number) =>
        fetch2(`${API_BASE}/lyric?id=${id}`)
            .then(res => res.json())
            .then(data => mergeLrc(data.lrc?.lyric, data.tlyric?.lyric))
            .catch(() => undefined),

    getSongData: (id: string | number) =>
        fetch2(`https://music.163.com/song/media/outer/url?id=${id}`),

    getSongsInfo: (ids: (string | number)[]) =>
        fetch2(`${API_BASE}/song/detail?ids=${ids.join(',')}`)
            .then(res => res.json())
            .then(data => data.songs as Song[]),

    getArtistTopSongs: (id: string | number) =>
        fetch2(`${API_BASE}/artist/top/song?id=${id}`)
            .then(res => res.json())
            .then(data => data.songs as Song[]),

    getArtistInfo: (id: string | number) =>
        fetch2(`${API_BASE}/artists?id=${id}`)
            .then(res => res.json())
            .then(data => data.artist as Artist),

    searchArtist: (keywords: string, limit = 10) =>
        fetch2(`${API_BASE}/search?keywords=${encodeURIComponent(keywords)}&type=100&limit=${limit}`)
            .then(res => res.json())
            .then(data => data.result?.artists || []),

    searchSong: (keywords: string) =>
        fetch2(`${API_BASE}/search?keywords=${encodeURIComponent(keywords)}&type=1`)
            .then(res => res.json())
            .then(data => data.result?.songs || []),

    getArtistAlbums: async (id: string | number) => {
        let allAlbums: Album[] = [];
        let offset = 0;
        const limit = 50;
        let hasMore = true;

        while (hasMore) {
            const res = await fetch2(`${API_BASE}/artist/album?id=${id}&limit=${limit}&offset=${offset}`);
            const data = await res.json();
            allAlbums = allAlbums.concat(data.hotAlbums);
            hasMore = data.more;
            offset += limit;
        }

        return allAlbums as Album[];
    },

    getAlbumDetail: (id: string | number) =>
        fetch2(`${API_BASE}/album?id=${id}`)
            .then(res => res.json())
            .then(data => ({
                album: data.album,
                songs: data.songs as Song[]
            })),
};

export function mergeLrc(lrcA: string, lrcB: string): string {
    type Line = { t: number; raw: string; text: string };

    // 解析一行，返回 { t, raw, text }
    const parse = (raw: string): Line | null => {
        const m = raw.trim().match(/^(\[\d{2}:\d{2}\.\d{2,3}\])(.*)$/);
        if (!m) return null; // 非歌词行（如 [00:00.00] 作词：xxx）
        const [, tag, text] = m;
        const min = +tag.slice(1, 3);
        const sec = +tag.slice(4, 6);
        const ms = +tag.slice(7, -1).padEnd(3, '0'); // 兼容 2/3 位毫秒
        const t = min * 60_000 + sec * 1000 + ms;
        return { t, raw, text };
    };

    // 收集所有行
    const lines: Line[] = [...lrcA.split('\n'), ...lrcB.split('\n')]
        .map(parse)
        .filter((x): x is Line => x !== null);

    // 按时间升序，同一时间只保留第一次出现
    const seen = new Set<number>();
    const sorted = lines
        .filter((l) => {
            if (seen.has(l.t)) return false;
            seen.add(l.t);
            return true;
        })
        .sort((a, b) => a.t - b.t);

    // 拼回字符串
    return sorted.map((l) => l.raw).join('\n');
}


// 工具函数
function showProgress(current: number, total: number, songName: string) {
    const percentage = Math.floor((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    process.stdout.write(`\r${colors.cyan}[${bar}] ${percentage}% - ${songName}${colors.reset}`);
}

async function createInfoFile(folderPath: string, info: any) {
    let content = `==========================================\n`;
    content += `${info.type === 'playlist' ? '歌单' : info.type === 'artist' ? '歌手' : '专辑'}信息\n`;
    content += `==========================================\n\n`;
    content += `名称: ${info.name}\n`;
    if (info.creator) content += `创建者: ${info.creator}\n`;
    if (info.tags?.length) content += `标签: ${info.tags.join(', ')}\n`;
    if (info.description) content += `\n描述:\n${info.description}\n`;
    if (info.total) content += `\n总歌曲数: ${info.total}\n`;
    if (info.downloaded !== undefined) content += `成功下载: ${info.downloaded}\n`;
    content += `下载日期: ${new Date().toLocaleString()}\n`;
    content += `\n==========================================\n`;

    await Deno.writeTextFile(`${folderPath}/info.txt`, content);
}

// 下载单曲
async function downloadSong(song: Song, folder: string = outDir, showProgressBar = false): Promise<boolean> {
    const songName = removeIllegalPath(song.name + '-' + song.ar.map(a => a.name).join(','));

    try {
        if (showProgressBar) showProgress(0, 4, song.name);

        const lyric = await api.getLyric(song.id);
        if (showProgressBar) showProgress(1, 4, song.name);

        const songctx = await api.getSongData(song.id);
        if (!songctx.body || !songctx.ok) throw new Error(`音频下载失败`);

        const stream = await songctx.bytes();
        if (stream.length < 300 * 1024) throw new Error(`文件过小`);
        if (showProgressBar) showProgress(2, 4, song.name);

        await Deno.writeFile(folder + songName + '.mpeg', stream);

        if (song.al.picUrl) {
            const cover = await fetch2(song.al.picUrl);
            if (cover.status != 200) throw new Error('封面下载失败');
            await Deno.writeFile(folder + songName + '.jpg', await cover.bytes());
            if (showProgressBar) showProgress(3, 4, song.name);
        }
        const args = [
            '-y', '-i', folder + songName + '.mpeg', '-map', '0:0'];
        if (song.al.picUrl) args.push('-i', folder + songName + '.jpg', '-map', '1:0');
        args.push(
            '-c', 'copy', '-id3v2_version', '3',
            '-metadata', 'title=' + song.name,
            '-metadata', 'artist=' + song.ar.map(a => a.name).join(','),
            '-metadata', 'album=' + song.al.name,
            '-metadata', 'year=' + new Date(song.publishTime).getFullYear(),
            folder + songName + '.mp3'
        );

        const cmd = new Deno.Command('ffmpeg', {
            args,
            stdout: 'piped', stderr: 'piped'
        });

        await cmd.output();
        await Deno.remove(folder + songName + '.mpeg');
        if (song.al.picUrl) await Deno.remove(folder + songName + '.jpg');
        if (lyric) await Deno.writeTextFile(folder + songName + '.lrc', lyric);

        if (showProgressBar) { showProgress(4, 4, song.name); console.log(''); }
        log.success(`${song.name} - ${song.ar.map(a => a.name).join(',')}`);
        return true;
    } catch (e) {
        if (showProgressBar) console.log('');
        log.error(`${song.name} - ${(e as Error).message}`);
        return false;
    }
}

// 批量下载歌曲
async function downloadSongs(songs: Song[], folder: string, infoData?: any): Promise<DownloadStats> {
    const stats: DownloadStats = { total: songs.length, success: 0, failed: 0 };

    for (const song of songs) {
        if (await downloadSong(song, folder)) stats.success++;
        else stats.failed++;
    }

    if (infoData) {
        await createInfoFile(folder, {
            ...infoData,
            total: stats.total,
            downloaded: stats.success
        });
    }

    return stats;
}

// 显示统计信息
function showStats(title: string, stats: DownloadStats, path?: string) {
    console.log('\n' + '='.repeat(50));
    log.title(title);
    console.log('='.repeat(50));
    if (path) console.log(`保存位置: ${path}`);
    console.log(`总计: ${stats.total} 首`);
    log.success(`成功: ${stats.success} 首`);
    if (stats.failed > 0) log.error(`失败: ${stats.failed} 首`);
    console.log('='.repeat(50));
}

// 下载歌手所有专辑
async function downloadArtistAllAlbums(artistId: number, artistName: string) {
    log.info(`正在获取 ${artistName} 的所有专辑...\n`);

    const albums = await api.getArtistAlbums(artistId);
    log.info(`共找到 ${albums.length} 张专辑\n`);

    const folderName = removeIllegalPath(`歌手_${artistName}_全部专辑`);
    const folderPath = `${outDir}${folderName}/`;
    await ensureDir(folderPath);

    const totalStats: DownloadStats = { total: 0, success: 0, failed: 0 };
    const albumList: string[] = [];

    for (let i = 0; i < albums.length; i++) {
        const album = albums[i];
        console.log(`\n${colors.magenta}[${i + 1}/${albums.length}] ${album.name}${colors.reset}`);

        try {
            const { songs } = await api.getAlbumDetail(album.id);
            const stats = await downloadSongs(songs, folderPath);

            totalStats.total += stats.total;
            totalStats.success += stats.success;
            totalStats.failed += stats.failed;

            albumList.push(`${i + 1}. ${album.name} (${stats.success}/${stats.total})`);
            log.success(`完成 (${stats.success}/${stats.total})`);
        } catch (e) {
            log.error(`${album.name} - ${(e as Error).message}`);
        }
    }

    // 创建汇总文件
    await createInfoFile(folderPath, {
        type: 'artist',
        name: artistName,
        description: `全部${albums.length}张专辑\n\n` + albumList.join('\n'),
        total: totalStats.total,
        downloaded: totalStats.success
    });

    showStats(`${artistName} - 全部专辑下载完成`, totalStats, folderPath);
}

// 主菜单
function showMenu() {
    console.log('\n' + '='.repeat(60));
    log.title('🎵 网易云音乐下载器');
    console.log('='.repeat(60));
    console.log(`${colors.bright}1.${colors.reset} 搜索歌曲`);
    console.log(`${colors.bright}2.${colors.reset} 搜索歌手`);
    console.log(`${colors.bright}3.${colors.reset} 下载单曲 ${colors.magenta}(连续模式)${colors.reset}`);
    console.log(`${colors.bright}4.${colors.reset} 下载歌单`);
    console.log(`${colors.bright}5.${colors.reset} 下载专辑`);
    console.log(`${colors.bright}q.${colors.reset} 退出`);
    console.log('='.repeat(60) + '\n');
}

// 主程序
export default async function main() {
    log.info(`输出目录: ${outDir}`);
    log.info(`API 服务器: ${API_BASE}\n`);

    while (true) {
        showMenu();
        const choice = await readline("请选择 (1-5 或 q): ");

        if (choice === 'q' || choice === 'Q') {
            log.info('再见！');
            Deno.exit(0);
        }

        try {
            switch (choice) {
                case '1': while (true) { // 搜索歌曲
                    const keyword = await readline("歌曲名称: ");
                    if (!keyword) break;
                    log.info(`搜索中...\n`);
                    const results = await api.searchSong(keyword);

                    if (results.length === 0) {
                        log.warning("未找到结果");
                        break;
                    }

                    console.log(`${colors.bright}搜索结果:${colors.reset}`);
                    results.forEach((song: any, idx: number) => {
                        const artists = song.artists.map((a: any) => a.name).join(', ');
                        const duration = Math.floor(song.duration / 60000) + ':' +
                            String(Math.floor(song.duration / 1000 % 60)).padStart(2, '0');
                        console.log(`  ${idx + 1}. ${song.name} - ${artists} [${duration}]`);
                    });

                    const selection = await readline("\n选择序号 (多个用逗号分隔, all=全部): ");

                    let selectedIds: number[] = [];
                    if (selection.toLowerCase() === 'all') {
                        selectedIds = results.map((s: any) => s.id);
                    } else {
                        const indices = selection.split(',').map(s => parseInt(s.trim()) - 1);
                        selectedIds = indices
                            .filter(idx => idx >= 0 && idx < results.length)
                            .map(idx => results[idx].id);
                    }

                    if (selectedIds.length === 0) {
                        log.error("无效选择");
                        continue;
                    }

                    const songs = await api.getSongsInfo(selectedIds);
                    const stats = await downloadSongs(songs, outDir);
                    showStats('下载完成', stats);
                }; break;

                case '2': while (true) { // 搜索歌手
                    const keyword = await readline("歌手名称: ");
                    if (!keyword) break;

                    log.info(`搜索中...\n`);
                    const results = await api.searchArtist(keyword);

                    if (results.length === 0) {
                        log.warning("未找到结果");
                        break;
                    }

                    console.log(`${colors.bright}搜索结果:${colors.reset}`);
                    results.forEach((artist: any, idx: number) => {
                        console.log(`  ${idx + 1}. ${artist.name} (专辑: ${artist.albumSize})`);
                    });

                    const idx = parseInt(await readline("\n选择序号: ")) - 1;
                    if (idx < 0 || idx >= results.length) {
                        log.error("无效序号");
                        break;
                    }

                    const artist = results[idx];
                    const action = await readline("\n[1] 热门50首  [2] 全部专辑  [3] 选择专辑: ");

                    if (action === '1') {
                        const songs = await api.getArtistTopSongs(artist.id);
                        const folderName = removeIllegalPath(`歌手_${artist.name}_热门50首`);
                        const folderPath = `${outDir}${folderName}/`;
                        await ensureDir(folderPath);

                        const stats = await downloadSongs(songs, folderPath, {
                            type: 'artist',
                            name: artist.name,
                            description: '热门50首歌曲'
                        });

                        showStats(`${artist.name} - 热门50首`, stats, folderPath);
                    } else if (action === '2') {
                        await downloadArtistAllAlbums(artist.id, artist.name);
                    } else if (action === '3') {
                        const albums = await api.getArtistAlbums(artist.id);

                        console.log(`\n${colors.bright}专辑列表:${colors.reset}`);
                        albums.forEach((album, idx) => {
                            console.log(`  ${idx + 1}. ${album.name} (${album.size}首)`);
                        });

                        const albumIdx = parseInt(await readline("\n选择专辑: ")) - 1;
                        if (albumIdx < 0 || albumIdx >= albums.length) {
                            log.error("无效序号");
                            break;
                        }

                        const album = albums[albumIdx];
                        const folderName = removeIllegalPath(`专辑_${album.name}`);
                        const folderPath = `${outDir}${folderName}/`;
                        await ensureDir(folderPath);

                        const { songs } = await api.getAlbumDetail(album.id);
                        const stats = await downloadSongs(songs, folderPath, {
                            type: 'album',
                            name: album.name,
                            creator: artist.name
                        });

                        showStats(album.name, stats, folderPath);
                    }
                }; break;

                case '3': while (true) { // 下载单曲
                    const input = await readline("歌曲ID (0=退出): ");
                    if (input === '0') break;

                    while (true) {
                        const input = await readline("歌曲ID (0=退出): ");
                        if (input === '0') break;

                        const id = input.match(/\d+/)?.[0];
                        if (!id) {
                            log.error("无效ID");
                            continue;
                        }

                        const songs = await api.getSongsInfo([id]);
                        if (songs.length > 0) {
                            await downloadSong(songs[0], outDir, true);
                        }
                        console.log('');
                    }
                }; break;

                case '4': while (true) { // 下载歌单
                    const input = await readline("歌单ID: ");
                    const id = input.match(/\d+/)?.[0];
                    if (!id) {
                        log.error("无效ID");
                        break;
                    }

                    log.info(`获取歌单信息...\n`);
                    const playlist = await api.getPlaylist(id);

                    const folderName = removeIllegalPath(`歌单_${playlist.name}`);
                    const folderPath = `${outDir}${folderName}/`;
                    await ensureDir(folderPath);

                    log.info(`歌单: ${playlist.name}`);
                    log.info(`歌曲数: ${playlist.trackIds.length}\n`);

                    const allSongs: Song[] = [];
                    for (let i = 0; i < playlist.trackIds.length; i += 10) {
                        const batch = playlist.trackIds.slice(i, i + 10);
                        const songs = await api.getSongsInfo(batch);
                        allSongs.push(...songs);
                    }

                    const stats = await downloadSongs(allSongs, folderPath, {
                        type: 'playlist',
                        name: playlist.name,
                        creator: playlist.creator,
                        description: playlist.description,
                        tags: playlist.tags
                    });

                    showStats(playlist.name, stats, folderPath);
                }; break;

                case '5': while (true) { // 下载专辑
                    const input = await readline("专辑ID: ");
                    const id = input.match(/\d+/)?.[0];
                    if (!id) {
                        log.error("无效ID");
                        break;
                    }

                    log.info(`获取专辑信息...\n`);
                    const { album, songs } = await api.getAlbumDetail(id);

                    const folderName = removeIllegalPath(`专辑_${album.name}`);
                    const folderPath = `${outDir}${folderName}/`;
                    await ensureDir(folderPath);

                    log.info(`专辑: ${album.name}`);
                    log.info(`歌曲数: ${songs.length}\n`);

                    const stats = await downloadSongs(songs, folderPath, {
                        type: 'album',
                        name: album.name,
                        creator: album.artist?.name
                    });

                    showStats(album.name, stats, folderPath);
                }; break;

                default:
                    log.warning("无效选项");
            }
        } catch (e) {
            log.error(`操作失败: ${(e as Error).message}`);
        }

        await readline("\n按回车继续...");
    }
}

if (import.meta.main) main();