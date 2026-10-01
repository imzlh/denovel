import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { checkQuarkLogin, downloadQuarkDirectory } from "../../lib/cloud/quark.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel quark [options] <dir-id>

Options:
  -o, --outdir <dir>       Output directory
  -d, --data-dir <dir>     v2 data directory
  --cookie <cookie>        Store and use quark.cn cookie`);
    return;
  }
  const args = parse(argv);
  if (!args.dirId) throw new CommandError("quark requires <dir-id>", 2);
  const ctx = await createRuntimeContext({ dataDir: args.dataDir, outputDir: args.outdir ?? "./qkout" });
  try {
    if (args.cookie) await ctx.cookies.setRawCookie("quark.cn", args.cookie);
    const nickname = await checkQuarkLogin(ctx);
    if (!nickname) throw new CommandError("Quark login failed; pass --cookie", 1);
    console.log(`Logged in as ${nickname}`);
    const result = await downloadQuarkDirectory(ctx, args.dirId, args.outdir ?? "./qkout");
    console.log(`Downloaded ${result.files} files.`);
  } finally {
    ctx.state.close();
  }
}

function parse(argv: string[]): { dirId?: string; outdir?: string; dataDir?: string; cookie?: string } {
  const args: { dirId?: string; outdir?: string; dataDir?: string; cookie?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--outdir") args.outdir = argv[++i];
    else if (arg === "-d" || arg === "--data-dir") args.dataDir = argv[++i];
    else if (arg === "--cookie") args.cookie = argv[++i];
    else if (arg.startsWith("-")) throw new CommandError(`Unknown quark option: ${arg}`, 2);
    else if (!args.dirId) args.dirId = arg;
    else throw new CommandError(`Unexpected quark argument: ${arg}`, 2);
  }
  return args;
}

export const command = {
  name: "quark",
  aliases: ["quarksb"],
  description: "Download Quark cloud files",
  run,
};
