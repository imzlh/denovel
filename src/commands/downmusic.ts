import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { KugouDownloader, NeteaseDownloader, type DownloadStats } from "../../lib/music/downloader.ts";
import { hasHelp } from "../cli/args.ts";

const NETEASE_COOKIE_HOST = "music.163.com";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log([
      "Usage:",
      "  denovel downmusic [global-options] <provider> <target-type> <id>",
      "",
      "Providers:",
      "  netease song <id>",
      "  netease playlist <id>",
      "  netease album <id>",
      "  netease artist-top <id>",
      "  netease search-song <keywords>",
      "  netease search-artist <keywords>",
      "  netease artist-albums <artist-id>",
      "  kugou hash <hash>",
      "  kugou playlist <collection_id>",
      "",
      "Global options:",
      "  -o, --outdir <dir>       Output directory (default ./musicout)",
      "  -d, --data-dir <dir>     v2 data directory",
      "  --api-base <url>         Provider API base",
      "  --cookie <cookie>        Store and use Netease cookie in KV",
      "  --limit <n>              Search result limit (default 20)",
    ].join("\n"));
    return;
  }

  const args = parse(argv);
  if (!args.provider || !args.targetType || !args.id) {
    throw new CommandError("downmusic requires <provider> <target-type> <id>", 2);
  }

  const ctx = await createRuntimeContext({
    dataDir: args.dataDir,
    outputDir: args.outdir ?? "./musicout",
  });
  try {
    if (args.cookie) await ctx.cookies.setRawCookie(NETEASE_COOKIE_HOST, args.cookie);
    if (args.provider === "netease") {
      await runNetease(args, await ctx.cookies.getCookieHeader(NETEASE_COOKIE_HOST));
    } else if (args.provider === "kugou") {
      await runKugou(args);
    } else {
      throw new CommandError(`Unknown music provider: ${args.provider}`, 2);
    }
  } finally {
    ctx.state.close();
  }
}

async function runNetease(args: Args, cookie: string): Promise<void> {
  const downloader = new NeteaseDownloader({
    apiBase: args.apiBase ?? "http://localhost:3000",
    outputDir: args.outdir ?? "./musicout",
    cookie,
  });
  switch (args.targetType) {
    case "song": {
      const ok = await downloader.downloadSong(args.id!);
      if (!ok) throw new CommandError("song download failed", 1);
      break;
    }
    case "playlist":
      printStats(await downloader.downloadPlaylist(args.id!));
      break;
    case "album":
      printStats(await downloader.downloadAlbum(args.id!));
      break;
    case "artist-top":
      printStats(await downloader.downloadArtistTop(args.id!));
      break;
    case "search-song":
      printNeteaseSongs(await downloader.searchSongs(args.id!, args.limit ?? 20));
      break;
    case "search-artist":
      printNeteaseArtists(await downloader.searchArtists(args.id!, args.limit ?? 20));
      break;
    case "artist-albums":
      printNeteaseAlbums(await downloader.getArtistAlbums(args.id!, args.limit ?? 50));
      break;
    default:
      throw new CommandError(`Unknown netease target type: ${args.targetType}`, 2);
  }
}

async function runKugou(args: Args): Promise<void> {
  const downloader = new KugouDownloader({
    apiBase: args.apiBase ?? "http://localhost:3000",
    outputDir: args.outdir ?? "./musicout",
  });
  switch (args.targetType) {
    case "hash": {
      const ok = await downloader.downloadHash(args.id!);
      if (!ok) throw new CommandError("hash download failed", 1);
      break;
    }
    case "playlist":
      printStats(await downloader.downloadPlaylist(args.id!));
      break;
    default:
      throw new CommandError(`Unknown kugou target type: ${args.targetType}`, 2);
  }
}

function printStats(stats: DownloadStats): void {
  console.log(`Total: ${stats.total}, success: ${stats.success}, failed: ${stats.failed}`);
}

function printNeteaseSongs(songs: Awaited<ReturnType<NeteaseDownloader["searchSongs"]>>): void {
  for (const song of songs) {
    console.log(`${song.id}\t${song.name}\t${song.artists.map((artist) => artist.name).join(",")}\t${song.album?.name ?? ""}`);
  }
}

function printNeteaseArtists(artists: Awaited<ReturnType<NeteaseDownloader["searchArtists"]>>): void {
  for (const artist of artists) {
    console.log(`${artist.id}\t${artist.name}\talbums=${artist.albumSize ?? ""}\tsongs=${artist.musicSize ?? ""}`);
  }
}

function printNeteaseAlbums(albums: Awaited<ReturnType<NeteaseDownloader["getArtistAlbums"]>>): void {
  for (const album of albums) {
    const year = album.publishTime ? new Date(album.publishTime).getFullYear() : "";
    console.log(`${album.id}\t${album.name}\t${year}\tsongs=${album.size ?? ""}`);
  }
}

interface Args {
  provider?: string;
  targetType?: string;
  id?: string;
  outdir?: string;
  dataDir?: string;
  apiBase?: string;
  cookie?: string;
  limit?: number;
}

function parse(argv: string[]): Args {
  const args: Args = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-o":
      case "--outdir":
        args.outdir = requireValue(argv[++i], arg);
        break;
      case "-d":
      case "--data-dir":
        args.dataDir = requireValue(argv[++i], arg);
        break;
      case "--api-base":
        args.apiBase = requireValue(argv[++i], arg);
        break;
      case "--cookie":
        args.cookie = requireValue(argv[++i], arg);
        break;
      case "--limit":
        args.limit = parsePositiveInt(requireValue(argv[++i], arg), arg);
        break;
      default:
        if (arg.startsWith("-")) throw new CommandError(`Unknown downmusic option: ${arg}`, 2);
        positionals.push(arg);
    }
  }
  [args.provider, args.targetType] = positionals;
  args.id = positionals.slice(2).join(" ");
  if (!args.id) args.id = undefined;
  return args;
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) throw new CommandError(`${flag} requires a value`, 2);
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new CommandError(`${flag} must be a positive integer`, 2);
  return parsed;
}

export const command = {
  name: "downmusic",
  description: "Download music",
  run,
};
