import { CommandError } from "../../lib/core/errors.ts";
import { createRuntimeContext } from "../../lib/core/context.ts";
import { downloadComic } from "../../lib/core/comic.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel downcomic [options] <url>

Options:
  -n, --name <name>       Comic name
  -o, --outdir <dir>      Output directory
  -s, --sleep <sec>       Max sleep interval between pages
  -c, --cover <url>       Cover URL
  -d, --data-dir <dir>    v2 data directory`);
    return;
  }
  const args = parse(argv);
  if (!args.url) throw new CommandError("downcomic requires <url>", 2);
  const ctx = await createRuntimeContext({
    dataDir: args.dataDir,
    outputDir: args.outdir,
    sleepSec: args.sleep ? Number.parseFloat(args.sleep) : undefined,
  });
  try {
    const folder = await downloadComic(ctx, args.url, {
      name: args.name,
      outdir: args.outdir,
      cover: args.cover,
      sleepSec: args.sleep ? Number.parseFloat(args.sleep) : undefined,
    });
    console.log(`Saved: ${folder}`);
  } finally {
    ctx.state.close();
  }
}

interface Args {
  url?: string;
  name?: string;
  outdir?: string;
  sleep?: string;
  cover?: string;
  dataDir?: string;
}

function parse(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-n":
      case "--name":
        args.name = argv[++i];
        break;
      case "-o":
      case "--outdir":
        args.outdir = argv[++i];
        break;
      case "-s":
      case "--sleep":
        args.sleep = argv[++i];
        break;
      case "-c":
      case "--cover":
        args.cover = argv[++i];
        break;
      case "-d":
      case "--data-dir":
        args.dataDir = argv[++i];
        break;
      default:
        if (arg.startsWith("-")) throw new CommandError(`Unknown downcomic option: ${arg}`, 2);
        if (args.url) throw new CommandError(`Unexpected downcomic argument: ${arg}`, 2);
        args.url = arg;
    }
  }
  return args;
}

export const command = {
  name: "downcomic",
  aliases: ["comic"],
  description: "Download a comic",
  run,
};
