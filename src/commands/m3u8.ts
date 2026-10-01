import { createM3u8ProxyServer } from "../../lib/media/m3u8_proxy.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel m3u8 [options] <m3u8-url>

Options:
  --host <host>       Listen host (default localhost)
  -p, --port <port>   Listen port (default 12345)`);
    return;
  }
  const args = parse(argv);
  if (!args.url) throw new CommandError("m3u8 requires <m3u8-url>", 2);
  const proxy = createM3u8ProxyServer({
    sourceUrl: args.url,
    host: args.host,
    port: args.port,
  });
  console.log(`Source M3U8: ${proxy.sourceUrl}`);
  console.log(`Proxy server: ${proxy.serverUrl}`);
  console.log(`Playlist: ${proxy.serverUrl}/index.m3u8`);
  Deno.serve({ hostname: args.host ?? "localhost", port: args.port ?? 12345 }, proxy.handler);
  await new Promise(() => undefined);
}

interface Args {
  url?: string;
  host?: string;
  port?: number;
}

function parse(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--host":
        args.host = requireValue(argv[++i], arg);
        break;
      case "-p":
      case "--port":
        args.port = parsePort(requireValue(argv[++i], arg));
        break;
      default:
        if (arg.startsWith("-")) throw new CommandError(`Unknown m3u8 option: ${arg}`, 2);
        if (args.url) throw new CommandError(`Unexpected m3u8 argument: ${arg}`, 2);
        args.url = arg;
    }
  }
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
  name: "m3u8",
  aliases: ["specialm3u8"],
  description: "Proxy m3u8 for ffmpeg downloads",
  run,
};
