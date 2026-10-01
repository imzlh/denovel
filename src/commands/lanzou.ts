import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { downloadLanzou, listLanzouFiles } from "../../lib/cloud/lanzou.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel lanzou [options] <share-url>

Options:
  -o, --outdir <dir>       Output directory (default ./lanout)
  -d, --data-dir <dir>     v2 data directory for cookies/cache
  -c, --concurrency <n>    Parallel downloads (default 8)
  --list-only              Print discovered files as JSON and do not download`);
    return;
  }
  const args = parse(argv);
  if (!args.url) throw new CommandError("lanzou requires <share-url>", 2);
  const ctx = await createRuntimeContext({
    dataDir: args.dataDir,
    outputDir: args.outdir ?? "./lanout",
  });
  try {
    if (args.listOnly) {
      console.log(JSON.stringify(await listLanzouFiles(ctx, args.url), null, 2));
      return;
    }
    const result = await downloadLanzou(ctx, args.url, {
      outputDir: args.outdir ?? "./lanout",
      concurrency: args.concurrency,
    });
    console.log(`Downloaded ${result.files} files (${result.bytes} bytes declared).`);
  } finally {
    ctx.state.close();
  }
}

interface Args {
  url?: string;
  outdir?: string;
  dataDir?: string;
  concurrency?: number;
  listOnly?: boolean;
}

function parse(argv: string[]): Args {
  const args: Args = {};
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
      case "-c":
      case "--concurrency":
        args.concurrency = parsePositiveInt(requireValue(argv[++i], arg), arg);
        break;
      case "--list-only":
        args.listOnly = true;
        break;
      default:
        if (arg.startsWith("-")) throw new CommandError(`Unknown lanzou option: ${arg}`, 2);
        if (args.url) throw new CommandError(`Unexpected lanzou argument: ${arg}`, 2);
        args.url = arg;
    }
  }
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
  name: "lanzou",
  aliases: ["lanzoudl"],
  description: "Download Lanzou share files",
  run,
};
