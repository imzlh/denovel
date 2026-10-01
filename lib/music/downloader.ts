import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { dirname, join } from "jsr:@std/path";
import { removeIllegalPath } from "../core/fs.ts";

export interface DownloadStats {
  total: number;
  success: number;
  failed: number;
}

export interface MusicLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const consoleMusicLogger: MusicLogger = {
  log: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

export function mergeLrc(lrcA = "", lrcB = ""): string {
  type Line = { t: number; raw: string };
  const parse = (raw: string): Line | null => {
    const match = raw.trim().match(/^(\[\d{2}:\d{2}\.\d{2,3}\]).*$/);
    if (!match) return null;
    const tag = match[1];
    const min = Number(tag.slice(1, 3));
    const sec = Number(tag.slice(4, 6));
    const ms = Number(tag.slice(7, -1).padEnd(3, "0"));
    return { t: min * 60_000 + sec * 1000 + ms, raw };
  };
  const seen = new Set<number>();
  return [...lrcA.split("\n"), ...lrcB.split("\n")]
    .map(parse)
    .filter((line): line is Line => line !== null)
    .filter((line) => {
      if (seen.has(line.t)) return false;
      seen.add(line.t);
      return true;
    })
    .toSorted((a, b) => a.t - b.t)
    .map((line) => line.raw)
    .join("\n");
}

export interface NeteaseOptions {
  apiBase: string;
  outputDir: string;
  cookie?: string;
  logger?: MusicLogger;
}

interface NeteaseSong {
  id: number;
  name: string;
  ar: Array<{ id: number; name: string }>;
  al: { id: number; name: string; picUrl: string };
  publishTime: number;
}

interface AudioSource {
  url: string;
  type: string;
  size: number;
  level: string;
  br: number;
}

export interface NeteaseSearchSong {
  id: number;
  name: string;
  artists: Array<{ id: number; name: string }>;
  album?: { id: number; name: string };
}

export interface NeteaseSearchArtist {
  id: number;
  name: string;
  picUrl?: string;
  albumSize?: number;
  musicSize?: number;
}

export interface NeteaseAlbum {
  id: number;
  name: string;
  picUrl?: string;
  publishTime?: number;
  size?: number;
}

export class NeteaseDownloader {
  private readonly logger: MusicLogger;

  constructor(private readonly options: NeteaseOptions) {
    this.logger = options.logger ?? consoleMusicLogger;
  }

  async downloadSong(id: string | number, outputDir = this.options.outputDir): Promise<boolean> {
    const songs = await this.getSongsInfo([id]);
    if (!songs.length) throw new Error(`Song not found: ${id}`);
    await ensureDir(outputDir);
    return await this.writeSong(songs[0], outputDir);
  }

  async downloadPlaylist(id: string | number): Promise<DownloadStats> {
    const playlist = await this.getPlaylist(id);
    const songs: NeteaseSong[] = [];
    for (let i = 0; i < playlist.trackIds.length; i += 10) {
      songs.push(...await this.getSongsInfo(playlist.trackIds.slice(i, i + 10)));
    }
    const dir = join(this.options.outputDir, removeIllegalPath(`歌单_${playlist.name}`));
    await ensureDir(dir);
    const stats = await this.writeSongs(songs, dir);
    await this.writeInfo(dir, {
      type: "playlist",
      name: playlist.name,
      creator: playlist.creator,
      description: playlist.description,
      tags: playlist.tags,
      total: stats.total,
      downloaded: stats.success,
    });
    return stats;
  }

  async downloadAlbum(id: string | number): Promise<DownloadStats> {
    const { album, songs } = await this.getAlbumDetail(id);
    const dir = join(this.options.outputDir, removeIllegalPath(`专辑_${album.name}`));
    await ensureDir(dir);
    const stats = await this.writeSongs(songs, dir);
    await this.writeInfo(dir, {
      type: "album",
      name: album.name,
      creator: album.artist?.name,
      total: stats.total,
      downloaded: stats.success,
    });
    return stats;
  }

  async downloadArtistTop(id: string | number): Promise<DownloadStats> {
    const artist = await this.getArtistInfo(id);
    const songs = await this.request<{ songs: NeteaseSong[] }>(`/artist/top/song?id=${id}`).then((data) => data.songs);
    const dir = join(this.options.outputDir, removeIllegalPath(`歌手_${artist.name}_热门50首`));
    await ensureDir(dir);
    const stats = await this.writeSongs(songs, dir);
    await this.writeInfo(dir, {
      type: "artist",
      name: artist.name,
      description: "热门50首歌曲",
      total: stats.total,
      downloaded: stats.success,
    });
    return stats;
  }

  async searchSongs(keywords: string, limit = 20): Promise<NeteaseSearchSong[]> {
    const data = await this.request<Record<string, any>>(
      `/search?keywords=${encodeURIComponent(keywords)}&type=1&limit=${limit}`,
    );
    return (data.result?.songs ?? []).map((song: Record<string, any>) => ({
      id: song.id,
      name: song.name,
      artists: song.artists ?? song.ar ?? [],
      album: song.album ?? song.al,
    }));
  }

  async searchArtists(keywords: string, limit = 20): Promise<NeteaseSearchArtist[]> {
    const data = await this.request<Record<string, any>>(
      `/search?keywords=${encodeURIComponent(keywords)}&type=100&limit=${limit}`,
    );
    return data.result?.artists ?? [];
  }

  async getArtistAlbums(id: string | number, limit = 50): Promise<NeteaseAlbum[]> {
    const albums: NeteaseAlbum[] = [];
    let offset = 0;
    while (true) {
      const data = await this.request<Record<string, any>>(`/artist/album?id=${id}&limit=${limit}&offset=${offset}`);
      albums.push(...(data.hotAlbums ?? []));
      if (!data.more) break;
      offset += limit;
    }
    return albums;
  }

  async setCookie(cookie: string): Promise<void> {
    this.options.cookie = cookie;
  }

  private async getPlaylist(id: string | number): Promise<{
    name: string;
    creator: string;
    description: string;
    trackIds: Array<string | number>;
    tags: string[];
  }> {
    return await this.request<Record<string, any>>(`/playlist/detail?id=${id}`).then((data) => ({
      name: data.playlist.name,
      creator: data.playlist.creator.nickname,
      description: data.playlist.description,
      trackIds: data.playlist.trackIds.map((item: { id: string | number }) => item.id),
      tags: data.playlist.tags,
    }));
  }

  private async getSongsInfo(ids: Array<string | number>): Promise<NeteaseSong[]> {
    return await this.request<{ songs: NeteaseSong[] }>(`/song/detail?ids=${ids.join(",")}`).then((data) => data.songs);
  }

  private async getAlbumDetail(id: string | number): Promise<{ album: Record<string, any>; songs: NeteaseSong[] }> {
    return await this.request<Record<string, any>>(`/album?id=${id}`).then((data) => ({
      album: data.album,
      songs: data.songs as NeteaseSong[],
    }));
  }

  private async getArtistInfo(id: string | number): Promise<{ id: number; name: string }> {
    return await this.request<Record<string, any>>(`/artists?id=${id}`).then((data) => data.artist);
  }

  private async getAudioSource(id: string | number): Promise<AudioSource | null> {
    const levels = [{ level: "standard", name: "标准" }];
    for (const level of levels) {
      const data = await this.request<Record<string, any>>(`/song/url/v1?id=${id}&level=${level.level}`);
      const item = data.data?.[0];
      if (item?.url) {
        return {
          url: item.url,
          type: item.type || level.level,
          size: item.size || 0,
          level: level.name,
          br: item.br || 0,
        };
      }
    }
    return null;
  }

  private async getLyric(id: string | number): Promise<string | undefined> {
    return await this.request<Record<string, any>>(`/lyric?id=${id}`)
      .then((data) => mergeLrc(data.lrc?.lyric, data.tlyric?.lyric) || undefined)
      .catch(() => undefined);
  }

  private async writeSongs(songs: NeteaseSong[], dir: string): Promise<DownloadStats> {
    const stats: DownloadStats = { total: songs.length, success: 0, failed: 0 };
    for (const song of songs) {
      if (await this.writeSong(song, dir)) stats.success++;
      else stats.failed++;
    }
    return stats;
  }

  private async writeSong(song: NeteaseSong, dir: string): Promise<boolean> {
    const safeName = removeIllegalPath(`${song.name}-${song.ar.map((artist) => artist.name).join(",")}`);
    const outputPath = join(dir, `${safeName}.mp3`);
    let audioTempPath: string | undefined;
    let coverPath: string | undefined;
    try {
      const [source, lyric] = await Promise.all([this.getAudioSource(song.id), this.getLyric(song.id)]);
      if (!source) throw new Error("no audio source");
      const audioRes = await fetch(source.url);
      if (!audioRes.ok) throw new Error(`audio HTTP ${audioRes.status}`);
      const audioData = await audioRes.bytes();
      if (audioData.length < 1024) throw new Error("audio data too small");
      audioTempPath = await Deno.makeTempFile({ suffix: ".tmp" });
      await Deno.writeFile(audioTempPath, audioData);

      if (song.al.picUrl) {
        try {
          const coverRes = await fetch(song.al.picUrl);
          if (coverRes.ok) {
            coverPath = await Deno.makeTempFile({ suffix: ".jpg" });
            await Deno.writeFile(coverPath, await coverRes.bytes());
          }
        } catch {
          coverPath = undefined;
        }
      }

      await ensureDir(dirname(outputPath));
      await runFfmpeg(buildNeteaseFfmpegArgs(song, audioTempPath, coverPath, outputPath));
      if (lyric) await Deno.writeTextFile(join(dir, `${safeName}.lrc`), lyric);
      this.logger.log(`${song.name} [${source.level}]`);
      return true;
    } catch (error) {
      this.logger.error(`${song.name}: ${error instanceof Error ? error.message : String(error)}`);
      try {
        await Deno.remove(outputPath);
      } catch {
        // ignore cleanup failure
      }
      return false;
    } finally {
      if (audioTempPath) await Deno.remove(audioTempPath).catch(() => undefined);
      if (coverPath) await Deno.remove(coverPath).catch(() => undefined);
    }
  }

  private async writeInfo(dir: string, info: Record<string, any>): Promise<void> {
    const content = [
      "==========================================",
      `${info.type === "playlist" ? "歌单" : info.type === "artist" ? "歌手" : "专辑"}信息`,
      "==========================================",
      "",
      `名称: ${info.name}`,
      info.creator ? `创建者: ${info.creator}` : "",
      info.tags?.length ? `标签: ${info.tags.join(", ")}` : "",
      info.description ? `\n描述:\n${info.description}` : "",
      info.total ? `\n总歌曲数: ${info.total}` : "",
      info.downloaded !== undefined ? `成功下载: ${info.downloaded}` : "",
      `下载日期: ${new Date().toLocaleString()}`,
      "",
    ].filter(Boolean).join("\n");
    await Deno.writeTextFile(join(dir, "info.txt"), content);
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(new URL(path, this.options.apiBase), {
      headers: this.options.cookie ? { Cookie: this.options.cookie } : undefined,
    });
    if (!response.ok) throw new Error(`API HTTP ${response.status}: ${path}`);
    return await response.json() as T;
  }
}

export interface KugouOptions {
  apiBase: string;
  outputDir: string;
  logger?: MusicLogger;
}

interface KugouSong {
  hash: string;
  name: string;
  singerinfo: Array<{ name: string }>;
  albuminfo: { name: string };
  cover: string;
  publish_date: string;
  timelen: number;
}

export class KugouDownloader {
  private readonly logger: MusicLogger;

  constructor(private readonly options: KugouOptions) {
    this.logger = options.logger ?? consoleMusicLogger;
  }

  async downloadHash(hash: string): Promise<boolean> {
    const urlData = await this.getSongUrl(hash);
    const song: KugouSong = {
      hash,
      name: urlData.name,
      singerinfo: [{ name: urlData.singername }],
      albuminfo: { name: urlData.albumname },
      cover: "",
      publish_date: "",
      timelen: urlData.info?.duration ?? 0,
    };
    await ensureDir(this.options.outputDir);
    return await this.writeSong(song);
  }

  async downloadPlaylist(collectionId: string): Promise<DownloadStats> {
    const songs = await this.request<Record<string, any>>(`/playlist/track/all?id=${collectionId}`)
      .then((data) => data.data.songs as KugouSong[]);
    await ensureDir(this.options.outputDir);
    const stats: DownloadStats = { total: songs.length, success: 0, failed: 0 };
    for (const song of songs) {
      if (await this.writeSong(song)) stats.success++;
      else stats.failed++;
    }
    return stats;
  }

  private async writeSong(song: KugouSong): Promise<boolean> {
    try {
      const urlData = await this.getSongUrl(song.hash);
      const picked = pickKugouAudio(urlData);
      if (!picked.url) throw new Error("no audio source");
      const audioResponse = await fetch(picked.url);
      if (!audioResponse.ok) throw new Error(`audio HTTP ${audioResponse.status}`);
      const audioData = await audioResponse.arrayBuffer();
      if (audioData.byteLength < 100 * 1024) throw new Error(`audio too small: ${audioData.byteLength}`);

      const artists = song.singerinfo.map((artist) => artist.name).join(",");
      const safeName = removeIllegalPath(`${song.name}-${artists}`);
      const finalPath = join(this.options.outputDir, `${safeName}.${picked.ext}`);
      await Deno.writeFile(finalPath, new Uint8Array(audioData));
      this.logger.log(`${song.name} [${picked.quality}]`);
      return true;
    } catch (error) {
      this.logger.error(`${song.name}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async getSongUrl(hash: string): Promise<Record<string, any>> {
    return await this.request<Record<string, any>>(`/song/url/new?hash=${hash}`).then((data) => data.data[0]);
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(new URL(path, this.options.apiBase));
    if (!response.ok) throw new Error(`API HTTP ${response.status}: ${path}`);
    return await response.json() as T;
  }
}

function pickKugouAudio(urlData: Record<string, any>): { url: string; ext: string; quality: string } {
  for (const item of urlData.relate_goods ?? []) {
    if ((item.level === 4 || item.level === 5) && item.info?.tracker_url?.length) {
      return {
        url: item.info.tracker_url[0],
        ext: item.info.extname || "mp3",
        quality: item.quality || "high",
      };
    }
  }
  if (urlData.info?.tracker_url?.length) {
    return {
      url: urlData.info.tracker_url[0],
      ext: urlData.info.extname || "mp3",
      quality: "standard",
    };
  }
  for (const item of urlData.relate_goods ?? []) {
    const url = item.info?.tracker_url?.find((candidate: string) => candidate.endsWith(".flac") || candidate.endsWith(".mp3"));
    if (url) {
      return {
        url,
        ext: url.endsWith(".flac") ? "flac" : "mp3",
        quality: item.quality || "fallback",
      };
    }
  }
  return { url: "", ext: "mp3", quality: "none" };
}

function buildNeteaseFfmpegArgs(song: NeteaseSong, audioPath: string, coverPath: string | undefined, outputPath: string): string[] {
  const metadata = [
    "-metadata",
    `title=${song.name}`,
    "-metadata",
    `artist=${song.ar.map((artist) => artist.name).join(",")}`,
    "-metadata",
    `album=${song.al.name}`,
    "-metadata",
    `date=${new Date(song.publishTime).getFullYear()}`,
  ];
  if (!coverPath) {
    return ["-hide_banner", "-loglevel", "error", "-i", audioPath, "-map", "0:a:0", "-c", "copy", "-id3v2_version", "3", ...metadata, "-y", outputPath];
  }
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    audioPath,
    "-i",
    coverPath,
    "-map",
    "0:a",
    "-map",
    "1",
    "-c",
    "copy",
    "-id3v2_version",
    "3",
    ...metadata,
    "-disposition:v:0",
    "attached_pic",
    "-y",
    outputPath,
  ];
}

async function runFfmpeg(args: string[]): Promise<void> {
  const result = await new Deno.Command("ffmpeg", { args, stdout: "piped", stderr: "piped" }).output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
}
