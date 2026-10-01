import { CommandError } from "../../lib/core/errors.ts";
import { defaultDataDir } from "../../lib/core/context.ts";
import { runJsonStateMigration } from "../../migrations/json_state.ts";

interface Args {
  from?: string;
  to?: string;
  help: boolean;
}

function parse(argv: string[]): Args {
  const args: Args = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") args.help = true;
    else if (arg === "--from") args.from = argv[++i];
    else if (arg === "--to") args.to = argv[++i];
    else throw new CommandError(`Unknown migrate-state option: ${arg}`, 2);
  }
  return args;
}

export async function run(argv: string[]): Promise<void> {
  const args = parse(argv);
  if (args.help) {
    console.log(`Usage:
  denovel migrate-state --from <old-data-dir> [--to <new-data-dir>]

Imports legacy JSON state into the v2 KV store. This command never runs automatically and never deletes old files.`);
    return;
  }
  if (!args.from) throw new CommandError("migrate-state requires --from <old-data-dir>", 2);
  const result = await runJsonStateMigration({
    fromDir: args.from,
    toDir: args.to ?? defaultDataDir(),
  });
  console.log(`Migrated cookies: ${result.cookies}`);
  console.log(`Migrated IP cache entries: ${result.ipCacheEntries}`);
  console.log(`Migrated history entries: ${result.historyEntries}`);
}

export const command = {
  name: "migrate-state",
  description: "Import legacy JSON state into the v2 KV store",
  run,
};
