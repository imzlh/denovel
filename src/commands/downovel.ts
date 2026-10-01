import { CommandError } from "../../lib/core/errors.ts";
import { createRuntimeContext } from "../../lib/core/context.ts";
import { checkIsTraditional, downloadNovel } from "../../lib/core/novel.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel downovel [options] <url>

Options:
  -n, --name <name>       Book name when adapter cannot infer it
  -o, --outdir <dir>      Output directory
  -s, --sleep <sec>       Sleep interval between chapters
  -r, --retry <count>     Fetch retry count
  -t, --timeout <sec>     Fetch timeout
  -d, --data-dir <dir>    v2 data directory
  -l, --translate         Convert traditional text to simplified
  -p, --parted            Do not insert generated chapter headings
  -w, --no-overwrite      Append instead of overwriting existing output`);
    return;
  }

  const args = parse(argv);
  const url = args.url;
  if (!url) throw new CommandError("downovel requires <url>", 2);
  const ctx = await createRuntimeContext({
    dataDir: args.dataDir,
    outputDir: args.outdir,
    retry: args.retry ? Number.parseInt(args.retry, 10) : undefined,
    timeoutSec: args.timeout ? Number.parseInt(args.timeout, 10) : undefined,
    sleepSec: args.sleep ? Number.parseFloat(args.sleep) : undefined,
  });
  try {
    const traditional = await checkIsTraditional(new URL(url));
    const output = await downloadNovel(ctx, url, {
      traditional,
      bookName: args.name,
      outdir: args.outdir,
      translate: args.translate,
      disableParted: args.parted,
      sleepTime: args.sleep ? Number.parseFloat(args.sleep) : undefined,
      disableOverwrite: args.noOverwrite,
    });
    if (!output) throw new CommandError("download produced no output", 1);
  } finally {
    ctx.state.close();
  }
}

export const command = {
  name: "downovel",
  description: "Download a novel",
  run,
};

interface Args {
  url?: string;
  name?: string;
  outdir?: string;
  sleep?: string;
  retry?: string;
  timeout?: string;
  dataDir?: string;
  translate?: boolean;
  parted?: boolean;
  noOverwrite?: boolean;
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
      case "-r":
      case "--retry":
        args.retry = argv[++i];
        break;
      case "-t":
      case "--timeout":
        args.timeout = argv[++i];
        break;
      case "-d":
      case "--data-dir":
        args.dataDir = argv[++i];
        break;
      case "-l":
      case "--translate":
        args.translate = true;
        break;
      case "-p":
      case "--parted":
        args.parted = true;
        break;
      case "-w":
      case "--no-overwrite":
        args.noOverwrite = true;
        break;
      default:
        if (arg.startsWith("-")) throw new CommandError(`Unknown downovel option: ${arg}`, 2);
        if (args.url) throw new CommandError(`Unexpected downovel argument: ${arg}`, 2);
        args.url = arg;
    }
  }
  return args;
}
