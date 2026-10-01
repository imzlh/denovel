import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import {
  createSeventeenApiHandler,
  createSeventeenSession,
  downloadSeventeenVideo,
  getSeventeenVideoInfo,
  searchSeventeen,
} from "../../lib/media/seventeen.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel 17c [global-options] <command> [...args]

Commands:
  search <keywords>          Print search results as JSON
  info <videoplay-url>       Print video metadata as JSON
  download <videoplay-url>   Download one video with ffmpeg
  server                     Start JSON API server

Global options:
  -d, --data-dir <dir>       v2 data directory
  -o, --outdir <dir>         Output directory (default ./webo)
  --base <url>               Override resolved 17c base URL
  --host <host>              Server host (default 0.0.0.0)
  -p, --port <port>          Server port (default 8088)
  -f, --force                Ignore existing download history`);
    return;
  }

  const args = parse(argv);
  if (!args.command) throw new CommandError("17c requires <command>", 2);
  const ctx = await createRuntimeContext({
    dataDir: args.dataDir,
    outputDir: args.outdir ?? "./webo",
  });
  try {
    const session = await createSeventeenSession(ctx, args.base);
    switch (args.command) {
      case "search": {
        const keywords = args.rest.join(" ");
        if (!keywords) throw new CommandError("17c search requires <keywords>", 2);
        const result = await searchSeventeen(ctx, session, keywords);
        console.log(JSON.stringify({ ...result, videos: result.videos.map(String) }, null, 2));
        break;
      }
      case "info": {
        const url = args.rest[0];
        if (!url) throw new CommandError("17c info requires <videoplay-url>", 2);
        console.log(JSON.stringify(await getSeventeenVideoInfo(ctx, session, url), null, 2));
        break;
      }
      case "download": {
        const url = args.rest[0];
        if (!url) throw new CommandError("17c download requires <videoplay-url>", 2);
        const output = await downloadSeventeenVideo(ctx, session, url, args.outdir ?? "./webo", { force: args.force });
        console.log(`Downloaded: ${output}`);
        break;
      }
      case "server": {
        const host = args.host ?? "0.0.0.0";
        const port = args.port ?? 8088;
        const handler = createSeventeenApiHandler(ctx, session, args.outdir ?? "./webo");
        console.log(`17c API server: http://${host}:${port}`);
        Deno.serve({ hostname: host, port }, handler);
        await new Promise(() => undefined);
        break;
      }
      default:
        throw new CommandError(`Unknown 17c command: ${args.command}`, 2);
    }
  } finally {
    ctx.state.close();
  }
}

interface Args {
  command?: string;
  rest: string[];
  dataDir?: string;
  outdir?: string;
  base?: string;
  host?: string;
  port?: number;
  force?: boolean;
}

function parse(argv: string[]): Args {
  const args: Args = { rest: [] };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-d":
      case "--data-dir":
        args.dataDir = requireValue(argv[++i], arg);
        break;
      case "-o":
      case "--outdir":
        args.outdir = requireValue(argv[++i], arg);
        break;
      case "--base":
        args.base = requireValue(argv[++i], arg);
        break;
      case "--host":
        args.host = requireValue(argv[++i], arg);
        break;
      case "-p":
      case "--port":
        args.port = parsePort(requireValue(argv[++i], arg));
        break;
      case "-f":
      case "--force":
        args.force = true;
        break;
      default:
        if (arg.startsWith("-")) throw new CommandError(`Unknown 17c option: ${arg}`, 2);
        positionals.push(arg);
    }
  }
  args.command = positionals[0];
  args.rest = positionals.slice(1);
  return args;
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) throw new CommandError(`${flag} requires a value`, 2);
  return value;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CommandError("port must be 1-65535", 2);
  return port;
}

export const command = {
  name: "17c",
  description: "Run the 17c downloader",
  run,
};
