import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { hasHelp } from "../cli/args.ts";

const TRANSCHINESE_MODULE = "../../lib/sites-tools/transchinese.ts";

interface TransChineseModule {
  downloadTransChinese(
    ctx: Awaited<ReturnType<typeof createRuntimeContext>>,
    indexUrl: string,
    options: { outputDir: string; convertTxtToEpub?: boolean },
  ): Promise<number>;
}

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel transchinese [options] <index-url>

Options:
  -o, --outdir <dir>     Output directory (default ./transout)
  -d, --data-dir <dir>   v2 data directory
  --epub                 Convert downloaded txt files to epub`);
    return;
  }
  const args = parse(argv);
  if (!args.url) throw new CommandError("transchinese requires <index-url>", 2);
  const ctx = await createRuntimeContext({ dataDir: args.dataDir, outputDir: args.outdir ?? "./transout" });
  try {
    const { downloadTransChinese } = await import(TRANSCHINESE_MODULE) as TransChineseModule;
    const count = await downloadTransChinese(ctx, args.url, {
      outputDir: args.outdir ?? "./transout",
      convertTxtToEpub: args.epub,
    });
    console.log(`Downloaded ${count} books.`);
  } finally {
    ctx.state.close();
  }
}

function parse(argv: string[]): { url?: string; outdir?: string; dataDir?: string; epub?: boolean } {
  const args: { url?: string; outdir?: string; dataDir?: string; epub?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--outdir") args.outdir = argv[++i];
    else if (arg === "-d" || arg === "--data-dir") args.dataDir = argv[++i];
    else if (arg === "--epub") args.epub = true;
    else if (arg.startsWith("-")) throw new CommandError(`Unknown transchinese option: ${arg}`, 2);
    else if (!args.url) args.url = arg;
    else throw new CommandError(`Unexpected transchinese argument: ${arg}`, 2);
  }
  return args;
}

export const command = {
  name: "transchinese",
  description: "Download transchinese novel index",
  run,
};
