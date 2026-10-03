import { CommandError } from "../../lib/core/errors.ts";
import { createRuntimeContext } from "../../lib/core/context.ts";
import { checkIsTraditional, downloadNovel, resumeNovelFromFile } from "../../lib/core/novel.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel downovel [options] <url|txt-file>
  denovel downovel --resume <txt-file>

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
  if (!args.url && !args.resume) throw new CommandError("downovel requires <url|txt-file> or --resume", 2);
  if (args.url && args.resume) throw new CommandError("downovel accepts either <url> or --resume", 2);
  const ctx = await createRuntimeContext({
    dataDir: args.dataDir,
    outputDir: args.outdir,
    retry: args.retry ? Number.parseInt(args.retry, 10) : undefined,
    timeoutSec: args.timeout ? Number.parseInt(args.timeout, 10) : undefined,
    sleepSec: args.sleep ? Number.parseFloat(args.sleep) : undefined,
  });
  try {
    const resumePath = args.resume ?? (args.url?.toLowerCase().endsWith(".txt") ? args.url : undefined);
    const output = resumePath
      ? await resumeNovelFromFile(ctx, resumePath, {
        bookName: args.name,
        outdir: args.outdir,
        translate: args.translate,
        disableParted: args.parted,
        sleepTime: args.sleep ? Number.parseFloat(args.sleep) : undefined,
      })
      : await downloadNovel(ctx, args.url!, {
        traditional: await checkIsTraditional(new URL(args.url!)),
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
  resume?: string;
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
      case "--resume":
        args.resume = argv[++i];
        if (!args.resume) throw new CommandError("--resume requires a TXT file", 2);
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
