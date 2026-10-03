import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { downloadTtxsFiles, getTtxsShareFiles, scanTtxsRange } from "../../lib/cloud/ttxs.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel ttxs [options] <share-id>
  denovel ttxs [options] --range <start:end>

Options:
  -d, --data-dir <dir>      v2 data directory
  -o, --outdir <dir>        Output directory (default ./outtxt)
  --download                Download discovered files
  --max-fails <n>           Stop range scan after N consecutive misses`);
    return;
  }
  const args = parse(argv);
  const ctx = await createRuntimeContext({ dataDir: args.dataDir, outputDir: args.outdir ?? "./outtxt" });
  try {
    if (args.range) {
      const [start, end] = parseRange(args.range);
      const results = await scanTtxsRange(ctx, start, end, args.maxFails);
      console.log(JSON.stringify(results, null, 2));
      if (args.download) {
        let count = 0;
        for (const result of results) count += await downloadTtxsFiles(ctx, result, args.outdir ?? "./outtxt");
        console.log(`Downloaded ${count} files.`);
      }
      return;
    }
    if (!args.id) throw new CommandError("ttxs requires <share-id> or --range", 2);
    const result = await getTtxsShareFiles(ctx, args.id);
    console.log(JSON.stringify(result, null, 2));
    if (args.download) {
      const count = await downloadTtxsFiles(ctx, result, args.outdir ?? "./outtxt");
      console.log(`Downloaded ${count} files.`);
    }
  } finally {
    ctx.state.close();
  }
}

function parse(argv: string[]): {
  id?: string;
  range?: string;
  dataDir?: string;
  outdir?: string;
  download?: boolean;
  maxFails?: number;
} {
  const args: ReturnType<typeof parse> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--range") args.range = argv[++i];
    else if (arg === "-d" || arg === "--data-dir") args.dataDir = argv[++i];
    else if (arg === "-o" || arg === "--outdir") args.outdir = argv[++i];
    else if (arg === "--download") args.download = true;
    else if (arg === "--max-fails") args.maxFails = Number.parseInt(argv[++i], 10);
    else if (arg.startsWith("-")) throw new CommandError(`Unknown ttxs option: ${arg}`, 2);
    else if (!args.id) args.id = arg;
    else throw new CommandError(`Unexpected ttxs argument: ${arg}`, 2);
  }
  return args;
}

function parseRange(input: string): [number, number] {
  const match = input.match(/^(\d+):(\d+)$/);
  if (!match) throw new CommandError("range must be start:end", 2);
  return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
}

export const command = {
  name: "ttxs",
  description: "Scan and download ttxiaoshuo shares",
  run,
};
