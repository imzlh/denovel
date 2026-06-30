import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";

const API_BASE = 'http://192.168.1.2:3000';
const outDir = 'musicout/';
await ensureDir(outDir);

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

interface AudioSource {
    url: string;
    type: string;
    size: number;
    level: string;
    br: number;
}

let currentCookie = "";

async function login() {
    log.info("请输入网易云音乐 Cookie（包含 MUSIC_U）：");
    const cookie = prompt("Cookie: ");
    if (!cookie.trim()) {
        log.warning("未输入Cookie，将以游客模式运行");
        return;
    }

    currentCookie = cookie.trim();
    await Deno.writeTextFile('netease.cookie', cookie);
}

async function updateLoginStatus() {
    try {
        const res = await fetch(`${API_BASE}/login/status`, {
            headers: {
                Cookie: currentCookie
            }
        });
        const data = await res.json();
        if (data.data?.profile) {
            log.success(`登录成功: ${data.data.profile.nickname}`);
        } else {
            log.warning("Cookie可能无效");
            console.log(data)
        }
    } catch (e) {
        log.warning("无法验证登录状态");
        console.log(e);
    }
}

const api = {
    getPlaylist: (id: string | number) =>
        fetch(`${API_BASE}/playlist/detail?id=${id}`, {
            headers: {
                Cookie: currentCookie
            }
        })
            .then(res => res.json())
            .then(data => ({
                name: data.playlist.name,
                creator: data.playlist.creator.nickname,
                description: data.playlist.description,
                trackIds: data.playlist.trackIds.map((i: any) => i.id),
                tags: data.playlist.tags
            })),

    getLyric: (id: string | number) =>
        fetch(`${API_BASE}/lyric?id=${id}`)
            .then(res => res.json())
            .then(data => mergeLrc(data.lrc?.lyric, data.tlyric?.lyric))
            .catch(() => undefined),

    getAudioSource: async (id: number): Promise<AudioSource | null> => {
        const levels = [
            // { level: "lossless", name: "无损" },
            // { level: "exhigh", name: "极高" },
            // { level: "higher", name: "较高" },
            { level: "standard", name: "标准" }
        ];

        for (const { level, name } of levels) {
            try {
                const res = await fetch(`${API_BASE}/song/url/v1?id=${id}&level=${level}`, {
                    headers: {
                        Cookie: currentCookie
                    }
                });
                const data = await res.json();

                if (data.data?.[0]?.url) {
                    const item = data.data[0];
                    return {
                        url: item.url,
                        type: item.type || level,
                        size: item.size || 0,
                        level: name,
                        br: item.br || 0
                    };
                }
            } catch {
                continue;
            }
        }
        return null;
    },

    getSongsInfo: (ids: (string | number)[]) =>
        fetch(`${API_BASE}/song/detail?ids=${ids.join(',')}`, {
            headers: {
                Cookie: currentCookie
            }
        })
            .then(res => res.json())
            .then(data => data.songs as Song[]),

    getArtistTopSongs: (id: string | number) =>
        fetch(`${API_BASE}/artist/top/song?id=${id}`)
            .then(res => res.json())
            .then(data => data.songs as Song[]),

    getArtistInfo: (id: string | number) =>
        fetch(`${API_BASE}/artists?id=${id}`)
            .then(res => res.json())
            .then(data => data.artist as Artist),

    searchArtist: (keywords: string, limit = 10) =>
        fetch(`${API_BASE}/search?keywords=${encodeURIComponent(keywords)}&type=100&limit=${limit}`)
            .then(res => res.json())
            .then(data => data.result?.artists || []),

    searchSong: (keywords: string) =>
        fetch(`${API_BASE}/search?keywords=${encodeURIComponent(keywords)}&type=1`)
            .then(res => res.json())
            .then(data => data.result?.songs || []),

    getArtistAlbums: async (id: string | number) => {
        let allAlbums: Album[] = [];
        let offset = 0;
        const limit = 50;
        let hasMore = true;

        while (hasMore) {
            const res = await fetch(`${API_BASE}/artist/album?id=${id}&limit=${limit}&offset=${offset}`);
            const data = await res.json();
            allAlbums = allAlbums.concat(data.hotAlbums);
            hasMore = data.more;
            offset += limit;
        }
        return allAlbums;
    },

    getAlbumDetail: (id: string | number) =>
        fetch(`${API_BASE}/album?id=${id}`)
            .then(res => res.json())
            .then(data => ({
                album: data.album,
                songs: data.songs as Song[]
            })),
};

export function mergeLrc(lrcA: string, lrcB: string): string {
    type Line = { t: number; raw: string; text: string };

    const parse = (raw: string): Line | null => {
        const m = raw.trim().match(/^(\[\d{2}:\d{2}\.\d{2,3}\])(.*)$/);
        if (!m) return null;
        const [, tag, text] = m;
        const min = +tag.slice(1, 3);
        const sec = +tag.slice(4, 6);
        const ms = +tag.slice(7, -1).padEnd(3, '0');
        const t = min * 60_000 + sec * 1000 + ms;
        return { t, raw, text };
    };

    const lines: Line[] = [...lrcA.split('\n'), ...lrcB.split('\n')]
        .map(parse)
        .filter((x): x is Line => x !== null);

    const seen = new Set<number>();
    const sorted = lines
        .filter((l) => {
            if (seen.has(l.t)) return false;
            seen.add(l.t);
            return true;
        })
        .sort((a, b) => a.t - b.t);

    return sorted.map((l) => l.raw).join('\n');
}

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


const removeIllegalPath = (path: string) => path?.replaceAll(/[\/:*?"<>|]/ig, '_');

async function downloadSong(song: Song, folder: string = outDir, showProgressBar = false): Promise<boolean> {
    const songName = removeIllegalPath(song.name + '-' + song.ar.map(a => a.name).join(','));
    const outputPath = folder + songName + '.mp3';
    let audioTempPath: string | null = null;
    let coverPath: string | null = null;

    try {
        if (showProgressBar) showProgress(0, 4, song.name);

        const [source, lyric] = await Promise.all([
            api.getAudioSource(song.id),
            api.getLyric(song.id)
        ]);

        if (!source) throw new Error("无音频链接");
        if (showProgressBar) showProgress(1, 4, song.name);

        const audioRes = await fetch(source.url);
        if (!audioRes.ok) throw new Error(`HTTP ${audioRes.status}`);

        const audioData = await audioRes.bytes();
        if (audioData.length < 1024) throw new Error("音频数据异常");

        audioTempPath = await Deno.makeTempFile({ suffix: '.tmp' });
        await Deno.writeFile(audioTempPath, audioData);

        if (showProgressBar) showProgress(2, 4, song.name);

        // 下载封面
        if (song.al.picUrl) {
            try {
                const coverRes = await fetch(song.al.picUrl);
                if (coverRes.ok) {
                    coverPath = await Deno.makeTempFile({ suffix: '.jpg' });
                    await Deno.writeFile(coverPath, await coverRes.bytes());
                }
            } catch { }
        }

        if (showProgressBar) showProgress(3, 4, song.name);

        // 构建 ffmpeg 命令：回到 MP3，纯复制音频流并在存在封面时添加图片流（ID3v2）
        let args: string[];
        if (coverPath) {
            args = [
                '-hide_banner',
                '-loglevel', 'error',
                '-i', audioTempPath,
                '-i', coverPath,
                '-map', '0:a',
                '-map', '1',
                '-c', 'copy',
                '-id3v2_version', '3',
                '-metadata', `title=${song.name}`,
                '-metadata', `artist=${song.ar.map(a => a.name).join(',')}`,
                '-metadata', `album=${song.al.name}`,
                '-metadata', `date=${new Date(song.publishTime).getFullYear()}`,
                '-disposition:v:0', 'attached_pic',
                '-y',
                outputPath
            ];
        } else {
            args = [
                '-hide_banner',
                '-loglevel', 'error',
                '-i', audioTempPath,
                '-map', '0:a:0',
                '-c', 'copy',
                '-id3v2_version', '3',
                '-metadata', `title=${song.name}`,
                '-metadata', `artist=${song.ar.map(a => a.name).join(',')}`,
                '-metadata', `album=${song.al.name}`,
                '-metadata', `date=${new Date(song.publishTime).getFullYear()}`,
                '-y',
                outputPath
            ];
        }

        // 执行 ffmpeg
        const cmd = new Deno.Command('ffmpeg', {
            args,
            stdout: 'piped',
            stderr: 'piped'
        });

        const result = await cmd.output();

        if (!result.success) {
            throw new Error(new TextDecoder().decode(result.stderr));
        }

        // 保存歌词
        if (lyric) await Deno.writeTextFile(folder + songName + '.lrc', lyric);

        if (showProgressBar) {
            showProgress(4, 4, song.name);
            console.log('');
        }

        log.success(`${song.name} [${source.level}]`);
        return true;

    } catch (e) {
        if (showProgressBar) console.log('');
        log.error(`${song.name}: ${(e as Error).message}`);
        try { await Deno.remove(outputPath); } catch { }
        return false;
    } finally {
        // 清理临时文件
        if (audioTempPath) try { await Deno.remove(audioTempPath); } catch { }
        if (coverPath) try { await Deno.remove(coverPath); } catch { }
    }
}
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

    await createInfoFile(folderPath, {
        type: 'artist',
        name: artistName,
        description: `全部${albums.length}张专辑\n\n` + albumList.join('\n'),
        total: totalStats.total,
        downloaded: totalStats.success
    });

    showStats(`${artistName} - 全部专辑下载完成`, totalStats, folderPath);
}

function showMenu() {
    console.log('\n' + '='.repeat(60));
    log.title('🎵 网易云音乐下载器 (Opus 96k)');
    console.log('='.repeat(60));
    console.log(`${colors.bright}0.${colors.reset} 登录/设置Cookie ${currentCookie ? colors.green + '[已登录]' + colors.reset : colors.yellow + '[未登录]' + colors.reset}`);
    console.log(`${colors.bright}1.${colors.reset} 搜索歌曲`);
    console.log(`${colors.bright}2.${colors.reset} 搜索歌手`);
    console.log(`${colors.bright}3.${colors.reset} 下载单曲 (连续模式)`);
    console.log(`${colors.bright}4.${colors.reset} 下载歌单`);
    console.log(`${colors.bright}5.${colors.reset} 下载专辑`);
    console.log(`${colors.bright}q.${colors.reset} 退出`);
    console.log('='.repeat(60) + '\n');
}

export default async function main() {
    log.info(`输出目录: ${outDir}`);
    log.info(`格式: Opus 96kbps`);
    log.info(`音质: 超清母带/杜比/Hi-Res/无损... (依次尝试)\n`);

    try {
        currentCookie = await Deno.readTextFile('netease.cookie');
        await updateLoginStatus();
    } catch {};

    while (true) {
        showMenu();
        const choice = prompt("请选择 (0-5 或 q): ");

        if (choice === 'q' || choice === 'Q') {
            log.info('再见！');
            Deno.exit(0);
        }

        try {
            switch (choice) {
                case '0':
                    await login();
                    await updateLoginStatus();
                    break;

                case '1': while (true) {
                    const keyword = prompt("歌曲名称: ");
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
                        console.log(`  ${idx + 1}. ${song.name} - ${artists}`);
                    });

                    const selection = prompt("\n选择序号 (多个用逗号分隔, all=全部): ");
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

                case '2': while (true) {
                    const keyword = prompt("歌手名称: ");
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

                    const idx = parseInt(prompt("\n选择序号: ")) - 1;
                    if (idx < 0 || idx >= results.length) {
                        log.error("无效序号");
                        break;
                    }

                    const artist = results[idx];
                    const action = prompt("\n[1] 热门50首  [2] 全部专辑  [3] 选择专辑: ");

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

                        const albumIdx = parseInt(prompt("\n选择专辑: ")) - 1;
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

                case '3': while (true) {
                    const input = prompt("歌曲ID (0=退出): ");
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
                }; break;

                case '4': while (true) {
                    const input = prompt("歌单ID: ");
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

                case '5': while (true) {
                    const input = prompt("专辑ID: ");
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
                    log.warning("无效选项: " + choice);
            }
        } catch (e) {
            log.error(`操作失败: ${(e as Error).message}`);
        }

        prompt("\n按回车继续...");
    }
}

if (import.meta.main) main();