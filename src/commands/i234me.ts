import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { downloadI234Books, loginI234 } from "../../lib/cloud/i234me.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel i234me [options]

Options:
  -o, --outdir <dir>       Output directory
  -d, --data-dir <dir>     v2 data directory
  --username <name>        Login username
  --password <pass>        Login password
  --start-page <n>         Start page (default 1)
  --limit <n>              Max books to download`);
    return;
  }
  const args = parse(argv);
  const ctx = await createRuntimeContext({ dataDir: args.dataDir, outputDir: args.outdir ?? "./out" });
  try {
    if (args.username && args.password) await loginI234(ctx, args.username, args.password);
    const count = await downloadI234Books(ctx, args.outdir ?? "./out", {
      startPage: args.startPage,
      limit: args.limit,
    });
    console.log(`Downloaded ${count} books.`);
  } finally {
    ctx.state.close();
  }
}

function parse(argv: string[]): {
  outdir?: string;
  dataDir?: string;
  username?: string;
  password?: string;
  startPage?: number;
  limit?: number;
} {
  const args: ReturnType<typeof parse> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--outdir") args.outdir = argv[++i];
    else if (arg === "-d" || arg === "--data-dir") args.dataDir = argv[++i];
    else if (arg === "--username") args.username = argv[++i];
    else if (arg === "--password") args.password = argv[++i];
    else if (arg === "--start-page") args.startPage = Number.parseInt(argv[++i], 10);
    else if (arg === "--limit") args.limit = Number.parseInt(argv[++i], 10);
    else throw new CommandError(`Unknown i234me option: ${arg}`, 2);
  }
  return args;
}

export const command = {
  name: "i234me",
  description: "Download i234me books",
  run,
};
