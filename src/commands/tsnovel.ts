import { createRuntimeContext } from "../../lib/core/context.ts";
import { CommandError } from "../../lib/core/errors.ts";
import { buildTsNovelDb, findTsNovel, scanTsNovelFiles, updateTsNovelDb } from "../../lib/sites-tools/tsnovel.ts";
import { hasHelp } from "../cli/args.ts";

export async function run(argv: string[]): Promise<void> {
  if (hasHelp(argv)) {
    console.log(`Usage:
  denovel tsnovel [options] <command> [...args]

Commands:
  build                    Build local tsnovel index
  update                   Update local tsnovel index
  search <name>            Search by exact novel name
  scan <dir> [link-dir]    Scan local txt files and optionally hard-link matches

Options:
  -d, --data-dir <dir>     v2 data directory`);
    return;
  }
  const args = parse(argv);
  if (!args.command) throw new CommandError("tsnovel requires <command>", 2);
  const ctx = await createRuntimeContext({ dataDir: args.dataDir });
  try {
    switch (args.command) {
      case "build":
        console.log(`Indexed ${await buildTsNovelDb(ctx)} novels.`);
        break;
      case "update": {
        const records = await updateTsNovelDb(ctx);
        console.log(`Updated ${records.length} novels.`);
        break;
      }
      case "search": {
        const name = args.rest.join(" ");
        if (!name) throw new CommandError("tsnovel search requires <name>", 2);
        console.log(JSON.stringify(await findTsNovel(ctx, name), null, 2));
        break;
      }
      case "scan": {
        const dir = args.rest[0];
        if (!dir) throw new CommandError("tsnovel scan requires <dir>", 2);
        const found = await scanTsNovelFiles(ctx, dir, args.rest[1]);
        console.log(JSON.stringify(found, null, 2));
        break;
      }
      default:
        throw new CommandError(`Unknown tsnovel command: ${args.command}`, 2);
    }
  } finally {
    ctx.state.close();
  }
}

function parse(argv: string[]): { dataDir?: string; command?: string; rest: string[] } {
  const args: { dataDir?: string; command?: string; rest: string[] } = { rest: [] };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-d" || arg === "--data-dir") args.dataDir = argv[++i];
    else if (arg.startsWith("-")) throw new CommandError(`Unknown tsnovel option: ${arg}`, 2);
    else positional.push(arg);
  }
  args.command = positional[0];
  args.rest = positional.slice(1);
  return args;
}

export const command = {
  name: "tsnovel",
  description: "Build and query local tsnovel index",
  run,
};
