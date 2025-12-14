import { ensureDir } from "jsr:@std/fs@^1.0.10/ensure-dir";
import { fetch2, removeIllegalPath } from "./main.ts";
import { readline } from "./exe.ts";

const frontEnd_api = 'localhost:3000';
const outDir = 'kugou_music/';
await ensureDir(outDir);

// 获取歌单所有歌曲 (all.json结构)
async function getPlaylistTracks(collectionId: string) {
    const response = await fetch2(`http://${frontEnd_api}/playlist/track/all?id=${collectionId}`);
    if (response.status !== 200) {
        throw new Error(`获取歌单失败: status=${response.status}`);
    }
    const data = await response.json();
    // all.json: data.data.songs数组
    return data.data.songs as KugouSong[];
}

// 获取歌曲下载链接 (new.json结构)
async function getSongUrl(hash: string) {
    const response = await fetch2(`http://${frontEnd_api}/song/url/new?hash=${hash}`);
    if (response.status !== 200) {
        throw new Error(`获取歌曲URL失败: status=${response.status}`);
    }
    const data = await response.json();
    // new.json: data.data是数组,第一个元素是主要数据
    return data.data[0];
}

interface KugouSong {
    hash: string;
    name: string;
    audio_id: number;
    album_id: string;
    singerinfo: Array<{
        id: number;
        name: string;
        avatar: string;
    }>;
    albuminfo: {
        name: string;
        id: number;
    };
    cover: string;
    publish_date: string;
    timelen: number; // 毫秒
}

interface SongUrlData {
    hash: string;
    name: string;
    singername: string;
    albumname: string;
    info: {
        filesize: number;
        extname: string;
        bitrate: number;
        duration: number;
        tracker_url?: string[];
    };
    relate_goods: Array<{
        hash: string;
        level: number; // 2=128k, 4=320k, 5=flac, 6=high
        quality: string;
        info?: {
            filesize: number;
            extname: string;
            bitrate: number;
            tracker_url?: string[];
        };
    }>;
}

// 下载单曲
async function downloadSong(song: KugouSong) {
    console.log(`开始下载: ${song.name}`);
    
    try {
        // 获取下载链接
        const urlData = await getSongUrl(song.hash) as SongUrlData;
        
        // 选择最高质量的音频
        let downloadUrl = '';
        let selectedQuality = '';
        let fileExt = 'mp3';
        
        // 优先尝试320k或flac
        for (const goods of urlData.relate_goods) {
            if (goods.level === 4 || goods.level === 5) { // 320k 或 flac
                if (goods.info?.tracker_url && goods.info.tracker_url.length > 0) {
                    downloadUrl = goods.info.tracker_url[0];
                    selectedQuality = goods.quality;
                    fileExt = goods.info.extname || 'mp3';
                    break;
                }
            }
        }
        
        // 降级到128k
        // if (!downloadUrl) {
        //     for (const goods of urlData.relate_goods) {
        //         if (goods.level === 2) {
        //             if (goods.info?.tracker_url && goods.info.tracker_url.length > 0) {
        //                 downloadUrl = goods.info.tracker_url[0];
        //                 selectedQuality = goods.quality;
        //                 fileExt = goods.info.extname || 'mp3';
        //                 break;
        //             }
        //         }
        //     }
        // }
        
        // 使用主音频源
        if (!downloadUrl && urlData.info?.tracker_url && urlData.info.tracker_url.length > 0) {
            downloadUrl = urlData.info.tracker_url[0];
            selectedQuality = 'standard';
            fileExt = urlData.info.extname || 'mp3';
        }

        // 尝试模糊查找
        if (!downloadUrl) {
            for (const goods of urlData.relate_goods) {
                if (goods.info?.tracker_url && goods.info.tracker_url.length > 0) {
                    const flacTrack = goods.info.tracker_url.find(url => url.endsWith('.flac'));
                    if (flacTrack) {
                        downloadUrl = flacTrack;
                        selectedQuality = goods.quality;
                        fileExt = 'flac';
                        break;
                    }
                    const mp3Track = goods.info.tracker_url.find(url => url.endsWith('.mp3'));
                    if (mp3Track) {
                        downloadUrl = mp3Track;
                        selectedQuality = goods.quality;
                        fileExt ='mp3';
                    }
                }
            }
        }
        
        if (!downloadUrl) {
            console.log(`歌曲 ${song.name} 无可用下载链接`);
            return;
        }
        
        // 下载音频
        const audioResponse = await fetch2(downloadUrl);
        if (!audioResponse.ok) {
            throw new Error(`下载音频失败: ${audioResponse.status}`);
        }
        
        const audioData = await audioResponse.arrayBuffer();
        if (audioData.byteLength < 100 * 1024) { // 小于100KB
            console.log(`歌曲 ${song.name} 文件大小(${audioData.byteLength})过小,下载失败`);
            return;
        }
        
        // 构建文件名 - 简化处理,使用时间戳避免冲突
        const artists = song.singerinfo.map(s => s.name).join(',');
        const safeName = removeIllegalPath(`${song.name}-${artists}`);
        
        // 下载封面
        let coverData: Uint8Array | null = null;
        if (song.cover) {
            try {
                const coverUrl = song.cover.replace('{size}', '400');
                const coverResponse = await fetch2(coverUrl);
                if (coverResponse.ok) {
                    coverData = new Uint8Array(await coverResponse.arrayBuffer());
                }
            } catch (e) {
                console.log(`  封面下载失败: ${(e as Error).message}`);
            }
        }
        
        // 使用绝对路径避免路径问题
        const tempAudioPath = Deno.cwd() + '/' + outDir + safeName + `.temp.${fileExt}`;
        const tempCoverPath = Deno.cwd() + '/' + outDir + safeName + '.temp.jpg';
        const outputPath = Deno.cwd() + '/' + outDir + safeName + '.mp3';
        
        // 保存临时音频文件
        await Deno.writeFile(tempAudioPath, new Uint8Array(audioData));
        
        // 如果有封面,使用ffmpeg合并
        if (coverData) {
            await Deno.writeFile(tempCoverPath, coverData);
            
            try {
                const ffmpegArgs = [
                    '-y',
                    '-i', tempAudioPath,
                    '-i', tempCoverPath,
                    '-map', '0:0',
                    '-map', '1:0',
                    '-c:a', 'copy',  // 音频流复制
                    '-c:v', 'copy',  // 视频(封面)流复制
                    '-id3v2_version', '3',
                    '-metadata:s:v', 'title=Album cover',
                    '-metadata:s:v', 'comment=Cover (front)',
                    '-metadata', `title=${song.name}`,
                    '-metadata', `artist=${artists}`,
                    '-metadata', `album=${song.albuminfo.name}`,
                ];
                
                if (song.publish_date) {
                    ffmpegArgs.push('-metadata', `date=${song.publish_date}`);
                }
                
                ffmpegArgs.push(outputPath);
                
                const process = new Deno.Command('ffmpeg', {
                    args: ffmpegArgs,
                    stdout: 'piped',
                    stderr: 'piped'
                });
                
                const output = await process.output();
                
                if (!output.success) {
                    const stderr = new TextDecoder().decode(output.stderr);
                    throw new Error(`ffmpeg返回错误: ${stderr.slice(0, 200)}`);
                }
                
                // 删除临时文件
                try { await Deno.remove(tempAudioPath); } catch {}
                try { await Deno.remove(tempCoverPath); } catch {}
                
                console.log(`✓ 歌曲 ${song.name} 下载成功 [${selectedQuality}] (已嵌入封面)`);
                
            } catch (e) {
                console.log(`  ffmpeg处理失败: ${(e as Error).message}`);
                console.log(`  保存为原始文件...`);
                
                // ffmpeg失败,保存原始文件
                const fallbackPath = Deno.cwd() + '/' + outDir + safeName + '.' + fileExt;
                try {
                    await Deno.rename(tempAudioPath, fallbackPath);
                    console.log(`✓ 歌曲 ${song.name} 下载成功 [${selectedQuality}] (无封面)`);
                } catch (renameErr) {
                    // rename失败,直接复制
                    const audioBytes = await Deno.readFile(tempAudioPath);
                    await Deno.writeFile(fallbackPath, audioBytes);
                    await Deno.remove(tempAudioPath);
                    console.log(`✓ 歌曲 ${song.name} 下载成功 [${selectedQuality}] (无封面)`);
                }
                
                try { await Deno.remove(tempCoverPath); } catch {}
            }
        } else {
            // 没有封面,直接重命名
            const finalPath = Deno.cwd() + '/' + outDir + safeName + '.' + fileExt;
            try {
                await Deno.rename(tempAudioPath, finalPath);
            } catch {
                // rename失败,直接复制
                const audioBytes = await Deno.readFile(tempAudioPath);
                await Deno.writeFile(finalPath, audioBytes);
                await Deno.remove(tempAudioPath);
            }
            console.log(`✓ 歌曲 ${song.name} 下载成功 [${selectedQuality}] (无封面)`);
        }
        
    } catch (e) {
        console.log(`✗ 歌曲 ${song.name} 下载失败: ${(e as Error).message}`);
    }
}

// 主函数
export default async function main() {
    console.log('=== 酷狗音乐下载器 ===\n');
    console.log('使用说明:');
    console.log('1. 歌单: 打开酷狗歌单页面,按F12打开开发者工具');
    console.log('   搜索 "global_collection_id" 复制其值 (如: collection_3_1281673676_4_0)');
    console.log('2. 单曲: 打开歌曲页面,搜索 "hash" 复制其值 (如: 6E6711F523...)');
    console.log('');
    
    while (true) {
        const input = await readline('\n请输入 collection_id 或 hash (输入 q 退出):');
        
        if (!input || input.toLowerCase() === 'q') {
            console.log('退出程序');
            Deno.exit(0);
        }
        
        try {
            // 判断输入类型
            if (input.startsWith('collection_')) {
                // 歌单
                console.log(`\n解析歌单: ${input}`);
                
                const songs = await getPlaylistTracks(input);
                console.log(`歌单共 ${songs.length} 首歌曲\n`);
                
                for (let i = 0; i < songs.length; i++) {
                    console.log(`[${i + 1}/${songs.length}]`);
                    await downloadSong(songs[i]);
                    // 延迟避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                console.log(`\n✓ 歌单下载完成! 共 ${songs.length} 首`);
                
            } else if (/^[A-F0-9]{32}$/i.test(input)) {
                // 单曲hash
                console.log(`\n解析单曲: ${input}`);
                
                // 先获取歌曲信息
                const urlData = await getSongUrl(input) as SongUrlData;
                
                // 构造临时song对象
                const song: KugouSong = {
                    hash: input,
                    name: urlData.name,
                    audio_id: 0,
                    album_id: '',
                    singerinfo: [{ id: 0, name: urlData.singername, avatar: '' }],
                    albuminfo: { name: urlData.albumname, id: 0 },
                    cover: '', // 单曲模式可能没有封面
                    publish_date: '',
                    timelen: urlData.info.duration
                };
                
                await downloadSong(song);
                console.log(`\n✓ 单曲下载完成!`);
                
            } else {
                console.log('输入格式错误!');
                console.log('- 歌单格式: collection_3_1281673676_4_0');
                console.log('- 单曲格式: 6E6711F523693DA3D2F5CB03AA9024B7 (32位16进制)');
            }
            
        } catch (e) {
            console.log(`错误: ${(e as Error).message}`);
        }
        
        console.log('\n======================================');
    }
}

if (import.meta.main) main();